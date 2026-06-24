/**
 * arcConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for every Web3 constant in the Arc P2P dApp.
 *
 * Exports:
 *   arcTestnet          – Viem chain definition (USDC as native gas token)
 *   wagmiConfig         – Wagmi v2 QueryClient-backed config (injected wallet)
 *   ESCROW_ADDRESS      – Deployed ArcP2PEscrowService contract address
 *   USDC_ADDRESS        – USDC token contract on Arc Testnet
 *   ESCROW_ABI          – Full typed ABI for ArcP2PEscrowService
 *   USDC_ABI            – Minimal ERC-20 ABI (approve + allowance only)
 *   ARCSCAN_TX          – Helper: build a testnet block-explorer TX link
 *   ARCSCAN_ADDR        – Helper: build a testnet block-explorer address link
 *   formatUsdc          – Format micro-USDC (6 dec) → human "1.00 USDC"
 *   parseUsdc           – Parse "1.00" → BigInt 1_000_000n
 *   hashBankDetails     – keccak256 of bank routing details (client-side)
 */

import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain, keccak256, toBytes } from "viem";

// ─── ARC CHAIN DEFINITION ─────────────────────────────────────────────────────
/**
 * Arc Chain Testnet — Circle's EVM-compatible network where USDC is the
 * native gas token (6 decimals, not 18). Every gas-estimation call made by
 * Viem will use this nativeCurrency config automatically.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,           // ← 6, not 18 — critical for gas display
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public:  { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url:  "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

// ─── WAGMI CONFIG ─────────────────────────────────────────────────────────────
/**
 * Wagmi v2 config — supports MetaMask / any EIP-1193 injected wallet.
 * Wrap your app root with <WagmiProvider config={wagmiConfig}> and
 * <QueryClientProvider client={queryClient}>.
 */
export const wagmiConfig = createConfig({
  chains:     [arcTestnet],
  connectors: [injected()],         // MetaMask, Rabby, Frame, etc.
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
  },
});

// ─── CONTRACT ADDRESSES ───────────────────────────────────────────────────────
/** ArcP2PEscrowService — update after deployment */
export const ESCROW_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

/** Circle USDC on Arc Testnet — update to actual deployment address */
export const USDC_ADDRESS =
  "0x0000000000000000000000000000000000000001" as `0x${string}`;

// ─── ARCSCAN LINK BUILDERS ────────────────────────────────────────────────────
export const ARCSCAN_TX   = (hash: string)    => `https://testnet.arcscan.app/tx/${hash}`;
export const ARCSCAN_ADDR = (address: string) => `https://testnet.arcscan.app/address/${address}`;

// ─── USDC HELPERS (6 DECIMALS) ────────────────────────────────────────────────
/** Convert micro-USDC BigInt → human-readable string: 1_000_000n → "1.00" */
export function formatUsdc(microUsdc: bigint, decimals = 2): string {
  const whole = microUsdc / 1_000_000n;
  const frac  = microUsdc % 1_000_000n;
  return `${whole}.${String(frac).padStart(6, "0").slice(0, decimals)}`;
}

/** Convert human string → micro-USDC BigInt: "1.50" → 1_500_000n */
export function parseUsdc(humanAmount: string): bigint {
  const [whole, frac = ""] = humanAmount.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

/**
 * Hash bank routing details client-side before sending on-chain.
 * The contract only stores the hash — never the raw banking data.
 *
 * @param bankName    e.g. "GTBank"
 * @param accountNo   e.g. "0123456789"
 * @param sortCode    e.g. "058" (optional, leave "" if not applicable)
 */
export function hashBankDetails(
  bankName: string,
  accountNo: string,
  sortCode: string = ""
): `0x${string}` {
  const raw = `${bankName}|${accountNo}|${sortCode}`;
  return keccak256(toBytes(raw));
}

// ─── ESCROW ABI ───────────────────────────────────────────────────────────────
/**
 * Typed ABI for ArcP2PEscrowService.sol — only the functions the frontend
 * needs to call. Extend with the full ABI if you need admin functions.
 */
export const ESCROW_ABI = [
  // ── Write functions ──
  {
    name: "initiateTrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_cryptoAmount",        type: "uint256" },
      { name: "_hashedBankDetails",   type: "bytes32" },
    ],
    outputs: [{ name: "tradeId", type: "uint256" }],
  },
  {
    name: "fundBuyerCollateral",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_tradeId",    type: "uint256" },
      { name: "_collateral", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "markFiatSent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "releaseFunds",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "raiseDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "reclaimExpiredTrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [],
  },
  // ── Read functions ──
  {
    name: "getTrade",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "seller",                   type: "address" },
          { name: "buyer",                    type: "address" },
          { name: "cryptoAmount",             type: "uint256" },
          { name: "buyerCollateral",          type: "uint256" },
          { name: "privacyHashedBankDetails", type: "bytes32" },
          { name: "status",                   type: "uint8"   },
          { name: "createdAt",                type: "uint64"  },
          { name: "fundedAt",                 type: "uint64"  },
          { name: "fiatSentAt",               type: "uint64"  },
          { name: "proofId",                  type: "bytes32" },
        ],
      },
    ],
  },
  {
    name: "calculateNetRelease",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tradeId", type: "uint256" }],
    outputs: [
      { name: "buyerReceives", type: "uint256" },
      { name: "platformFee",   type: "uint256" },
    ],
  },
  {
    name: "feeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  // ── Events ──
  {
    name: "TradeInitiated",
    type: "event",
    inputs: [
      { name: "tradeId",           type: "uint256", indexed: true  },
      { name: "seller",            type: "address", indexed: true  },
      { name: "cryptoAmount",      type: "uint256", indexed: false },
      { name: "hashedBankDetails", type: "bytes32", indexed: false },
    ],
  },
  {
    name: "TradeFunded",
    type: "event",
    inputs: [
      { name: "tradeId",        type: "uint256", indexed: true  },
      { name: "buyer",          type: "address", indexed: true  },
      { name: "buyerCollateral",type: "uint256", indexed: false },
    ],
  },
  {
    name: "TradeCompleted",
    type: "event",
    inputs: [
      { name: "tradeId",        type: "uint256", indexed: true  },
      { name: "buyer",          type: "address", indexed: true  },
      { name: "amountAfterFee", type: "uint256", indexed: false },
      { name: "fee",            type: "uint256", indexed: false },
    ],
  },
  {
    name: "TradeDisputed",
    type: "event",
    inputs: [
      { name: "tradeId",   type: "uint256", indexed: true },
      { name: "raisedBy",  type: "address", indexed: true },
    ],
  },
  {
    name: "TradeResolved",
    type: "event",
    inputs: [
      { name: "tradeId",      type: "uint256", indexed: true  },
      { name: "winner",       type: "address", indexed: true  },
      { name: "buyerSlashed", type: "bool",    indexed: false },
    ],
  },
] as const;

// ─── ERC-20 MINIMAL ABI (approve + allowance) ────────────────────────────────
export const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ─── TRADE STATUS ENUM (mirrors Solidity) ────────────────────────────────────
export const TradeStatusEnum = {
  0: "Created",
  1: "Funded",
  2: "FiatSent",
  3: "Completed",
  4: "Disputed",
  5: "Resolved",
} as const;

export type OnChainTradeStatus = keyof typeof TradeStatusEnum;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
/** Minimum buyer collateral: 50 USDC (matches SLASH_AMOUNT in contract) */
export const MIN_COLLATERAL_USDC = 50_000_000n; // 50 USDC in micro-USDC

/** Default platform fee: 1% (100 bps) */
export const DEFAULT_FEE_BPS = 100;
