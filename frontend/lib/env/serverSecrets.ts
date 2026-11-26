import "server-only";

import { APP_NETWORK, IS_MAINNET, NETWORK } from "./network";

/**
 * Server-only secrets for the active network. Testnet falls back to the
 * original unsuffixed names so existing .env files keep working; mainnet
 * never falls back, so a testnet value can't leak into live settlement.
 */
export interface ServerNetworkSecrets {
	rpcUrl: string;
	oraclePrivateKey: string | undefined;
	gasSponsorPrivateKey: string | undefined;
	flwSecretKey: string | undefined;
	flwSecretHash: string | undefined;
}

export function getServerNetworkSecrets(): ServerNetworkSecrets {
	if (IS_MAINNET) {
		return {
			rpcUrl: process.env.ARC_RPC_URL_MAINNET || NETWORK.rpcUrl,
			oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY_MAINNET,
			gasSponsorPrivateKey: process.env.ARC_PRIVATE_KEY_MAINNET,
			flwSecretKey: process.env.FLW_SECRET_KEY_LIVE?.trim(),
			flwSecretHash: process.env.FLW_SECRET_HASH_LIVE?.trim(),
		};
	}
	return {
		rpcUrl: process.env.ARC_RPC_URL_TESTNET || process.env.ARC_RPC_URL || NETWORK.rpcUrl,
		oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY_TESTNET || process.env.ORACLE_PRIVATE_KEY,
		gasSponsorPrivateKey: process.env.ARC_PRIVATE_KEY_TESTNET || process.env.ARC_PRIVATE_KEY,
		flwSecretKey: (process.env.FLW_SECRET_KEY_TEST || process.env.FLW_SECRET_KEY)?.trim(),
		flwSecretHash: (
			process.env.FLW_SECRET_HASH_TEST ||
			process.env.FLW_SECRET_HASH ||
			process.env.TLSN_WEBHOOK_SECRET
		)?.trim(),
	};
}

export type PaymentMode = "flutterwave_test" | "flutterwave_live" | "simulated";

/**
 * - testnet + FLWSECK_TEST- key → `flutterwave_test` (hosted checkout, test cards)
 * - mainnet + FLWSECK- live key → `flutterwave_live`
 * - testnet, no key, FLW_ALLOW_SIMULATED_PAYMENTS=true, not production → `simulated`
 * Anything else throws, including a live key on testnet or a test key on mainnet.
 */
export function getPaymentMode(): PaymentMode {
	const key = getServerNetworkSecrets().flwSecretKey;
	const isTestKey = !!key && key.startsWith("FLWSECK_TEST-");

	if (IS_MAINNET) {
		if (!key) throw new Error("Mainnet requires FLW_SECRET_KEY_LIVE.");
		if (isTestKey) throw new Error("FLW_SECRET_KEY_LIVE is a test key; mainnet needs a live FLWSECK- key.");
		return "flutterwave_live";
	}

	if (key) {
		if (!isTestKey) {
			throw new Error(
				"A live Flutterwave key is configured while NEXT_PUBLIC_APP_NETWORK=testnet. Use a FLWSECK_TEST- key.",
			);
		}
		return "flutterwave_test";
	}
	if (process.env.FLW_ALLOW_SIMULATED_PAYMENTS === "true" && process.env.NODE_ENV !== "production") {
		return "simulated";
	}
	throw new Error(
		`Flutterwave is not configured for ${APP_NETWORK}. Set FLW_SECRET_KEY_TEST (or FLW_ALLOW_SIMULATED_PAYMENTS=true for local dev).`,
	);
}
