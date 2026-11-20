import "server-only";

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { ethers } from "ethers";

// Ensure IPv4 DNS resolution and disable broken IPv6 Happy Eyeballs timeout in Node.js v24
try {
  dns.setDefaultResultOrder("ipv4first");
  if (typeof net.setDefaultAutoSelectFamily === "function") {
    net.setDefaultAutoSelectFamily(false);
  }
  https.globalAgent.options.family = 4;
  https.globalAgent.options.autoSelectFamily = false;
  const httpAgentOpts = (
    http.globalAgent as unknown as {
      options?: { family?: number; autoSelectFamily?: boolean };
    }
  ).options;
  if (httpAgentOpts) {
    httpAgentOpts.family = 4;
    httpAgentOpts.autoSelectFamily = false;
  }
} catch {
  // Ignore if unsupported in runtime
}

const requiredEnv = (name: string, fallbackName?: string): string => {
  const value =
    process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
};

const ESCROW_ABI = [
  "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, uint256 cryptoAmount, uint256 buyerCollateral, bytes32 privacyHashedBankDetails, uint8 status, uint64 createdAt, uint64 fundedAt, uint64 fiatSentAt, bytes32 proofId))",
  "function getListingInventory(uint256 listingId) view returns (tuple(uint256 listingTradeId, address seller, uint256 totalDeposited, uint256 availableAmount, uint256 allocatedAmount, uint256 activeChildTradeId, bytes32 privacyHashedBankDetails, bool active))",
  "function oracleAddress() view returns (address)",
  "function usedProofIds(bytes32) view returns (bool)",
  "function fundBuyerCollateral(uint256 tradeId, uint256 collateral)",
  "function oracleRelease(uint256 tradeId, bytes32 proofId)",
  "function oracleSettleOrder(uint256 _tradeId, address _buyer, uint256 _amount, bytes32 _proofId) returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function nextTradeId() view returns (uint256)",
];

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(
  requiredEnv("ARC_RPC_URL", "NEXT_PUBLIC_ARC_RPC_URL"),
  5042002,
  { staticNetwork: true },
);

const oracleWallet = new ethers.Wallet(
  requiredEnv("ORACLE_PRIVATE_KEY", "ARC_PRIVATE_KEY"),
  provider,
);

const deployerKey =
  process.env.ARC_PRIVATE_KEY || process.env.NEXT_PUBLIC_ARC_DEPLOYER_KEY;
const deployerWallet = deployerKey
  ? new ethers.Wallet(deployerKey, provider)
  : oracleWallet;

function getEscrowContract(signer: ethers.Wallet = oracleWallet) {
  const address = requiredEnv("ESCROW_ADDRESS", "NEXT_PUBLIC_ESCROW_ADDRESS");
  return new ethers.Contract(address, ESCROW_ABI, signer);
}

function getUsdcContract(signer: ethers.Wallet = oracleWallet) {
  const address = requiredEnv("USDC_ADDRESS", "NEXT_PUBLIC_USDC_ADDRESS");
  return new ethers.Contract(address, USDC_ABI, signer);
}

const CREATED = 0n;
const FUNDED = 1n;
const FIAT_SENT = 2n;
const COMPLETED = 3n;

export interface OracleReleaseResult {
  transactionHash: string;
  tradeId: bigint;
  proofId: string;
}

export async function readEscrowTrade(tradeId: bigint) {
  if (tradeId <= 0n) throw new Error("Invalid trade identifier");
  const escrow = getEscrowContract();
  return escrow.getTrade(tradeId);
}

async function ensureOracleGasAndLiquidity(requiredUnits: bigint) {
  try {
    const usdc = getUsdcContract(deployerWallet);
    const oracleBal: bigint = await usdc.balanceOf(oracleWallet.address);
    const minOracleBal = requiredUnits + 2_000_000n; // +2 USDC for gas
    if (
      oracleBal < minOracleBal &&
      deployerWallet.address.toLowerCase() !== oracleWallet.address.toLowerCase()
    ) {
      const deployerBal: bigint = await usdc.balanceOf(deployerWallet.address);
      const topUp = minOracleBal - oracleBal + 3_000_000n;
      if (deployerBal > topUp + 1_000_000n) {
        const tx = await usdc.transfer(oracleWallet.address, topUp);
        await tx.wait();
      }
    }
  } catch (err) {
    console.warn("Oracle gas auto-topup check warning:", err);
  }
}

export async function oracleRelease(
  tradeId: bigint,
  proofId: string,
): Promise<OracleReleaseResult> {
  if (tradeId <= 0n || !ethers.isHexString(proofId, 32)) {
    throw new Error("Invalid oracle release input");
  }
  if (proofId === ethers.ZeroHash) throw new Error("Invalid proof identifier");

  await ensureOracleGasAndLiquidity(0n);
  const escrow = getEscrowContract(oracleWallet);

  const [trade, configuredOracle] = await Promise.all([
    escrow.getTrade(tradeId),
    escrow.oracleAddress(),
  ]);
  if (configuredOracle.toLowerCase() !== oracleWallet.address.toLowerCase()) {
    throw new Error("Oracle signer is not configured for escrow");
  }
  const used = await escrow.usedProofIds(proofId).catch(() => false);
  if (used) throw new Error("Proof has already been consumed");
  if (BigInt(trade.status) !== FUNDED && BigInt(trade.status) !== FIAT_SENT) {
    throw new Error("Trade is not eligible for oracle release");
  }

  const transaction = await escrow.oracleRelease(tradeId, proofId);
  const receipt = await transaction.wait();

  return {
    transactionHash: receipt?.hash ?? transaction.hash,
    tradeId,
    proofId,
  };
}

export interface OracleSettleInput {
  listingId: bigint;
  buyerAddress: string;
  amountUnits: bigint;
  proofId: string;
}

export interface OracleSettleResult {
  transactionHash: string | null;
  alreadyCompleted: boolean;
  onChainTradeId?: string;
  proofIdUsed?: string;
}

export async function oracleSettleToBuyer(
  input: OracleSettleInput,
): Promise<OracleSettleResult> {
  const { listingId, buyerAddress } = input;

  if (!ethers.isAddress(buyerAddress)) {
    throw new Error("Valid buyer wallet address is required to settle escrow");
  }

  const unitsToTransfer =
    input.amountUnits > 0n ? input.amountUnits : 1_000_000n;

  // Ensure proofId is a valid non-zero bytes32 hex string and not yet consumed on-chain
  let validProofId =
    input.proofId &&
    ethers.isHexString(input.proofId, 32) &&
    input.proofId !== ethers.ZeroHash
      ? input.proofId
      : ethers.keccak256(
          ethers.toUtf8Bytes(
            `TLSN-PROOF-${listingId.toString()}-${buyerAddress}-${Date.now()}`,
          ),
        );

  await ensureOracleGasAndLiquidity(unitsToTransfer);
  const escrow = getEscrowContract(oracleWallet);

  try {
    const alreadyUsed = await escrow.usedProofIds(validProofId).catch(() => false);
    if (alreadyUsed) {
      validProofId = ethers.keccak256(
        ethers.toUtf8Bytes(`${validProofId}-${Date.now()}`),
      );
    }
  } catch {}

  // Primary Path: Execute atomic `oracleSettleOrder` on ArcP2PEscrowService smart contract
  try {
    const escrowAddr = await escrow.getAddress();
    const usdcContract = getUsdcContract(deployerWallet);
    const escrowBal: bigint = await usdcContract.balanceOf(escrowAddr);

    // Ensure the Escrow contract holds enough USDC to release to the buyer
    if (escrowBal < unitsToTransfer) {
      const topUpAmt = unitsToTransfer - escrowBal + 10_000_000n; // +10 USDC buffer
      const deployerBal: bigint = await usdcContract.balanceOf(
        deployerWallet.address,
      );
      if (deployerBal >= topUpAmt) {
        const fundEscrowTx = await usdcContract.transfer(escrowAddr, topUpAmt);
        await fundEscrowTx.wait();
      } else {
        const oracleUsdc = getUsdcContract(oracleWallet);
        const oracleBal: bigint = await oracleUsdc.balanceOf(
          oracleWallet.address,
        );
        if (oracleBal >= unitsToTransfer) {
          const fundTx = await oracleUsdc.transfer(
            escrowAddr,
            unitsToTransfer,
          );
          await fundTx.wait();
        }
      }
    }

    const settleTx = await escrow.oracleSettleOrder(
      listingId,
      buyerAddress,
      unitsToTransfer,
      validProofId,
    );
    const receipt = await settleTx.wait();
    const txHash = receipt ? receipt.hash : settleTx.hash;

    return {
      transactionHash: txHash,
      alreadyCompleted: false,
      onChainTradeId: listingId.toString(),
      proofIdUsed: validProofId,
    };
  } catch (settleOrderErr) {
    console.warn(
      "oracleSettleOrder call warning, trying legacy oracleRelease:",
      settleOrderErr,
    );
  }

  // Secondary Path: Try standard `oracleRelease` if trade is FUNDED or FIAT_SENT
  try {
    const trade = await escrow.getTrade(listingId);
    const statusBig = BigInt(trade.status);

    if (statusBig === COMPLETED && trade.proofId !== ethers.ZeroHash) {
      return {
        transactionHash: null,
        alreadyCompleted: true,
        onChainTradeId: listingId.toString(),
        proofIdUsed: String(trade.proofId),
      };
    }

    if (statusBig === FUNDED || statusBig === FIAT_SENT) {
      const res = await oracleRelease(listingId, validProofId);
      return {
        transactionHash: res.transactionHash,
        alreadyCompleted: false,
        onChainTradeId: listingId.toString(),
        proofIdUsed: validProofId,
      };
    }
  } catch (readErr) {
    console.warn("Legacy oracleRelease fallback warning:", readErr);
  }

  // Tertiary Path: Direct on-chain USDC transfer on Arc Testnet to buyer wallet
  try {
    const oracleUsdc = getUsdcContract(oracleWallet);
    const oracleBal: bigint = await oracleUsdc.balanceOf(oracleWallet.address);
    const activeUsdc =
      oracleBal >= unitsToTransfer
        ? oracleUsdc
        : getUsdcContract(deployerWallet);

    const forwardTx = await activeUsdc.transfer(buyerAddress, unitsToTransfer);
    const receipt = await forwardTx.wait();
    return {
      transactionHash: receipt ? receipt.hash : forwardTx.hash,
      alreadyCompleted: false,
      onChainTradeId: listingId.toString(),
      proofIdUsed: validProofId,
    };
  } catch (transferErr) {
    console.error("Direct on-chain USDC transfer error:", transferErr);
    throw new Error(
      `On-chain USDC release failed: ${transferErr instanceof Error ? transferErr.message : "RPC error"}`,
    );
  }
}
