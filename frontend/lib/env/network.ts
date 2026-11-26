/**
 * Network switch: testnet ⇄ mainnet.
 *
 *   NEXT_PUBLIC_APP_NETWORK=testnet   (default)
 *   NEXT_PUBLIC_APP_NETWORK=mainnet
 *
 * Both networks are configured side by side in .env with their own chain,
 * contracts, Flutterwave keys and oracle key, so going live is a one-line
 * change plus a rebuild. Public values live here (safe for the browser);
 * secrets are read by `getServerNetworkSecrets()` in `./serverSecrets`.
 *
 * NOTE: Next.js only inlines NEXT_PUBLIC_* vars that are referenced
 * literally, so every variable below is spelled out instead of built
 * from a string.
 */

export type AppNetwork = "testnet" | "mainnet";

const rawNetwork = (process.env.NEXT_PUBLIC_APP_NETWORK ?? "testnet").trim().toLowerCase();
if (rawNetwork !== "testnet" && rawNetwork !== "mainnet") {
	throw new Error(`NEXT_PUBLIC_APP_NETWORK must be "testnet" or "mainnet", got "${rawNetwork}".`);
}

export const APP_NETWORK: AppNetwork = rawNetwork;
export const IS_TESTNET = APP_NETWORK === "testnet";
export const IS_MAINNET = APP_NETWORK === "mainnet";

export interface PublicNetworkConfig {
	network: AppNetwork;
	chainId: number;
	chainName: string;
	rpcUrl: string;
	explorerUrl: string;
	escrowAddress: `0x${string}`;
	usdcAddress: `0x${string}`;
	/** Flutterwave mode the UI should expect. */
	paymentsLabel: string;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const TESTNET: PublicNetworkConfig = {
	network: "testnet",
	chainId: 5042002,
	chainName: "Arc Testnet",
	rpcUrl:
		process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ||
		process.env.NEXT_PUBLIC_ARC_RPC_URL ||
		"https://rpc.testnet.arc.io",
	explorerUrl: process.env.NEXT_PUBLIC_ARC_TESTNET_EXPLORER_URL || "https://testnet.arcscan.app",
	escrowAddress: (process.env.NEXT_PUBLIC_TESTNET_ESCROW_ADDRESS ||
		process.env.NEXT_PUBLIC_ESCROW_ADDRESS ||
		"0xAEC65F8De5c5f893c6Cd5f101D290869fFEd9dAe") as `0x${string}`,
	usdcAddress: (process.env.NEXT_PUBLIC_TESTNET_USDC_ADDRESS ||
		process.env.NEXT_PUBLIC_USDC_ADDRESS ||
		"0x3600000000000000000000000000000000000000") as `0x${string}`,
	paymentsLabel: "Flutterwave test mode",
};

// Mainnet has no defaults on purpose: every value must be set explicitly.
const MAINNET: PublicNetworkConfig = {
	network: "mainnet",
	chainId: Number(process.env.NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID || 0),
	chainName: process.env.NEXT_PUBLIC_ARC_MAINNET_CHAIN_NAME || "Arc",
	rpcUrl: process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "",
	explorerUrl: process.env.NEXT_PUBLIC_ARC_MAINNET_EXPLORER_URL || "",
	escrowAddress: (process.env.NEXT_PUBLIC_MAINNET_ESCROW_ADDRESS || ZERO) as `0x${string}`,
	usdcAddress: (process.env.NEXT_PUBLIC_MAINNET_USDC_ADDRESS || ZERO) as `0x${string}`,
	paymentsLabel: "Flutterwave live",
};

export const NETWORKS: Record<AppNetwork, PublicNetworkConfig> = {
	testnet: TESTNET,
	mainnet: MAINNET,
};

/** Missing mainnet values, so a half-configured switch fails loudly. */
export function missingPublicConfig(cfg: PublicNetworkConfig): string[] {
	const missing: string[] = [];
	if (!cfg.chainId) missing.push("NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID");
	if (!cfg.rpcUrl) missing.push("NEXT_PUBLIC_ARC_MAINNET_RPC_URL");
	if (!cfg.explorerUrl) missing.push("NEXT_PUBLIC_ARC_MAINNET_EXPLORER_URL");
	if (cfg.escrowAddress === ZERO) missing.push("NEXT_PUBLIC_MAINNET_ESCROW_ADDRESS");
	if (cfg.usdcAddress === ZERO) missing.push("NEXT_PUBLIC_MAINNET_USDC_ADDRESS");
	return missing;
}

if (IS_MAINNET) {
	const missing = missingPublicConfig(MAINNET);
	if (missing.length) {
		throw new Error(`NEXT_PUBLIC_APP_NETWORK=mainnet but these are not set: ${missing.join(", ")}`);
	}
}

/** The active network's public configuration. */
export const NETWORK: PublicNetworkConfig = NETWORKS[APP_NETWORK];
