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
const ARC_RPC_URL =
	process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";

export const arcTestnet = defineChain({
	id: 5042002,
	name: "Arc Testnet",
	nativeCurrency: {
		name: "USD Coin",
		symbol: "USDC",
		// Arc's *native* USDC balance (gas) is tracked with 18 decimals.
		// The ERC-20 interface at USDC_ADDRESS uses 6 decimals.
		decimals: 18,
	},
	rpcUrls: {
		default: { http: [ARC_RPC_URL] },
		public: { http: [ARC_RPC_URL] },
	},
	blockExplorers: {
		default: {
			name: "ArcScan",
			url: "https://testnet.arcscan.app",
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
	chains: [arcTestnet],
	connectors: [injected()], // MetaMask, Rabby, Frame, etc.
	transports: {
		[arcTestnet.id]: http(ARC_RPC_URL),
	},
});

// ─── CONTRACT ADDRESSES ───────────────────────────────────────────────────────
/** ArcP2PEscrowService — update after deployment */
export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ||
	"0xAEC65F8De5c5f893c6Cd5f101D290869fFEd9dAe") as `0x${string}`;

/** Circle USDC ERC-20 interface on Arc Testnet (6 decimals). */
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
	"0x3600000000000000000000000000000000000000") as `0x${string}`;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** True when a trade/listing id refers to a real on-chain escrow record. */
export function isOnChainTradeId(id: string | null | undefined): id is string {
	return typeof id === "string" && /^[1-9]\d*$/.test(id);
}

// ─── ARCSCAN LINK BUILDERS ────────────────────────────────────────────────────
export const ARCSCAN_TX = (hash: string) =>
	`https://testnet.arcscan.app/tx/${hash}`;
export const ARCSCAN_ADDR = (address: string) =>
	`https://testnet.arcscan.app/address/${address}`;

// ─── USDC HELPERS (6 DECIMALS) ────────────────────────────────────────────────
/** Convert micro-USDC BigInt → human-readable string: 1_000_000n → "1.00" */
export function formatUsdc(microUsdc: bigint, decimals = 2): string {
	const whole = microUsdc / 1_000_000n;
	const frac = microUsdc % 1_000_000n;
	const fracStr = String(frac).padStart(6, "0");
	if (decimals < 6 && frac % BigInt(10 ** (6 - decimals)) !== 0n) {
		return `${whole}.${fracStr.replace(/0+$/, "")}`;
	}
	return `${whole}.${fracStr.slice(0, decimals)}`;
}

/**
 * Strict integer-only parser converting a human USDC string into micro-USDC (6 decimals).
 * Rejects zero, negative, malformed, or >6 decimal precision inputs.
 */
export function parseUsdc(humanAmount: string): bigint {
	const cleaned = humanAmount.replace(/,/g, "").trim();
	if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) {
		throw new Error(
			"Invalid USDC amount. Enter a positive number with at most 6 decimal places.",
		);
	}
	const [whole, frac = ""] = cleaned.split(".");
	const fracPadded = frac.padEnd(6, "0").slice(0, 6);
	const units = BigInt(whole) * 1_000_000n + BigInt(fracPadded);
	if (units <= 0n) {
		throw new Error("USDC amount must be greater than zero.");
	}
	return units;
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
	sortCode: string = "",
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
	// ── Custom errors (lets viem decode reverts into readable messages) ──
	{ type: "error", name: "Unauthorized", inputs: [] },
	{ type: "error", name: "InvalidAmount", inputs: [] },
	{
		type: "error",
		name: "InsufficientInventory",
		inputs: [
			{ name: "requested", type: "uint256" },
			{ name: "available", type: "uint256" },
		],
	},
	{
		type: "error",
		name: "InvalidState",
		inputs: [
			{ name: "current", type: "uint8" },
			{ name: "required", type: "uint8" },
		],
	},
	{ type: "error", name: "ZeroAddress", inputs: [] },
	{ type: "error", name: "SlashWindowExpired", inputs: [] },
	{ type: "error", name: "FeeTooHigh", inputs: [] },
	{ type: "error", name: "TransferFailed", inputs: [] },
	// ── Write functions ──
	{
		name: "initiateTrade",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_cryptoAmount", type: "uint256" },
			{ name: "_hashedBankDetails", type: "bytes32" },
		],
		outputs: [{ name: "tradeId", type: "uint256" }],
	},
	{
		name: "fundBuyerCollateral",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_tradeId", type: "uint256" },
			{ name: "_collateral", type: "uint256" },
		],
		outputs: [],
	},
	{
		name: "allocatePartialOrder",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_parentListingId", type: "uint256" },
			{ name: "_requestedAmount", type: "uint256" },
			{ name: "_buyer", type: "address" },
		],
		outputs: [{ name: "childTradeId", type: "uint256" }],
	},
	{
		name: "withdrawAvailableInventory",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_listingId", type: "uint256" },
			{ name: "_amount", type: "uint256" },
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
		name: "oracleRelease",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_tradeId", type: "uint256" },
			{ name: "_proofId", type: "bytes32" },
		],
		outputs: [],
	},
	{
		name: "oracleSettleOrder",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "_tradeId", type: "uint256" },
			{ name: "_buyer", type: "address" },
			{ name: "_amount", type: "uint256" },
			{ name: "_proofId", type: "bytes32" },
		],
		outputs: [{ name: "settledTradeId", type: "uint256" }],
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
					{ name: "seller", type: "address" },
					{ name: "buyer", type: "address" },
					{ name: "cryptoAmount", type: "uint256" },
					{ name: "buyerCollateral", type: "uint256" },
					{ name: "privacyHashedBankDetails", type: "bytes32" },
					{ name: "status", type: "uint8" },
					{ name: "createdAt", type: "uint64" },
					{ name: "fundedAt", type: "uint64" },
					{ name: "fiatSentAt", type: "uint64" },
					{ name: "proofId", type: "bytes32" },
				],
			},
		],
	},
	{
		name: "getListingInventory",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_listingId", type: "uint256" }],
		outputs: [
			{
				type: "tuple",
				components: [
					{ name: "listingTradeId", type: "uint256" },
					{ name: "seller", type: "address" },
					{ name: "totalDeposited", type: "uint256" },
					{ name: "availableAmount", type: "uint256" },
					{ name: "allocatedAmount", type: "uint256" },
					{ name: "activeChildTradeId", type: "uint256" },
					{ name: "privacyHashedBankDetails", type: "bytes32" },
					{ name: "active", type: "bool" },
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
			{ name: "platformFee", type: "uint256" },
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
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "seller", type: "address", indexed: true },
			{ name: "cryptoAmount", type: "uint256", indexed: false },
			{ name: "hashedBankDetails", type: "bytes32", indexed: false },
		],
	},
	{
		name: "TradeFunded",
		type: "event",
		inputs: [
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "buyer", type: "address", indexed: true },
			{ name: "buyerCollateral", type: "uint256", indexed: false },
		],
	},
	{
		name: "TradeCompleted",
		type: "event",
		inputs: [
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "buyer", type: "address", indexed: true },
			{ name: "amountAfterFee", type: "uint256", indexed: false },
			{ name: "fee", type: "uint256", indexed: false },
		],
	},
	{
		name: "PartialOrderAllocated",
		type: "event",
		inputs: [
			{ name: "parentListingId", type: "uint256", indexed: true },
			{ name: "childTradeId", type: "uint256", indexed: true },
			{ name: "buyer", type: "address", indexed: true },
			{ name: "allocatedAmount", type: "uint256", indexed: false },
			{ name: "remainingAvailable", type: "uint256", indexed: false },
		],
	},
	{
		name: "OracleProofSubmitted",
		type: "event",
		inputs: [
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "proofId", type: "bytes32", indexed: true },
		],
	},
	{
		name: "TradeDisputed",
		type: "event",
		inputs: [
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "raisedBy", type: "address", indexed: true },
		],
	},
	{
		name: "TradeResolved",
		type: "event",
		inputs: [
			{ name: "tradeId", type: "uint256", indexed: true },
			{ name: "winner", type: "address", indexed: true },
			{ name: "buyerSlashed", type: "bool", indexed: false },
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
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ type: "bool" }],
	},
	{
		name: "allowance",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "owner", type: "address" },
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
	{
		name: "decimals",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "uint8" }],
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
/** Mandatory 50 USDC buyer collateral removed (seller-funded escrow model) */
export const MIN_COLLATERAL_USDC = 0n;

/** Estimated Arc Network transaction gas fee in micro-USDC (0.0031 USDC) */
export const ESTIMATED_ARC_GAS_USDC = 3_100n;

/** Default platform fee: 1% (100 bps) */
export const DEFAULT_FEE_BPS = 100;

interface Eip1193Provider {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function getInjectedProvider(): Eip1193Provider | null {
	if (typeof window === "undefined") return null;
	const win = window as unknown as { ethereum?: Eip1193Provider };
	return win.ethereum ?? null;
}

/**
 * Resilient message signing that avoids Wagmi v2 stale connector `getChainId is not a function`
 * errors by falling back directly to the browser's EIP-1193 `personal_sign` method.
 */
export async function signWalletMessage(
	message: string,
	account: `0x${string}`,
	wagmiSignAsync?: (args: { message: string; account?: `0x${string}` }) => Promise<`0x${string}`>,
): Promise<`0x${string}`> {
	if (wagmiSignAsync) {
		try {
			return await wagmiSignAsync({ message, account });
		} catch (err) {
			const msg = err instanceof Error ? err.message.toLowerCase() : "";
			// If user explicitly rejected in wallet, do not prompt a second time
			if (
				msg.includes("user rejected") ||
				msg.includes("user denied") ||
				msg.includes("action_rejected")
			) {
				throw err;
			}
			// Otherwise (e.g. `connection.connector.getChainId is not a function`), fall through to EIP-1193
		}
	}

	const provider = getInjectedProvider();
	if (!provider) {
		throw new Error("No wallet extension detected. Please install or unlock MetaMask.");
	}

	const sig = await provider.request({
		method: "personal_sign",
		params: [message, account],
	});

	if (typeof sig !== "string" || !sig.startsWith("0x")) {
		throw new Error("Wallet did not return a valid signature.");
	}
	return sig as `0x${string}`;
}

/**
 * Resilient chain switcher for Arc Testnet (#5042002 / 0x4cef52) that falls back to
 * `wallet_switchEthereumChain` and `wallet_addEthereumChain` if Wagmi's connector state is stale.
 */
export async function switchToArcTestnet(
	wagmiSwitchAsync?: (args: { chainId: number }) => Promise<unknown>,
): Promise<void> {
	if (wagmiSwitchAsync) {
		try {
			await wagmiSwitchAsync({ chainId: arcTestnet.id });
			return;
		} catch (err) {
			const msg = err instanceof Error ? err.message.toLowerCase() : "";
			if (msg.includes("user rejected") || msg.includes("user denied")) {
				throw err;
			}
		}
	}

	const provider = getInjectedProvider();
	if (!provider) {
		throw new Error("No wallet extension detected.");
	}

	const hexChainId = `0x${arcTestnet.id.toString(16)}`;
	try {
		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: hexChainId }],
		});
	} catch (switchErr) {
		const code = (switchErr as { code?: number })?.code;
		if (code === 4902) {
			await provider.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: hexChainId,
						chainName: arcTestnet.name,
						nativeCurrency: arcTestnet.nativeCurrency,
						rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
						blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
					},
				],
			});
			return;
		}
		throw switchErr;
	}
}

const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
	Unauthorized:
		"The escrow contract rejected this action for your wallet (wrong role, or the listing already has an active order).",
	InvalidAmount: "The escrow contract rejected the amount.",
	InsufficientInventory: "This listing doesn't have enough USDC available on-chain.",
	InvalidState: "This trade is not in the right on-chain state for that action.",
	ZeroAddress: "A required wallet address is missing.",
	SlashWindowExpired: "The dispute window for this trade has closed.",
	TransferFailed: "The USDC transfer failed. Check your balance and allowance.",
};

/**
 * Converts technical wallet/connector exceptions into clear, non-technical messages for users.
 */
export function formatUserFriendlyWalletError(
	err: unknown,
	fallback = "Could not complete wallet request. Please try again.",
): string {
	// viem ContractFunctionRevertedError carries the decoded custom error name.
	const walk = err as {
		data?: { errorName?: string };
		cause?: unknown;
		shortMessage?: string;
	} | null;
	let cursor: typeof walk = walk;
	for (let depth = 0; cursor && depth < 6; depth++) {
		const name = cursor.data?.errorName;
		if (name && CONTRACT_ERROR_MESSAGES[name]) return CONTRACT_ERROR_MESSAGES[name];
		cursor = cursor.cause as typeof walk;
	}

	const raw =
		(walk && typeof walk.shortMessage === "string" && walk.shortMessage) ||
		(err instanceof Error ? err.message : String(err ?? ""));
	const lower = raw.toLowerCase();

	if (
		lower.includes("user rejected") ||
		lower.includes("user denied") ||
		lower.includes("action_rejected") ||
		lower.includes("rejected the request") ||
		lower.includes("cancelled")
	) {
		return "You cancelled the request in your wallet.";
	}

	if (lower.includes("already pending") || lower.includes("-32002")) {
		return "A wallet prompt is already open. Please check your wallet extension.";
	}

	if (
		lower.includes("chain mismatch") ||
		lower.includes("does not match the target chain") ||
		(lower.includes("switch") && lower.includes("chain")) ||
		lower.includes("arc testnet")
	) {
		return "Switch your wallet to Arc Testnet (chain 5042002) and try again.";
	}

	if (lower.includes("timed out") || lower.includes("timeout")) {
		return "The network didn't confirm the transaction in time. Check ArcScan before retrying.";
	}

	if (
		lower.includes("getchainid") ||
		lower.includes("is not a function") ||
		lower.includes("connector") ||
		lower.includes("provider is disconnected")
	) {
		return "Your wallet connection needs a refresh. Disconnect and reconnect your wallet.";
	}

	if (
		lower.includes("insufficient funds") ||
		lower.includes("exceeds balance") ||
		lower.includes("insufficient balance")
	) {
		return "Not enough USDC in your wallet for this transaction (including gas).";
	}

	for (const [name, message] of Object.entries(CONTRACT_ERROR_MESSAGES)) {
		if (raw.includes(name)) return message;
	}

	// Never expose raw stack traces, TypeError strings, or RPC JSON blobs
	if (
		lower.includes("typeerror") ||
		lower.includes("undefined") ||
		lower.includes("null") ||
		lower.includes("viem") ||
		lower.includes("wagmi") ||
		raw.length > 140
	) {
		return fallback;
	}

	return raw || fallback;
}
