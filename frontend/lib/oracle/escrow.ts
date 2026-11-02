import "server-only";

import { ethers } from "ethers";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
};

const ESCROW_ABI = [
  "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, uint256 cryptoAmount, uint256 buyerCollateral, bytes32 privacyHashedBankDetails, uint8 status, uint64 createdAt, uint64 fundedAt, uint64 fiatSentAt, bytes32 proofId))",
  "function oracleAddress() view returns (address)",
  "function usedProofIds(bytes32) view returns (bool)",
  "function fundBuyerCollateral(uint256 tradeId, uint256 collateral)",
  "function oracleRelease(uint256 tradeId, bytes32 proofId)",
  "function feeBps() view returns (uint16)",
];

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(
  requiredEnv("ARC_RPC_URL"),
  5042002,
  { staticNetwork: true },
);
const oracleWallet = new ethers.Wallet(
  requiredEnv("ORACLE_PRIVATE_KEY"),
  provider,
);
const escrow = new ethers.Contract(
  requiredEnv("ESCROW_ADDRESS"),
  ESCROW_ABI,
  oracleWallet,
);
const usdc = new ethers.Contract(
  requiredEnv("USDC_ADDRESS"),
  USDC_ABI,
  oracleWallet,
);

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
  return escrow.getTrade(tradeId);
}

export async function oracleRelease(
  tradeId: bigint,
  proofId: string,
): Promise<OracleReleaseResult> {
  if (tradeId <= 0n || !ethers.isHexString(proofId, 32)) {
    throw new Error("Invalid oracle release input");
  }
  if (proofId === ethers.ZeroHash) throw new Error("Invalid proof identifier");

  const [trade, configuredOracle] = await Promise.all([
    escrow.getTrade(tradeId),
    escrow.oracleAddress(),
  ]);
  if (configuredOracle.toLowerCase() !== oracleWallet.address.toLowerCase()) {
    throw new Error("Oracle signer is not configured for escrow");
  }
  const used = await escrow.usedProofIds(proofId).catch(() => false);
  if (used) throw new Error("Proof has already been consumed");
  if (trade.status !== FUNDED && trade.status !== FIAT_SENT) {
    throw new Error("Trade is not eligible for oracle release");
  }

  await escrow.oracleRelease.staticCall(tradeId, proofId);
  const transaction = await escrow.oracleRelease(tradeId, proofId);
  await transaction.wait();

  return {
    transactionHash: transaction.hash,
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
}

export async function oracleSettleToBuyer(
  input: OracleSettleInput,
): Promise<OracleSettleResult> {
  const { listingId, buyerAddress, proofId } = input;
  const trade = await escrow.getTrade(listingId);

  if (trade.status === COMPLETED) {
    return { transactionHash: null, alreadyCompleted: true };
  }

  if (!ethers.isAddress(buyerAddress)) {
    throw new Error("Valid buyer wallet address is required to settle escrow");
  }

  if (trade.status === FUNDED || trade.status === FIAT_SENT) {
    if (trade.buyer.toLowerCase() === buyerAddress.toLowerCase()) {
      const res = await oracleRelease(listingId, proofId);
      return { transactionHash: res.transactionHash, alreadyCompleted: false };
    }

    if (trade.buyer.toLowerCase() === oracleWallet.address.toLowerCase()) {
      const res = await oracleRelease(listingId, proofId);
      const feeBps = await escrow.feeBps().catch(() => 50n);
      const fee = (trade.cryptoAmount * BigInt(feeBps)) / 10000n;
      const buyerGets = trade.cryptoAmount - fee;
      if (buyerGets > 0n) {
        try {
          const forwardTx = await usdc.transfer(buyerAddress, buyerGets);
          await forwardTx.wait();
        } catch (e) {
          console.warn("Oracle USDC forward transfer warning:", e);
        }
      }
      return { transactionHash: res.transactionHash, alreadyCompleted: false };
    }

    const res = await oracleRelease(listingId, proofId);
    return { transactionHash: res.transactionHash, alreadyCompleted: false };
  }

  if (trade.status === CREATED) {
    const fundTx = await escrow.fundBuyerCollateral(listingId, 0n);
    await fundTx.wait();

    const res = await oracleRelease(listingId, proofId);
    const feeBps = await escrow.feeBps().catch(() => 50n);
    const fee = (trade.cryptoAmount * BigInt(feeBps)) / 10000n;
    const buyerGets = trade.cryptoAmount - fee;
    if (buyerGets > 0n) {
      try {
        const forwardTx = await usdc.transfer(buyerAddress, buyerGets);
        await forwardTx.wait();
      } catch (e) {
        console.warn("Oracle USDC forward transfer warning:", e);
      }
    }
    return { transactionHash: res.transactionHash, alreadyCompleted: false };
  }

  throw new Error(`Escrow trade is in unexpected status (${trade.status})`);
}
