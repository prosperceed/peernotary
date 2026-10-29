import "server-only";

import { createHmac } from "node:crypto";

export interface SupabaseServerConfig {
	url: string;
	publishableKey: string;
	serviceRoleKey?: string;
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
	const url =
		process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
	const publishableKey =
		process.env.SUPABASE_PUBLISHABLE_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
		"";
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || (!publishableKey && !serviceRoleKey)) {
		return null;
	}

	return {
		url: url.replace(/\/$/, ""),
		publishableKey: publishableKey || serviceRoleKey || "",
		serviceRoleKey,
	};
}

/**
 * Server-only PostgREST SELECT helper using the service role key.
 */
export async function supabaseServerSelect<T = Record<string, unknown>>(
	table: string,
	queryParams: string,
): Promise<T[]> {
	const cfg = getSupabaseServerConfig();
	if (!cfg) return [];

	const authKey = cfg.serviceRoleKey || cfg.publishableKey;
	const qs = queryParams.startsWith("?") ? queryParams : `?${queryParams}`;

	try {
		const res = await fetch(`${cfg.url}/rest/v1/${table}${qs}`, {
			method: "GET",
			headers: {
				apikey: authKey,
				Authorization: `Bearer ${authKey}`,
				Accept: "application/json",
			},
			cache: "no-store",
			signal: AbortSignal.timeout(6_000),
		});
		if (!res.ok) return [];
		const data = (await res.json()) as unknown;
		return Array.isArray(data) ? (data as T[]) : [];
	} catch {
		return [];
	}
}

/**
 * Server-only PostgREST UPSERT helper with optional representation return.
 */
export async function supabaseServerUpsert<T = Record<string, unknown>>(
	table: string,
	payload: Record<string, unknown> | Record<string, unknown>[],
	options?: { onConflict?: string; returnRepresentation?: boolean },
): Promise<T[] | null> {
	const cfg = getSupabaseServerConfig();
	if (!cfg) return null;

	const authKey = cfg.serviceRoleKey || cfg.publishableKey;
	const conflictQuery = options?.onConflict
		? `?on_conflict=${encodeURIComponent(options.onConflict)}`
		: "";
	const returnMode = options?.returnRepresentation
		? "return=representation"
		: "return=minimal";

	try {
		const res = await fetch(`${cfg.url}/rest/v1/${table}${conflictQuery}`, {
			method: "POST",
			headers: {
				apikey: authKey,
				Authorization: `Bearer ${authKey}`,
				"Content-Type": "application/json",
				Prefer: `resolution=merge-duplicates,${returnMode}`,
			},
			body: JSON.stringify(payload),
			cache: "no-store",
			signal: AbortSignal.timeout(6_000),
		});
		if (!res.ok) return null;
		if (!options?.returnRepresentation) return [];
		const data = (await res.json()) as unknown;
		return Array.isArray(data) ? (data as T[]) : [];
	} catch {
		return null;
	}
}

/**
 * Server-only PostgREST PATCH (update) helper.
 */
export async function supabaseServerUpdate(
	table: string,
	filterQuery: string,
	payload: Record<string, unknown>,
): Promise<boolean> {
	const cfg = getSupabaseServerConfig();
	if (!cfg) return false;

	const authKey = cfg.serviceRoleKey || cfg.publishableKey;
	const qs = filterQuery.startsWith("?") ? filterQuery : `?${filterQuery}`;

	try {
		const res = await fetch(`${cfg.url}/rest/v1/${table}${qs}`, {
			method: "PATCH",
			headers: {
				apikey: authKey,
				Authorization: `Bearer ${authKey}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(payload),
			cache: "no-store",
			signal: AbortSignal.timeout(6_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Server-only RPC invocation for atomic database functions such as `transition_trade_atomic`.
 */
export async function supabaseServerRpc<T = unknown>(
	fnName: string,
	args: Record<string, unknown>,
): Promise<T | null> {
	const cfg = getSupabaseServerConfig();
	if (!cfg) return null;

	const authKey = cfg.serviceRoleKey || cfg.publishableKey;
	try {
		const res = await fetch(`${cfg.url}/rest/v1/rpc/${fnName}`, {
			method: "POST",
			headers: {
				apikey: authKey,
				Authorization: `Bearer ${authKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(args),
			cache: "no-store",
			signal: AbortSignal.timeout(6_000),
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Mints a signed Supabase-compatible HS256 JWT bound to the authenticated wallet profile
 * so the user's `sub` (profile UUID), `wallet_address`, and `authenticated` role privileges
 * are preserved across requests and RLS policies.
 */
export function mintSupabaseWalletJwt(params: {
	userId: string;
	walletAddress: string;
	username?: string;
	chainId: number;
	sessionId: string;
	expiresAt: Date;
}): string {
	const secret =
		process.env.SUPABASE_JWT_SECRET ||
		process.env.WALLET_SESSION_SECRET ||
		process.env.TLSN_WEBHOOK_SECRET ||
		"peernotary-wallet-session-signing-secret";

	const nowSec = Math.floor(Date.now() / 1000);
	const expSec = Math.floor(params.expiresAt.getTime() / 1000);

	const header = Buffer.from(
		JSON.stringify({ alg: "HS256", typ: "JWT" }),
	).toString("base64url");

	const payload = Buffer.from(
		JSON.stringify({
			aud: "authenticated",
			role: "authenticated",
			sub: params.userId,
			session_id: params.sessionId,
			wallet_address: params.walletAddress.toLowerCase(),
			chain_id: params.chainId,
			user_metadata: {
				wallet_address: params.walletAddress,
				username: params.username ?? null,
				chain_id: params.chainId,
			},
			app_metadata: {
				provider: "wallet",
				providers: ["wallet"],
				privileges: [
					"trader",
					"escrow_participant",
					"flutterwave_checkout",
					"tlsn_verifier",
				],
			},
			iat: nowSec,
			exp: expSec,
		}),
	).toString("base64url");

	const signature = createHmac("sha256", secret)
		.update(`${header}.${payload}`)
		.digest("base64url");

	return `${header}.${payload}.${signature}`;
}
