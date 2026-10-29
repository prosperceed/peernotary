"use client";

import { signWalletMessage } from "@/lib/web3/arcConfig";

export interface SupabaseWalletUser {
	id: string;
	walletAddress: string;
	username: string | null;
	onboardingCompleted: boolean;
	privileges: string[];
	createdAt?: string;
}

export interface SupabaseWalletSession {
	id: string;
	chainId: number;
	expiresAt: string;
	supabaseAccessToken: string;
	privileges: string[];
}

export interface WalletAuthState {
	authenticated: boolean;
	session: SupabaseWalletSession | null;
	user: SupabaseWalletUser | null;
}

const STORAGE_KEY = "peernotary_supabase_wallet_session";

function readCachedAuthState(expectedAddress?: string): WalletAuthState | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as WalletAuthState;
		if (
			!parsed?.authenticated ||
			!parsed.session?.expiresAt ||
			!parsed.user?.walletAddress
		) {
			return null;
		}
		if (new Date(parsed.session.expiresAt).getTime() <= Date.now()) {
			window.localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		if (
			expectedAddress &&
			parsed.user.walletAddress.toLowerCase() !== expectedAddress.toLowerCase()
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function writeCachedAuthState(state: WalletAuthState | null): void {
	if (typeof window === "undefined") return;
	try {
		if (!state || !state.authenticated) {
			window.localStorage.removeItem(STORAGE_KEY);
			return;
		}
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage quota errors
	}
}

function broadcastAuthState(state: WalletAuthState): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent("peernotary-auth-change", {
			detail: state,
		}),
	);
}

/**
 * Verifies and returns the active Supabase wallet session for `walletAddress`,
 * synchronizing client cache with the server's `peernotary_session` & `wallet_sessions` table.
 */
export async function getSupabaseWalletSession(
	walletAddress?: string,
): Promise<WalletAuthState> {
	if (!walletAddress) {
		return { authenticated: false, session: null, user: null };
	}

	const normalizedAddress = walletAddress.toLowerCase();

	try {
		const res = await fetch("/api/auth/session", {
			method: "GET",
			cache: "no-store",
			headers: { "x-wallet-address": normalizedAddress },
		});
		const data = (await res.json()) as {
			authenticated?: boolean;
			session?: SupabaseWalletSession | null;
			user?: SupabaseWalletUser | null;
		};

		if (
			res.ok &&
			data.authenticated &&
			data.user?.walletAddress?.toLowerCase() === normalizedAddress &&
			data.session
		) {
			const state: WalletAuthState = {
				authenticated: true,
				session: data.session,
				user: data.user,
			};
			writeCachedAuthState(state);
			return state;
		}
	} catch {
		const cached = readCachedAuthState(normalizedAddress);
		if (cached) return cached;
	}

	writeCachedAuthState(null);
	return { authenticated: false, session: null, user: null };
}

/**
 * Binds WalletConnect / injected wallet connection with Supabase `walletSignin`:
 * 1. Reuses an existing valid Supabase session if already authenticated for `address`.
 * 2. Otherwise requests a single-use nonce from `/api/auth/nonce` (`wallet_nonces`),
 *    signs the EIP-191 challenge, and verifies via `/api/auth/verify`.
 * 3. Persists the resulting Supabase `wallet_sessions` record, JWT access token,
 *    and user privileges across cookies, localStorage, and live UI listeners.
 */
export async function supabaseWalletSignin(params: {
	address: `0x${string}`;
	wagmiSignAsync?: (args: {
		message: string;
		account?: `0x${string}`;
	}) => Promise<`0x${string}`>;
	forceReauth?: boolean;
}): Promise<WalletAuthState> {
	const { address, wagmiSignAsync, forceReauth = false } = params;

	if (!forceReauth) {
		const existing = await getSupabaseWalletSession(address);
		if (existing.authenticated && existing.session && existing.user) {
			broadcastAuthState(existing);
			return existing;
		}
	}

	const challengeRes = await fetch("/api/auth/nonce", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ address }),
	});

	if (!challengeRes.ok) {
		throw new Error("Could not initialize sign-in request. Please try again.");
	}

	const challenge = (await challengeRes.json()) as {
		nonce: string;
		message: string;
	};

	const signature = await signWalletMessage(
		challenge.message,
		address,
		wagmiSignAsync,
	);

	const verifyRes = await fetch("/api/auth/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			address,
			nonce: challenge.nonce,
			signature,
		}),
	});

	if (!verifyRes.ok) {
		throw new Error("Signature verification failed. Please sign in again.");
	}

	const verified = (await verifyRes.json()) as {
		authenticated: boolean;
		session: SupabaseWalletSession;
		user: SupabaseWalletUser;
	};

	const state: WalletAuthState = {
		authenticated: true,
		session: verified.session,
		user: verified.user,
	};

	writeCachedAuthState(state);
	broadcastAuthState(state);
	return state;
}

/**
 * Alias for `supabaseWalletSignin` to match `walletSignin` naming convention.
 */
export const walletSignin = supabaseWalletSignin;

/**
 * Revokes the active Supabase wallet session (`wallet_sessions`) and clears client auth state.
 */
export async function supabaseWalletSignOut(): Promise<void> {
	writeCachedAuthState(null);
	await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
	broadcastAuthState({
		authenticated: false,
		session: null,
		user: null,
	});
}

export interface RealtimeTradeSubscriptionOptions {
	tradeId?: string;
	walletAddress?: string;
	onStatusHint: () => void;
	pollIntervalMs?: number;
}

/**
 * Subscribes to informational trade status updates via Supabase Realtime WebSocket
 * authenticated with the user's Supabase wallet JWT when available,
 * and maintains a safe polling fallback that revalidates authoritative state from the server.
 */
export function subscribeToTradeUpdates(
	options: RealtimeTradeSubscriptionOptions,
): () => void {
	const pollMs = options.pollIntervalMs ?? 8_000;
	const intervalId = window.setInterval(() => {
		options.onStatusHint();
	}, pollMs);

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey =
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	let ws: WebSocket | null = null;
	if (supabaseUrl && publishableKey && typeof WebSocket !== "undefined") {
		try {
			const cached = readCachedAuthState(options.walletAddress);
			const accessToken = cached?.session?.supabaseAccessToken;

			const wsBase = supabaseUrl
				.replace(/^https:\/\//i, "wss://")
				.replace(/^http:\/\//i, "ws://")
				.replace(/\/$/, "");
			const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(publishableKey)}&vsn=1.0.0`;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				ws?.send(
					JSON.stringify({
						topic: "realtime:public:trades",
						event: "phx_join",
						payload: accessToken ? { access_token: accessToken } : {},
						ref: "1",
					}),
				);
			};

			ws.onmessage = () => {
				options.onStatusHint();
			};
		} catch {
			ws = null;
		}
	}

	return () => {
		window.clearInterval(intervalId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
	};
}
