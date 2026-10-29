import "server-only";

export interface SupabaseServerConfig {
	url: string;
	publishableKey: string;
	serviceRoleKey?: string;
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
	const url =
		process.env.SUPABASE_URL ??
		process.env.NEXT_PUBLIC_SUPABASE_URL ??
		"";
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
 * Server-only PostgREST upsert helper using the least-privilege credential required.
 * Never exposed to client bundles.
 */
export async function supabaseServerUpsert(
	table: string,
	payload: Record<string, unknown> | Record<string, unknown>[],
	options?: { onConflict?: string },
): Promise<boolean> {
	const cfg = getSupabaseServerConfig();
	if (!cfg) return false;

	const authKey = cfg.serviceRoleKey || cfg.publishableKey;
	const conflictQuery = options?.onConflict
		? `?on_conflict=${encodeURIComponent(options.onConflict)}`
		: "";

	try {
		const res = await fetch(`${cfg.url}/rest/v1/${table}${conflictQuery}`, {
			method: "POST",
			headers: {
				apikey: authKey,
				Authorization: `Bearer ${authKey}`,
				"Content-Type": "application/json",
				Prefer: "resolution=merge-duplicates,return=minimal",
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
