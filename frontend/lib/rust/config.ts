import "server-only";
import { IS_MAINNET, NETWORK } from "@/lib/env/network";

export interface RustBackendConfig {
	baseUrl: string;
	apiKey: string;
	timeoutMs: number;
	coldStartRetries: number;
	escrowAddress: string;
	expectedChainId: number;
}

const DEFAULT_LOCAL_URL = "http://127.0.0.1:7047";
const DEFAULT_PRODUCTION_URL = "https://peernotary.onrender.com";
const DEFAULT_TIMEOUT_MS = 25_000; // 25s to gracefully handle Render cold starts
const DEFAULT_COLD_START_RETRIES = 2; // Retry transient 502/503/504 gateway wakeups
const DEFAULT_SERVICE_API_KEY =
	"959f0dfb574a455e1a7672085b012655e5732e4087611991d19f4a3de3b350af";

function resolveBaseUrl(): string {
	const raw =
		(IS_MAINNET ? process.env.RUST_API_BASE_URL_MAINNET : undefined) ||
		process.env.RUST_API_BASE_URL ||
		process.env.TLSN_VERIFIER_URL ||
		(process.env.NODE_ENV === "production"
			? DEFAULT_PRODUCTION_URL
			: DEFAULT_LOCAL_URL);

	try {
		const parsed = new URL(raw.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error("Protocol must be http: or https:");
		}
		// Strip trailing slashes
		return parsed.origin + parsed.pathname.replace(/\/+$/, "");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Invalid Rust backend URL configuration (${raw}): ${message}`,
		);
	}
}

function resolveApiKey(): string {
	const key =
		process.env.TLSN_SERVICE_API_KEY ??
		process.env.TLSN_WEBHOOK_SECRET ??
		process.env.RUST_API_KEY ??
		DEFAULT_SERVICE_API_KEY;

	return key.trim();
}

function resolveTimeoutMs(): number {
	const raw = process.env.RUST_API_TIMEOUT_MS;
	if (raw) {
		const parsed = parseInt(raw, 10);
		if (!Number.isNaN(parsed) && parsed > 500 && parsed <= 120_000) {
			return parsed;
		}
	}
	return DEFAULT_TIMEOUT_MS;
}

export function getRustBackendConfig(): RustBackendConfig {
	return {
		baseUrl: resolveBaseUrl(),
		apiKey: resolveApiKey(),
		timeoutMs: resolveTimeoutMs(),
		coldStartRetries: DEFAULT_COLD_START_RETRIES,
		escrowAddress: NETWORK.escrowAddress.toLowerCase(),
		expectedChainId: NETWORK.chainId,
	};
}
