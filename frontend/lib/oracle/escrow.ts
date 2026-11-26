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
  "error Unauthorized()",
  "error InvalidAmount()",
  "error InsufficientInventory(uint256 requested, uint256 available)",
  "error InvalidState(uint8 current, uint8 required)",
  "error ZeroAddress()",
  "error TransferFailed()",
  "event TradeInitiated(uint256 indexed tradeId, address indexed seller, uint256 cryptoAmount, bytes32 hashedBankDetails)",
  "event TradeCompleted(uint256 indexed tradeId, address indexed buyer, uint256 amountAfterFee, uint256 fee)",
  "event OracleProofSubmitted(uint256 indexed tradeId, bytes32 indexed proofId)",
  "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, uint256 cryptoAmount, uint256 buyerCollateral, bytes32 privacyHashedBankDetails, uint8 status, uint64 createdAt, uint64 fundedAt, uint64 fiatSentAt, bytes32 proofId))",
  "function getListingInventory(uint256 listingId) view returns (tuple(uint256 listingTradeId, address seller, uint256 totalDeposited, uint256 availableAmount, uint256 allocatedAmount, uint256 activeChildTradeId, bytes32 privacyHashedBankDetails, bool active))",
  "function oracleAddress() view returns (address)",
  "function nextTradeId() view returns (uint256)",
  "function usedProofIds(bytes32) view returns (bool)",
  "function oracleRelease(uint256 tradeId, bytes32 proofId)",
  "function oracleSettleOrder(uint256 _tradeId, address _buyer, uint256 _amount, bytes32 _proofId) returns (uint256)",
];

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const RECEIPT_TIMEOUT_MS = 120_000;
/** Oracle keeps at least this much native USDC (18 dp on Arc) for gas. */
const MIN_ORACLE_GAS_WEI = ethers.parseUnits("0.5", 18);
const GAS_TOPUP_UNITS = 2_000_000n; // 2 USDC (ERC-20, 6 dp)

const provider = new ethers.JsonRpcProvider(
  requiredEnv("ARC_RPC_URL", "NEXT_PUBLIC_ARC_RPC_URL"),
  5042002,
  { staticNetwork: true },
);

const oracleWallet = new ethers.Wallet(requiredEnv("ORACLE_PRIVATE_KEY"), provider);

// Optional gas sponsor for the oracle. Server-only: never a NEXT_PUBLIC_ var.
const gasSponsorWallet = process.env.ARC_PRIVATE_KEY
  ? new ethers.Wallet(process.env.ARC_PRIVATE_KEY, provider)
  : null;

const escrowAddress = () => requiredEnv("ESCROW_ADDRESS", "NEXT_PUBLIC_ESCROW_ADDRESS");

function getEscrowContract(signer: ethers.Signer | ethers.Provider = oracleWallet) {
  return new ethers.Contract(escrowAddress(), ESCROW_ABI, signer);
}

const escrowInterface = new ethers.Interface(ESCROW_ABI);

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
  return getEscrowContract(provider).getTrade(tradeId);
}

export async function readNextTradeId(): Promise<bigint> {
  return BigInt(await getEscrowContract(provider).nextTradeId());
}

export async function readListingInventory(listingId: bigint) {
  if (listingId <= 0n) throw new Error("Invalid listing identifier");
  return getEscrowContract(provider).getListingInventory(listingId);
}

/** Turns an ethers revert into the contract's custom error name when possible. */
function describeRevert(err: unknown): string {
  const e = err as { data?: string; info?: { error?: { data?: string } }; shortMessage?: string; message?: string };
  const data = e?.data ?? e?.info?.error?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const parsed = escrowInterface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.join(", ")})`;
    } catch {
      /* unknown selector */
    }
  }
  return e?.shortMessage || e?.message || String(err);
}

async function assertOracleConfigured() {
  const configured: string = await getEscrowContract(provider).oracleAddress();
  if (configured.toLowerCase() !== oracleWallet.address.toLowerCase()) {
    throw new Error(
      `ORACLE_PRIVATE_KEY (${oracleWallet.address}) is not the escrow's oracle (${configured}).`,
    );
  }
}

/** Keeps the oracle able to pay gas. Never touches escrow balances. */
async function ensureOracleGas() {
  const native = await provider.getBalance(oracleWallet.address);
  if (native >= MIN_ORACLE_GAS_WEI) return;
  if (!gasSponsorWallet || gasSponsorWallet.address.toLowerCase() === oracleWallet.address.toLowerCase()) {
    console.warn(`[oracle] low gas balance on ${oracleWallet.address}; fund it with Arc testnet USDC.`);
    return;
  }
  try {
    const usdc = new ethers.Contract(requiredEnv("USDC_ADDRESS", "NEXT_PUBLIC_USDC_ADDRESS"), USDC_ABI, gasSponsorWallet);
    const tx = await usdc.transfer(oracleWallet.address, GAS_TOPUP_UNITS);
    await tx.wait(1, RECEIPT_TIMEOUT_MS);
  } catch (err) {
    console.warn("[oracle] gas top-up failed:", describeRevert(err));
  }
}

export async function oracleRelease(
  tradeId: bigint,
  proofId: string,
): Promise<OracleReleaseResult> {
  if (tradeId <= 0n || !ethers.isHexString(proofId, 32) || proofId === ethers.ZeroHash) {
    throw new Error("Invalid oracle release input");
  }
  await assertOracleConfigured();
  const escrow = getEscrowContract(oracleWallet);
  const [trade, used] = await Promise.all([escrow.getTrade(tradeId), escrow.usedProofIds(proofId)]);
  if (used) throw new Error("Proof has already been consumed");
  const status = BigInt(trade.status);
  if (status !== FUNDED && status !== FIAT_SENT) {
    throw new Error("Trade is not eligible for oracle release");
  }
  await ensureOracleGas();
  try {
    await escrow.oracleRelease.staticCall(tradeId, proofId);
  } catch (err) {
    throw new Error(`oracleRelease would revert: ${describeRevert(err)}`);
  }
  const transaction = await escrow.oracleRelease(tradeId, proofId);
  const receipt = await transaction.wait(1, RECEIPT_TIMEOUT_MS);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Oracle release transaction did not confirm successfully");
  }
  return { transactionHash: receipt.hash, tradeId, proofId };
}

export interface OracleSettleInput {
  listingId: bigint;
  buyerAddress: string;
  amountUnits: bigint;
  /** Deterministic per payment so retries are idempotent on-chain. */
  proofId: string;
}

export interface OracleSettleResult {
  transactionHash: string | null;
  alreadyCompleted: boolean;
  onChainTradeId?: string;
  proofIdUsed?: string;
}

/**
 * Releases escrowed USDC to the buyer via `oracleSettleOrder`.
 *
 * Only settles against USDC a seller actually locked on-chain: either a
 * Funded/FiatSent trade, or an active listing with enough available
 * inventory. It refuses anything else rather than falling into the contract's
 * "liquidity-backed" branch, which would pay out of other sellers' escrow.
 */
export async function oracleSettleToBuyer(
  input: OracleSettleInput,
): Promise<OracleSettleResult> {
  const { listingId, buyerAddress, amountUnits, proofId } = input;
  if (listingId <= 0n) throw new Error("No on-chain escrow listing backs this trade");
  if (!ethers.isAddress(buyerAddress)) {
    throw new Error("Valid buyer wallet address is required to settle escrow");
  }
  if (amountUnits <= 0n) throw new Error("Settlement amount must be positive");
  if (!ethers.isHexString(proofId, 32) || proofId === ethers.ZeroHash) {
    throw new Error("Settlement requires a non-zero bytes32 proof id");
  }

  await assertOracleConfigured();
  const escrow = getEscrowContract(oracleWallet);

  // Idempotency: this exact payment proof already settled on-chain.
  if (await escrow.usedProofIds(proofId)) {
    return { transactionHash: null, alreadyCompleted: true, proofIdUsed: proofId };
  }

  const [trade, inv] = await Promise.all([
    escrow.getTrade(listingId),
    escrow.getListingInventory(listingId),
  ]);
  const status = BigInt(trade.status);
  const tradeBuyer = String(trade.buyer).toLowerCase();

  const fundedTrade =
    BigInt(trade.cryptoAmount) > 0n && (status === FUNDED || status === FIAT_SENT);
  const openListing =
    status === CREATED &&
    Boolean(inv.active) &&
    String(inv.seller) !== ethers.ZeroAddress &&
    BigInt(inv.availableAmount) >= amountUnits;

  if (status === COMPLETED && String(trade.buyer).toLowerCase() === buyerAddress.toLowerCase()) {
    return {
      transactionHash: null,
      alreadyCompleted: true,
      onChainTradeId: listingId.toString(),
      proofIdUsed: String(trade.proofId),
    };
  }
  if (fundedTrade && tradeBuyer !== ethers.ZeroAddress.toLowerCase() && tradeBuyer !== buyerAddress.toLowerCase()) {
    throw new Error(`Escrow #${listingId} is reserved for a different buyer on-chain`);
  }
  if (!fundedTrade && !openListing) {
    throw new Error(
      `Escrow #${listingId} has no settleable USDC on Arc (status ${status}, available ${inv.availableAmount}, requested ${amountUnits})`,
    );
  }

  await ensureOracleGas();

  try {
    await escrow.oracleSettleOrder.staticCall(listingId, buyerAddress, amountUnits, proofId);
  } catch (err) {
    throw new Error(`oracleSettleOrder would revert: ${describeRevert(err)}`);
  }

  const tx = await escrow.oracleSettleOrder(listingId, buyerAddress, amountUnits, proofId);
  const receipt = await tx.wait(1, RECEIPT_TIMEOUT_MS);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Settlement transaction ${tx.hash} reverted on Arc`);
  }

  let settledTradeId: bigint | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== escrowAddress().toLowerCase()) continue;
    try {
      const parsed = escrowInterface.parseLog(log);
      if (parsed?.name === "OracleProofSubmitted") settledTradeId = BigInt(parsed.args.tradeId);
    } catch {
      /* not an escrow event */
    }
  }

  return {
    transactionHash: receipt.hash,
    alreadyCompleted: false,
    onChainTradeId: (settledTradeId ?? listingId).toString(),
    proofIdUsed: proofId,
  };
}

/** Deterministic proof id for a payment, so a replayed webhook can't settle twice. */
export function paymentProofId(kind: string, tradeId: string, reference: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${kind}:${tradeId}:${reference}`));
}

/**
 * Verifies a client-reported transaction really is a successful call to the
 * escrow contract on Arc that emitted one of `events`.
 */
export async function verifyEscrowTx(
  hash: string,
  events: string[] = ["TradeCompleted"],
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
  const receipt = await provider.getTransactionReceipt(hash).catch(() => null);
  if (!receipt || receipt.status !== 1) return false;
  if (receipt.to?.toLowerCase() !== escrowAddress().toLowerCase()) return false;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== escrowAddress().toLowerCase()) return false;
    try {
      const parsed = escrowInterface.parseLog(log);
      return !!parsed && events.includes(parsed.name);
    } catch {
      return false;
    }
  });
}

/** Confirms a seller really locked `expectedUnits` USDC in listing `listingId`. */
export async function verifySellerListing(
  listingId: bigint,
  sellerAddress: string,
  expectedUnits: bigint,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const inv = await readListingInventory(listingId);
    if (!inv.active) return { ok: false, reason: `Listing #${listingId} is not active on Arc` };
    if (String(inv.seller).toLowerCase() !== sellerAddress.toLowerCase()) {
      return { ok: false, reason: `Listing #${listingId} belongs to a different wallet` };
    }
    if (BigInt(inv.totalDeposited) !== expectedUnits) {
      return { ok: false, reason: `Listing #${listingId} holds ${inv.totalDeposited} units, expected ${expectedUnits}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Could not read listing #${listingId} from Arc: ${describeRevert(err)}` };
  }
}
