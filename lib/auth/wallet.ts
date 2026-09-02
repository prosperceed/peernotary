import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { verifyMessage, getAddress, isAddress } from "ethers";
import { cookies } from "next/headers";
import { getCollections, createOpaqueId, type AuthSession } from "@/lib/db/models";

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "peernotary_session";

function normalizeAddress(value: string): string {
	if (!isAddress(value)) throw new Error("Invalid wallet address");
	return getAddress(value);
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export async function createWalletChallenge(addressInput: string) {
	const address = normalizeAddress(addressInput);
	const { nonces } = await getCollections();
	const nonce = createOpaqueId(24);
	const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
	const message = `PeerNotary sign-in\nAddress: ${address}\nNonce: ${nonce}`;
	await nonces.insertOne({ address, nonce, message, expiresAt, createdAt: new Date() });
	return { address, message, expiresAt: expiresAt.toISOString() };
}

export async function signInWallet(
	addressInput: string,
	message: string,
	signature: string,
): Promise<AuthSession> {
	const address = normalizeAddress(addressInput);
	const { nonces, sessions } = await getCollections();
	const nonce = await nonces.findOne({ address, message, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
	if (!nonce) throw new Error("Challenge is invalid or expired");
	if (verifyMessage(message, signature).toLowerCase() !== address.toLowerCase()) {
		throw new Error("Wallet signature does not match address");
	}
	const consumed = await nonces.findOneAndUpdate(
		{ _id: nonce._id, usedAt: { $exists: false } },
		{ $set: { usedAt: new Date() } },
		{ returnDocument: "before" },
	);
	if (!consumed) throw new Error("Challenge has already been used");

	const token = randomBytes(32).toString("base64url");
	const session: AuthSession = {
		address,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		createdAt: new Date(),
	};
	await sessions.insertOne(session);
	(await cookies()).set(COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		expires: session.expiresAt,
		path: "/",
	});
	return session;
}

export async function requireWalletAddress(): Promise<string> {
	const token = (await cookies()).get(COOKIE_NAME)?.value;
	if (!token) throw new Error("Authentication required");
	const { sessions } = await getCollections();
	const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
	if (!session) throw new Error("Authentication required");
	return session.address;
}

export { COOKIE_NAME };
