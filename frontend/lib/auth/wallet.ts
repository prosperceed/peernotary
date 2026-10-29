import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { cookies } from "next/headers";
import { supabaseServerUpsert } from "@/lib/supabase/server";

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
	createdAt: Date;
	updatedAt: Date;
	lastAuthenticatedAt: Date;
}

export interface AuthSession {
	id: string;
	userId: string;
	address: string;
	tokenHash: string;
	expiresAt: Date;
	revokedAt?: Date;
	createdAt: Date;
}

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "peernotary_session";
const DEFAULT_DOMAIN = "PeerNotary";
const CHAIN_ID = Number(process.env.AUTH_CHAIN_ID ?? process.env.ARC_CHAIN_ID ?? "5042002");
const RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const RATE_LIMIT_MAX = 30;

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
		throw new Error("Username may only contain lowercase letters, numbers, and underscores.");
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

export async function setWalletUsername(
	walletAddress: string,
	options: { username?: string; skipOnboarding?: boolean },
): Promise<UserRecord> {
	const normalizedAddr = normalizeAddress(walletAddress);
	const lowerKey = normalizedAddr.toLowerCase();
	const now = new Date();

	let user = inMemoryUsers.get(lowerKey);
	if (!user) {
		user = {
			id: randomUUID(),
			walletAddress: normalizedAddr,
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
			lastAuthenticatedAt: now,
		};
		inMemoryUsers.set(lowerKey, user);
	}

	if (options.skipOnboarding && !options.username) {
		user.onboardingCompleted = true;
		user.updatedAt = now;
		void supabaseServerUpsert(
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
	const existingOwner = usernameDirectory.get(cleanUsername);
	if (existingOwner && existingOwner !== lowerKey) {
		throw new Error("Username is already taken by another trader.");
	}

	if (user.username && user.username !== cleanUsername) {
		usernameDirectory.delete(user.username);
	}

	usernameDirectory.set(cleanUsername, lowerKey);
	user.username = cleanUsername;
	user.onboardingCompleted = true;
	user.updatedAt = now;

	void supabaseServerUpsert(
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

	void supabaseServerUpsert(
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

	return { address, nonce, message, expiresAt: expiresAt.toISOString() };
}

export async function signInWallet(
	addressInput: string,
	nonce: string,
	signature: string,
): Promise<{ session: AuthSession; user: UserRecord }> {
	const address = normalizeAddress(addressInput);
	const lowerAddr = address.toLowerCase();
	checkRateLimit(`verify:${lowerAddr}`);

	if (!/^[a-f0-9]{48}$/i.test(nonce) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
		throw new Error("Malformed authentication request");
	}

	const challenge = inMemoryNonces.get(nonceKey(address, nonce));
	if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
		throw new Error("Challenge is invalid or expired");
	}
	if (verifyMessage(challenge.message, signature).toLowerCase() !== lowerAddr) {
		throw new Error("Wallet signature does not match address");
	}

	const now = new Date();
	challenge.usedAt = now;

	let user = inMemoryUsers.get(lowerAddr);
	if (!user) {
		user = {
			id: randomUUID(),
			walletAddress: address,
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
			lastAuthenticatedAt: now,
		};
		inMemoryUsers.set(lowerAddr, user);
	} else {
		user.updatedAt = now;
		user.lastAuthenticatedAt = now;
	}

	const token = randomBytes(32).toString("base64url");
	const session: AuthSession = {
		id: randomUUID(),
		userId: user.id,
		address,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		createdAt: now,
	};
	inMemorySessions.set(session.tokenHash, session);

	void supabaseServerUpsert(
		"profiles",
		{
			id: user.id,
			username: user.username ?? null,
			onboarding_completed: user.onboardingCompleted,
			updated_at: now.toISOString(),
		},
		{ onConflict: "id" },
	);

	void supabaseServerUpsert(
		"wallet_accounts",
		{
			profile_id: user.id,
			wallet_address: lowerAddr,
			chain_id: CHAIN_ID,
			last_authenticated_at: now.toISOString(),
		},
		{ onConflict: "wallet_address" },
	);

	void supabaseServerUpsert(
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

	(await cookies()).set(COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		expires: session.expiresAt,
		path: "/",
	});

	return { session, user };
}

export async function recordAuthenticationFailure(_address?: string): Promise<void> {}

export async function getAuthenticatedUser(expectedAddress?: string): Promise<UserRecord> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");

	const session = inMemorySessions.get(hashToken(token));
	if (!session || session.revokedAt || session.expiresAt <= new Date()) {
		throw new Error("Authentication required");
	}

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
		const hashed = hashToken(token);
		const existing = inMemorySessions.get(hashed);
		if (existing) {
			existing.revokedAt = new Date();
		}
		inMemorySessions.delete(hashed);
	}
	cookieStore.delete(COOKIE_NAME);
}

export async function requireWalletAddress(expectedAddress?: string): Promise<string> {
	const user = await getAuthenticatedUser(expectedAddress);
	return user.walletAddress;
}

export { COOKIE_NAME };
