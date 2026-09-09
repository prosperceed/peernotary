import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress, verifyMessage } from "ethers";
import { cookies } from "next/headers";
import {
	createOpaqueId,
	getCollections,
	type AuthNonce,
	type AuthSession,
	type UserRecord,
} from "@/lib/db/models";

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "peernotary_session";
const DEFAULT_DOMAIN = "PeerNotary";
const CHAIN_ID = Number(process.env.AUTH_CHAIN_ID ?? "5042002");
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const inMemoryNonces = new Map<string, AuthNonce>();
const inMemoryUsers = new Map<string, UserRecord>();
const inMemorySessions = new Map<string, AuthSession>();

function makeMemoryLoginUser(address: string): UserRecord {
	const now = new Date();
	return {
		walletAddress: address,
		createdAt: now,
		updatedAt: now,
		lastAuthenticatedAt: now,
	};
}

function normalizeInMemoryNonceKey(address: string, nonce: string): string {
	return `${address.toLowerCase()}::${nonce}`;
}

function normalizeAddress(value: string): string {
	if (!isAddress(value)) throw new Error("Invalid wallet address");
	return getAddress(value);
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
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

function buildChallengeMessage(domain: string, address: string, nonce: string, issuedAt: string, expiresAt: string): string {
	return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nPeerNotary wallet authentication\n\nURI: ${domain}\nChain ID: ${CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}\nStatement: Authenticate this wallet for PeerNotary.`;
}

export async function createWalletChallenge(addressInput: string, requestDomain?: string) {
	const address = normalizeAddress(addressInput);
	checkRateLimit(`challenge:${address.toLowerCase()}`);
	const nonce = createOpaqueId(24);
	const issuedAt = new Date();
	const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
	const domain = process.env.AUTH_DOMAIN ?? requestDomain ?? DEFAULT_DOMAIN;
	const message = buildChallengeMessage(domain, address, nonce, issuedAt.toISOString(), expiresAt.toISOString());

	try {
		const { nonces, authEvents } = await getCollections();
		await nonces.insertOne({ address, nonce, message, domain, chainId: CHAIN_ID, expiresAt, createdAt: issuedAt });
		await authEvents.insertOne({ type: "challenge_issued", address, createdAt: issuedAt });
		return { address, nonce, message, expiresAt: expiresAt.toISOString() };
	} catch (error) {
		console.warn("Falling back to in-memory auth challenge store:", error instanceof Error ? error.message : error);
		inMemoryNonces.set(normalizeInMemoryNonceKey(address, nonce), {
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

	try {
		const { nonces, users, sessions, authEvents } = await getCollections();
		const challenge = await nonces.findOne({ address, nonce, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
		if (!challenge) throw new Error("Challenge is invalid or expired");
		if (verifyMessage(challenge.message, signature).toLowerCase() !== address.toLowerCase()) {
			throw new Error("Wallet signature does not match address");
		}
		const consumed = await nonces.findOneAndUpdate(
			{ _id: challenge._id, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
			{ $set: { usedAt: new Date() } },
			{ returnDocument: "before" },
		);
		if (!consumed) throw new Error("Challenge has already been used");

		let user: UserRecord;
		try {
			const now = new Date();
			const result = await users.findOneAndUpdate(
				{ walletAddress: address },
				{
					$set: { updatedAt: now, lastAuthenticatedAt: now },
					$setOnInsert: { walletAddress: address, createdAt: now, updatedAt: now, lastAuthenticatedAt: now },
				},
				{ upsert: true, returnDocument: "after" },
			);
			if (!result) throw new Error("User could not be created");
			user = result;
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || (error as { code?: number }).code !== 11000) throw error;
			const existing = await users.findOne({ walletAddress: address });
			if (!existing) throw error;
			user = existing;
		}

		const token = randomBytes(32).toString("base64url");
		const session: AuthSession = {
			userId: user._id,
			address,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
			createdAt: new Date(),
		};
		await sessions.insertOne(session);
		await authEvents.insertOne({ type: "authentication_succeeded", address, userId: user._id, createdAt: new Date() });
		(await cookies()).set(COOKIE_NAME, token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			expires: session.expiresAt,
			path: "/",
		});
		return session;
	} catch (error) {
		console.warn("Falling back to in-memory auth session store:", error instanceof Error ? error.message : error);
		const challenge = inMemoryNonces.get(normalizeInMemoryNonceKey(address, nonce));
		if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
			throw new Error("Challenge is invalid or expired");
		}
		if (verifyMessage(challenge.message, signature).toLowerCase() !== address.toLowerCase()) {
			throw new Error("Wallet signature does not match address");
		}

		challenge.usedAt = new Date();
		let user = inMemoryUsers.get(address.toLowerCase());
		if (!user) {
			user = makeMemoryLoginUser(address);
			inMemoryUsers.set(address.toLowerCase(), user);
		}
		user.updatedAt = new Date();
		user.lastAuthenticatedAt = user.updatedAt;

		const token = randomBytes(32).toString("base64url");
		const session: AuthSession = {
			address,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
			createdAt: new Date(),
		};
		inMemorySessions.set(session.tokenHash, session);
		(await cookies()).set(COOKIE_NAME, token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			expires: session.expiresAt,
			path: "/",
		});
		return session;
	}
}

export async function recordAuthenticationFailure(address?: string): Promise<void> {
	try {
		const { authEvents } = await getCollections();
		await authEvents.insertOne({
			type: "authentication_failed",
			address: address && isAddress(address) ? getAddress(address) : undefined,
			createdAt: new Date(),
		});
	} catch {
		// Authentication failures must not reveal database availability or details.
	}
}

export async function getAuthenticatedUser(): Promise<UserRecord> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");
	const tokenHash = hashToken(token);
	try {
		const { sessions, users } = await getCollections();
		const session = await sessions.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
		if (!session) throw new Error("Authentication required");
		const user = session.userId
			? await users.findOne({ _id: session.userId })
			: await users.findOne({ walletAddress: session.address });
		if (!user) throw new Error("Authentication required");
		return user;
	} catch {
		const session = inMemorySessions.get(tokenHash);
		if (!session || session.expiresAt <= new Date()) throw new Error("Authentication required");
		const user = inMemoryUsers.get(session.address.toLowerCase());
		if (!user) throw new Error("Authentication required");
		return user;
	}
}

export async function logoutWallet(): Promise<void> {
	const cookieStore = await cookies();
	const token = cookieStore.get(COOKIE_NAME)?.value;
	if (token) {
		try {
			const { sessions, authEvents } = await getCollections();
			const session = await sessions.findOneAndDelete({ tokenHash: hashToken(token) });
			if (session) await authEvents.insertOne({ type: "logout", address: session.address, userId: session.userId, createdAt: new Date() });
		} catch {
			inMemorySessions.delete(hashToken(token));
		}
	}
	cookieStore.delete(COOKIE_NAME);
}

export async function requireWalletAddress(): Promise<string> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");
	try {
		const { sessions } = await getCollections();
		const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
		if (!session) throw new Error("Authentication required");
		return session.address;
	} catch {
		const session = inMemorySessions.get(hashToken(token));
		if (!session || session.expiresAt <= new Date()) throw new Error("Authentication required");
		return session.address;
	}
}

export { COOKIE_NAME };
