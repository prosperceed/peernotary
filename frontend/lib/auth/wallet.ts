import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { cookies } from "next/headers";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface AuthNonce {
	address: string;
	nonce: string;
	message: string;
	domain: string;
	chainId: number;
	expiresAt: Date;
	usedAt?: Date;
	createdAt: Date;
}

export interface UserRecord {
	walletAddress: string;
	createdAt: Date;
	updatedAt: Date;
	lastAuthenticatedAt: Date;
}

export interface AuthSession {
	userId?: string;
	address: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const NONCE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = "peernotary_session";
const DEFAULT_DOMAIN = "PeerNotary";
const CHAIN_ID = Number(process.env.AUTH_CHAIN_ID ?? "5042002");
const RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const RATE_LIMIT_MAX = 30;

// ─── IN-MEMORY STORES ─────────────────────────────────────────────────────────

const inMemoryNonces   = new Map<string, AuthNonce>();
const inMemoryUsers    = new Map<string, UserRecord>();
const inMemorySessions = new Map<string, AuthSession>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizeAddress(value: string): string {
	if (!isAddress(value)) throw new Error("Invalid wallet address");
	return getAddress(value);
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** Opaque random hex ID */
function createOpaqueId(bytes = 32): string {
	return randomBytes(bytes).toString("hex");
}

function nonceKey(address: string, nonce: string): string {
	return `${address.toLowerCase()}::${nonce}`;
}

function checkRateLimit(key: string): void {
	const now = Date.now();
	const bucket = rateLimitBuckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return;
	}
	if (bucket.count >= RATE_LIMIT_MAX) throw new Error("Rate limit exceeded");
	bucket.count += 1;
}

function buildChallengeMessage(
	domain: string,
	address: string,
	nonce: string,
	issuedAt: string,
	expiresAt: string,
): string {
	return (
		`${domain} wants you to sign in with your Ethereum account:\n${address}\n\n` +
		`PeerNotary wallet authentication\n\n` +
		`URI: ${domain}\n` +
		`Chain ID: ${CHAIN_ID}\n` +
		`Nonce: ${nonce}\n` +
		`Issued At: ${issuedAt}\n` +
		`Expiration Time: ${expiresAt}\n` +
		`Statement: Authenticate this wallet for PeerNotary.`
	);
}

// ─── EXPORTED AUTH FUNCTIONS ──────────────────────────────────────────────────

export async function createWalletChallenge(
	addressInput: string,
	requestDomain?: string,
) {
	const address = normalizeAddress(addressInput);
	checkRateLimit(`challenge:${address.toLowerCase()}`);

	const nonce      = createOpaqueId(24);
	const issuedAt   = new Date();
	const expiresAt  = new Date(Date.now() + NONCE_TTL_MS);
	const domain     = process.env.AUTH_DOMAIN ?? requestDomain ?? DEFAULT_DOMAIN;
	const message    = buildChallengeMessage(
		domain,
		address,
		nonce,
		issuedAt.toISOString(),
		expiresAt.toISOString(),
	);

	inMemoryNonces.set(nonceKey(address, nonce), {
		address,
		nonce,
		message,
		domain,
		chainId: CHAIN_ID,
		expiresAt,
		createdAt: issuedAt,
	});

	return { address, nonce, message, expiresAt: expiresAt.toISOString() };
}

export async function signInWallet(
	addressInput: string,
	nonce: string,
	signature: string,
): Promise<AuthSession> {
	const address = normalizeAddress(addressInput);
	checkRateLimit(`verify:${address.toLowerCase()}`);

	if (!/^[a-f0-9]{48}$/i.test(nonce) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
		throw new Error("Malformed authentication request");
	}

	const challenge = inMemoryNonces.get(nonceKey(address, nonce));
	if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
		throw new Error("Challenge is invalid or expired");
	}
	if (verifyMessage(challenge.message, signature).toLowerCase() !== address.toLowerCase()) {
		throw new Error("Wallet signature does not match address");
	}

	// Mark nonce as used (one-time)
	challenge.usedAt = new Date();

	// Upsert user
	const now  = new Date();
	let user   = inMemoryUsers.get(address.toLowerCase());
	if (!user) {
		user = { walletAddress: address, createdAt: now, updatedAt: now, lastAuthenticatedAt: now };
		inMemoryUsers.set(address.toLowerCase(), user);
	} else {
		user.updatedAt            = now;
		user.lastAuthenticatedAt  = now;
	}

	// Create session
	const token   = randomBytes(32).toString("base64url");
	const session: AuthSession = {
		address,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		createdAt: now,
	};
	inMemorySessions.set(session.tokenHash, session);

	(await cookies()).set(COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "lax",
		secure:   process.env.NODE_ENV === "production",
		expires:  session.expiresAt,
		path:     "/",
	});

	return session;
}

export async function recordAuthenticationFailure(_address?: string): Promise<void> {
	// No-op in pure in-memory mode — failures are not persisted
}

export async function getAuthenticatedUser(expectedAddress?: string): Promise<UserRecord> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");

	const session = inMemorySessions.get(hashToken(token));
	if (!session || session.expiresAt <= new Date()) throw new Error("Authentication required");

	if (
		expectedAddress &&
		session.address.toLowerCase() !== expectedAddress.toLowerCase()
	) {
		await logoutWallet();
		throw new Error("Wallet session mismatch");
	}

	const user = inMemoryUsers.get(session.address.toLowerCase());
	if (!user) throw new Error("Authentication required");
	return user;
}

export async function logoutWallet(): Promise<void> {
	const cookieStore = await cookies();
	const token = cookieStore.get(COOKIE_NAME)?.value;
	if (token) {
		inMemorySessions.delete(hashToken(token));
	}
	cookieStore.delete(COOKIE_NAME);
}

export async function requireWalletAddress(expectedAddress?: string): Promise<string> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");

	const session = inMemorySessions.get(hashToken(token));
	if (!session || session.expiresAt <= new Date()) throw new Error("Authentication required");

	if (
		expectedAddress &&
		session.address.toLowerCase() !== expectedAddress.toLowerCase()
	) {
		await logoutWallet();
		throw new Error("Wallet session mismatch");
	}

	return session.address;
}

export { COOKIE_NAME };
