import "server-only";

import {
	createHash,
	createHmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { cookies } from "next/headers";
import {
	mintSupabaseWalletJwt,
	supabaseServerSelect,
	supabaseServerUpdate,
	supabaseServerUpsert,
} from "@/lib/supabase/server";

export type WalletPrivilege =
	| "trader"
	| "escrow_participant"
	| "flutterwave_checkout"
	| "tlsn_verifier";

export interface AuthNonce {
	id: string;
	address: string;
	nonce: string;
	message: string;
	domain: string;
	uri: string;
	chainId: number;
	expiresAt: Date;
	usedAt?: Date;
	createdAt: Date;
}

export interface UserRecord {
	id: string;
	walletAddress: string;
	username?: string;
	onboardingCompleted: boolean;
	privileges: WalletPrivilege[];
	createdAt: Date;
	updatedAt: Date;
	lastAuthenticatedAt: Date;
}

export interface AuthSession {
	id: string;
	userId: string;
	address: string;
	chainId: number;
	tokenHash: string;
	supabaseAccessToken: string;
	privileges: WalletPrivilege[];
	expiresAt: Date;
	revokedAt?: Date;
	createdAt: Date;
}

const DEFAULT_PRIVILEGES: WalletPrivilege[] = [
	"trader",
	"escrow_participant",
	"flutterwave_checkout",
	"tlsn_verifier",
];

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "peernotary_session";
const SUPABASE_TOKEN_COOKIE = "peernotary_sb_token";
const DEFAULT_DOMAIN = "PeerNotary";
const CHAIN_ID = Number(
	process.env.AUTH_CHAIN_ID ?? process.env.ARC_CHAIN_ID ?? "5042002",
);
const RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const RATE_LIMIT_MAX = 40;

const RESERVED_USERNAMES = new Set([
	"admin",
	"system",
	"support",
	"peernotary",
	"flutterwave",
	"arc",
	"escrow",
	"oracle",
	"moderator",
	"root",
	"api",
	"help",
	"security",
	"official",
	"treasury",
	"null",
	"undefined",
]);

const inMemoryNonces = new Map<string, AuthNonce>();
const inMemoryUsers = new Map<string, UserRecord>();
const inMemorySessions = new Map<string, AuthSession>();
const usernameDirectory = new Map<string, string>(); // username -> lowercase walletAddress
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getSessionSecret(): string {
	return (
		process.env.WALLET_SESSION_SECRET ||
		process.env.TLSN_WEBHOOK_SECRET ||
		"peernotary-default-wallet-session-secret-key"
	);
}

function normalizeAddress(value: string): string {
	if (!isAddress(value)) throw new Error("Invalid wallet address");
	return getAddress(value);
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function createOpaqueId(bytes = 24): string {
	return randomBytes(bytes).toString("hex");
}

function nonceKey(address: string, nonce: string): string {
	return `${address.toLowerCase()}::${nonce}`;
}

interface SignedCookieEnvelope {
	rawToken: string;
	sessionId: string;
	userId: string;
	walletAddress: string;
	username?: string;
	onboardingCompleted: boolean;
	chainId: number;
	privileges: WalletPrivilege[];
	exp: number;
}

function encodeSignedCookie(envelope: SignedCookieEnvelope): string {
	const payloadB64 = Buffer.from(JSON.stringify(envelope)).toString(
		"base64url",
	);
	const sig = createHmac("sha256", getSessionSecret())
		.update(`${envelope.rawToken}.${payloadB64}`)
		.digest("base64url");
	return `${envelope.rawToken}.${payloadB64}.${sig}`;
}

function decodeSignedCookie(cookieValue: string): SignedCookieEnvelope | null {
	const parts = cookieValue.split(".");
	if (parts.length !== 3) return null;
	const [rawToken, payloadB64, sig] = parts;
	if (!rawToken || !payloadB64 || !sig) return null;

	const expectedSig = createHmac("sha256", getSessionSecret())
		.update(`${rawToken}.${payloadB64}`)
		.digest("base64url");

	const a = Buffer.from(sig);
	const b = Buffer.from(expectedSig);
	if (a.length !== b.length || !timingSafeEqual(a, b)) {
		return null;
	}

	try {
		const parsed = JSON.parse(
			Buffer.from(payloadB64, "base64url").toString("utf8"),
		) as SignedCookieEnvelope;
		if (!parsed || typeof parsed.exp !== "number" || parsed.exp <= Date.now()) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function checkRateLimit(key: string): void {
	const now = Date.now();
	const bucket = rateLimitBuckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		rateLimitBuckets.set(key, {
			count: 1,
			resetAt: now + RATE_LIMIT_WINDOW_MS,
		});
		return;
	}
	if (bucket.count >= RATE_LIMIT_MAX) throw new Error("Rate limit exceeded");
	bucket.count += 1;
}

function buildChallengeMessage(
	domain: string,
	uri: string,
	address: string,
	nonce: string,
	issuedAt: string,
	expiresAt: string,
): string {
	return (
		`${domain} wants you to sign in with your Ethereum account:\n${address}\n\n` +
		`PeerNotary wallet authentication\n\n` +
		`URI: ${uri}\n` +
		`Chain ID: ${CHAIN_ID}\n` +
		`Nonce: ${nonce}\n` +
		`Issued At: ${issuedAt}\n` +
		`Expiration Time: ${expiresAt}\n` +
		`Statement: Authenticate this wallet for PeerNotary.`
	);
}

export function validateAndNormalizeUsername(raw: string): string {
	const normalized = raw.trim().replace(/^@+/, "").toLowerCase();
	if (normalized.length < 3 || normalized.length > 24) {
		throw new Error("Username must be between 3 and 24 characters.");
	}
	if (!/^[a-z0-9_]+$/.test(normalized)) {
		throw new Error(
			"Username may only contain lowercase letters, numbers, and underscores.",
		);
	}
	if (
		RESERVED_USERNAMES.has(normalized) ||
		normalized.startsWith("admin_") ||
		normalized.startsWith("peernotary_") ||
		normalized.startsWith("system_")
	) {
		throw new Error("This username is reserved and cannot be claimed.");
	}
	return normalized;
}

export function getUsernameForAddress(address: string): string | undefined {
	return inMemoryUsers.get(address.toLowerCase())?.username;
}

async function resolveOrCreateSupabaseUser(
	normalizedAddress: string,
): Promise<UserRecord> {
	const lowerAddr = normalizedAddress.toLowerCase();
	const now = new Date();

	// 1. Check Supabase `wallet_accounts` + `profiles` first so user identity and privileges persist
	const walletRows = await supabaseServerSelect<{
		profile_id: string;
		wallet_address: string;
		chain_id: number;
	}>(
		"wallet_accounts",
		`wallet_address=eq.${encodeURIComponent(lowerAddr)}&select=profile_id,wallet_address,chain_id&limit=1`,
	);

	if (walletRows.length > 0 && walletRows[0].profile_id) {
		const profileId = walletRows[0].profile_id;
		const profileRows = await supabaseServerSelect<{
			id: string;
			username: string | null;
			onboarding_completed: boolean;
			created_at: string;
			updated_at: string;
		}>(
			"profiles",
			`id=eq.${encodeURIComponent(profileId)}&select=id,username,onboarding_completed,created_at,updated_at&limit=1`,
		);

		const prof = profileRows[0];
		const user: UserRecord = {
			id: profileId,
			walletAddress: normalizedAddress,
			username: prof?.username ?? inMemoryUsers.get(lowerAddr)?.username,
			onboardingCompleted:
				Boolean(prof?.onboarding_completed) ||
				Boolean(prof?.username) ||
				Boolean(inMemoryUsers.get(lowerAddr)?.onboardingCompleted),
			privileges: [...DEFAULT_PRIVILEGES],
			createdAt: prof?.created_at ? new Date(prof.created_at) : now,
			updatedAt: now,
			lastAuthenticatedAt: now,
		};

		if (user.username) {
			usernameDirectory.set(user.username.toLowerCase(), lowerAddr);
		}
		inMemoryUsers.set(lowerAddr, user);

		void supabaseServerUpdate(
			"wallet_accounts",
			`wallet_address=eq.${encodeURIComponent(lowerAddr)}`,
			{
				last_authenticated_at: now.toISOString(),
				updated_at: now.toISOString(),
			},
		);

		return user;
	}

	// 2. Fallback to existing in-memory user or create a new profile + wallet_account
	let user = inMemoryUsers.get(lowerAddr);
	if (!user) {
		user = {
			id: randomUUID(),
			walletAddress: normalizedAddress,
			onboardingCompleted: false,
			privileges: [...DEFAULT_PRIVILEGES],
			createdAt: now,
			updatedAt: now,
			lastAuthenticatedAt: now,
		};
		inMemoryUsers.set(lowerAddr, user);
	} else {
		user.updatedAt = now;
		user.lastAuthenticatedAt = now;
	}

	await supabaseServerUpsert(
		"profiles",
		{
			id: user.id,
			username: user.username ?? null,
			onboarding_completed: user.onboardingCompleted,
			updated_at: now.toISOString(),
		},
		{ onConflict: "id" },
	);

	await supabaseServerUpsert(
		"wallet_accounts",
		{
			profile_id: user.id,
			wallet_address: lowerAddr,
			chain_id: CHAIN_ID,
			is_primary: true,
			last_authenticated_at: now.toISOString(),
		},
		{ onConflict: "wallet_address" },
	);

	return user;
}

export async function setWalletUsername(
	walletAddress: string,
	options: { username?: string; skipOnboarding?: boolean },
): Promise<UserRecord> {
	const normalizedAddr = normalizeAddress(walletAddress);
	const lowerKey = normalizedAddr.toLowerCase();
	const now = new Date();

	const user = await resolveOrCreateSupabaseUser(normalizedAddr);

	if (options.skipOnboarding && !options.username) {
		user.onboardingCompleted = true;
		user.updatedAt = now;
		await supabaseServerUpsert(
			"profiles",
			{
				id: user.id,
				onboarding_completed: true,
				updated_at: now.toISOString(),
			},
			{ onConflict: "id" },
		);
		return user;
	}

	if (!options.username) {
		throw new Error("Username is required.");
	}

	const cleanUsername = validateAndNormalizeUsername(options.username);

	// Check both in-memory directory and Supabase `profiles` for uniqueness
	const existingOwner = usernameDirectory.get(cleanUsername);
	if (existingOwner && existingOwner !== lowerKey) {
		throw new Error("Username is already taken by another trader.");
	}

	const dbConflicts = await supabaseServerSelect<{ id: string }>(
		"profiles",
		`username=ilike.${encodeURIComponent(cleanUsername)}&select=id&limit=1`,
	);
	if (dbConflicts.length > 0 && dbConflicts[0].id !== user.id) {
		throw new Error("Username is already taken by another trader.");
	}

	if (user.username && user.username !== cleanUsername) {
		usernameDirectory.delete(user.username);
	}

	usernameDirectory.set(cleanUsername, lowerKey);
	user.username = cleanUsername;
	user.onboardingCompleted = true;
	user.updatedAt = now;

	await supabaseServerUpsert(
		"profiles",
		{
			id: user.id,
			username: cleanUsername,
			onboarding_completed: true,
			updated_at: now.toISOString(),
		},
		{ onConflict: "id" },
	);

	return user;
}

export async function createWalletChallenge(
	addressInput: string,
	requestDomain?: string,
) {
	const address = normalizeAddress(addressInput);
	checkRateLimit(`challenge:${address.toLowerCase()}`);

	const nonce = createOpaqueId(24);
	const issuedAt = new Date();
	const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
	const domain = process.env.AUTH_DOMAIN ?? requestDomain ?? DEFAULT_DOMAIN;
	const uri = process.env.NEXT_PUBLIC_APP_URL ?? `https://${domain}`;
	const message = buildChallengeMessage(
		domain,
		uri,
		address,
		nonce,
		issuedAt.toISOString(),
		expiresAt.toISOString(),
	);

	const record: AuthNonce = {
		id: randomUUID(),
		address,
		nonce,
		message,
		domain,
		uri,
		chainId: CHAIN_ID,
		expiresAt,
		createdAt: issuedAt,
	};

	inMemoryNonces.set(nonceKey(address, nonce), record);

	await supabaseServerUpsert(
		"wallet_nonces",
		{
			id: record.id,
			wallet_address: address.toLowerCase(),
			nonce,
			domain,
			uri,
			chain_id: CHAIN_ID,
			statement: "Authenticate this wallet for PeerNotary.",
			message,
			issued_at: issuedAt.toISOString(),
			expires_at: expiresAt.toISOString(),
		},
		{ onConflict: "nonce" },
	);

	return {
		address,
		nonce,
		message,
		chainId: CHAIN_ID,
		expiresAt: expiresAt.toISOString(),
	};
}

export async function signInWallet(
	addressInput: string,
	nonce: string,
	signature: string,
): Promise<{ session: AuthSession; user: UserRecord }> {
	const address = normalizeAddress(addressInput);
	const lowerAddr = address.toLowerCase();
	checkRateLimit(`verify:${lowerAddr}`);

	if (
		!/^[a-f0-9]{48}$/i.test(nonce) ||
		!/^0x[0-9a-fA-F]{130}$/.test(signature)
	) {
		throw new Error("Malformed authentication request");
	}

	let challenge = inMemoryNonces.get(nonceKey(address, nonce));

	// If not in local memory (e.g. serverless invocation or dev hot-reload), load from Supabase `wallet_nonces`
	if (!challenge) {
		const rows = await supabaseServerSelect<{
			id: string;
			wallet_address: string;
			nonce: string;
			message: string;
			domain: string;
			uri: string;
			chain_id: number;
			expires_at: string;
			used_at: string | null;
			created_at: string;
		}>(
			"wallet_nonces",
			`nonce=eq.${encodeURIComponent(nonce)}&wallet_address=eq.${encodeURIComponent(lowerAddr)}&limit=1`,
		);
		if (rows.length > 0) {
			const row = rows[0];
			challenge = {
				id: row.id,
				address,
				nonce: row.nonce,
				message: row.message,
				domain: row.domain,
				uri: row.uri,
				chainId: row.chain_id,
				expiresAt: new Date(row.expires_at),
				usedAt: row.used_at ? new Date(row.used_at) : undefined,
				createdAt: new Date(row.created_at),
			};
			inMemoryNonces.set(nonceKey(address, nonce), challenge);
		}
	}

	if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
		throw new Error("Challenge is invalid or expired");
	}
	if (verifyMessage(challenge.message, signature).toLowerCase() !== lowerAddr) {
		throw new Error("Wallet signature does not match address");
	}

	const now = new Date();
	challenge.usedAt = now;

	// Mark nonce as consumed in Supabase
	void supabaseServerUpdate(
		"wallet_nonces",
		`nonce=eq.${encodeURIComponent(nonce)}`,
		{ used_at: now.toISOString() },
	);

	// Resolve or create the user's persistent Supabase profile and wallet account
	const user = await resolveOrCreateSupabaseUser(address);

	const rawToken = randomBytes(32).toString("base64url");
	const sessionId = randomUUID();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	const supabaseAccessToken = mintSupabaseWalletJwt({
		userId: user.id,
		walletAddress: address,
		username: user.username,
		chainId: CHAIN_ID,
		sessionId,
		expiresAt,
	});

	const session: AuthSession = {
		id: sessionId,
		userId: user.id,
		address,
		chainId: CHAIN_ID,
		tokenHash: hashToken(rawToken),
		supabaseAccessToken,
		privileges: [...user.privileges],
		expiresAt,
		createdAt: now,
	};
	inMemorySessions.set(session.tokenHash, session);

	await supabaseServerUpsert(
		"wallet_sessions",
		{
			id: session.id,
			profile_id: user.id,
			wallet_address: lowerAddr,
			token_hash: session.tokenHash,
			chain_id: CHAIN_ID,
			expires_at: session.expiresAt.toISOString(),
			last_active_at: now.toISOString(),
		},
		{ onConflict: "token_hash" },
	);

	const cookieValue = encodeSignedCookie({
		rawToken,
		sessionId: session.id,
		userId: user.id,
		walletAddress: address,
		username: user.username,
		onboardingCompleted: user.onboardingCompleted,
		chainId: CHAIN_ID,
		privileges: user.privileges,
		exp: expiresAt.getTime(),
	});

	const cookieStore = await cookies();
	cookieStore.set(COOKIE_NAME, cookieValue, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		expires: session.expiresAt,
		path: "/",
	});

	cookieStore.set(SUPABASE_TOKEN_COOKIE, supabaseAccessToken, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		expires: session.expiresAt,
		path: "/",
	});

	return { session, user };
}

export async function recordAuthenticationFailure(
	_address?: string,
): Promise<void> {}

export async function getAuthenticatedSessionAndUser(
	expectedAddress?: string,
): Promise<{ session: AuthSession; user: UserRecord }> {
	const cookieStore = await cookies();
	const cookieVal = cookieStore.get(COOKIE_NAME)?.value;
	if (!cookieVal) throw new Error("Authentication required");

	const envelope = decodeSignedCookie(cookieVal);
	const rawToken = envelope ? envelope.rawToken : cookieVal;
	const tokenHash = hashToken(rawToken);

	let session = inMemorySessions.get(tokenHash);
	let user = session
		? inMemoryUsers.get(session.address.toLowerCase())
		: undefined;

	// Rehydrate from Supabase `wallet_sessions` + `profiles` or signed envelope if memory was cleared
	if (!session || !user) {
		const dbSessions = await supabaseServerSelect<{
			id: string;
			profile_id: string;
			wallet_address: string;
			token_hash: string;
			chain_id: number;
			expires_at: string;
			revoked_at: string | null;
			created_at: string;
		}>(
			"wallet_sessions",
			`token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&limit=1`,
		);

		if (dbSessions.length > 0) {
			const row = dbSessions[0];
			const expiresAt = new Date(row.expires_at);
			if (expiresAt > new Date()) {
				const resolvedAddr = normalizeAddress(row.wallet_address);
				user = await resolveOrCreateSupabaseUser(resolvedAddr);
				const supabaseAccessToken = mintSupabaseWalletJwt({
					userId: user.id,
					walletAddress: resolvedAddr,
					username: user.username,
					chainId: row.chain_id || CHAIN_ID,
					sessionId: row.id,
					expiresAt,
				});
				session = {
					id: row.id,
					userId: user.id,
					address: resolvedAddr,
					chainId: row.chain_id || CHAIN_ID,
					tokenHash,
					supabaseAccessToken,
					privileges: [...user.privileges],
					expiresAt,
					createdAt: new Date(row.created_at),
				};
				inMemorySessions.set(tokenHash, session);
			}
		} else if (envelope && envelope.exp > Date.now()) {
			const resolvedAddr = normalizeAddress(envelope.walletAddress);
			const expiresAt = new Date(envelope.exp);
			user = inMemoryUsers.get(resolvedAddr.toLowerCase()) ?? {
				id: envelope.userId,
				walletAddress: resolvedAddr,
				username: envelope.username,
				onboardingCompleted: envelope.onboardingCompleted,
				privileges: envelope.privileges ?? [...DEFAULT_PRIVILEGES],
				createdAt: new Date(),
				updatedAt: new Date(),
				lastAuthenticatedAt: new Date(),
			};
			inMemoryUsers.set(resolvedAddr.toLowerCase(), user);

			const supabaseAccessToken = mintSupabaseWalletJwt({
				userId: user.id,
				walletAddress: resolvedAddr,
				username: user.username,
				chainId: envelope.chainId || CHAIN_ID,
				sessionId: envelope.sessionId,
				expiresAt,
			});
			session = {
				id: envelope.sessionId,
				userId: user.id,
				address: resolvedAddr,
				chainId: envelope.chainId || CHAIN_ID,
				tokenHash,
				supabaseAccessToken,
				privileges: [...user.privileges],
				expiresAt,
				createdAt: new Date(),
			};
			inMemorySessions.set(tokenHash, session);
		}
	}

	if (
		!session ||
		!user ||
		session.revokedAt ||
		session.expiresAt <= new Date()
	) {
		throw new Error("Authentication required");
	}

	if (
		expectedAddress &&
		session.address.toLowerCase() !== expectedAddress.toLowerCase()
	) {
		await logoutWallet();
		throw new Error("Wallet session mismatch");
	}

	return { session, user };
}

export async function getAuthenticatedUser(
	expectedAddress?: string,
): Promise<UserRecord> {
	const { user } = await getAuthenticatedSessionAndUser(expectedAddress);
	return user;
}

export async function logoutWallet(): Promise<void> {
	const cookieStore = await cookies();
	const cookieVal = cookieStore.get(COOKIE_NAME)?.value;
	if (cookieVal) {
		const envelope = decodeSignedCookie(cookieVal);
		const rawToken = envelope ? envelope.rawToken : cookieVal;
		const hashed = hashToken(rawToken);
		const existing = inMemorySessions.get(hashed);
		if (existing) {
			existing.revokedAt = new Date();
		}
		inMemorySessions.delete(hashed);

		void supabaseServerUpdate(
			"wallet_sessions",
			`token_hash=eq.${encodeURIComponent(hashed)}`,
			{ revoked_at: new Date().toISOString() },
		);
	}
	cookieStore.delete(COOKIE_NAME);
	cookieStore.delete(SUPABASE_TOKEN_COOKIE);
}

export async function requireWalletAddress(
	expectedAddress?: string,
): Promise<string> {
	const user = await getAuthenticatedUser(expectedAddress);
	return user.walletAddress;
}

export { COOKIE_NAME, SUPABASE_TOKEN_COOKIE };
