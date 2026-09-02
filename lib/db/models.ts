import "server-only";

import { randomBytes } from "node:crypto";
import type { Collection, Db, IndexDescription, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";

export type VerificationStatus =
	| "pending"
	| "proof_received"
	| "verified"
	| "oracle_pending"
	| "completed"
	| "failed";

export interface AuthNonce {
	_id?: ObjectId;
	address: string;
	nonce: string;
	message: string;
	expiresAt: Date;
	usedAt?: Date;
	createdAt: Date;
}

export interface AuthSession {
	_id?: ObjectId;
	address: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
}

export interface VerificationRecord {
	_id?: ObjectId;
	tradeId: string;
	verificationId: string;
	sessionId: string;
	address: string;
	purpose: "payment_verification";
	status: VerificationStatus;
	amount: string;
	paymentReference: string;
	proofId?: string;
	proofHash?: string;
	oracleTransactionHash?: string;
	failureReason?: string;
	createdAt: Date;
	updatedAt: Date;
	expiresAt: Date;
	activeKey?: string;
}

export interface TradeRecord {
	_id?: ObjectId;
	onChainTradeId: string;
	seller: string;
	buyer: string;
	cryptoAmount: string;
	paymentAmount: string;
	paymentReference: string;
	status: "created" | "funded" | "fiat_sent" | "completed" | "disputed" | "resolved";
	createdAt: Date;
	updatedAt: Date;
}

export async function getCollections(): Promise<{
	nonces: Collection<AuthNonce>;
	sessions: Collection<AuthSession>;
	verifications: Collection<VerificationRecord>;
	trades: Collection<TradeRecord>;
}> {
	const db = await getDatabase();
	const nonces = db.collection<AuthNonce>("auth_nonces");
	const sessions = db.collection<AuthSession>("auth_sessions");
	const verifications = db.collection<VerificationRecord>("verifications");
	const trades = db.collection<TradeRecord>("trades");

	await ensureIndexes(db);
	return { nonces, sessions, verifications, trades };
}

let indexesReady: Promise<void> | undefined;

async function ensureIndexes(db: Db): Promise<void> {
	if (!indexesReady) {
		indexesReady = Promise.all([
			createIndexes(db.collection<AuthNonce>("auth_nonces"), [
				{ key: { nonce: 1 }, unique: true },
				{ key: { expiresAt: 1 }, expireAfterSeconds: 0 },
			]),
			createIndexes(db.collection<AuthSession>("auth_sessions"), [
				{ key: { tokenHash: 1 }, unique: true },
				{ key: { expiresAt: 1 }, expireAfterSeconds: 0 },
			]),
			createIndexes(db.collection<VerificationRecord>("verifications"), [
				{ key: { verificationId: 1 }, unique: true },
				{ key: { sessionId: 1 }, unique: true },
				{ key: { tradeId: 1, status: 1 } },
				{ key: { proofId: 1 }, unique: true, sparse: true },
				{ key: { activeKey: 1 }, unique: true, sparse: true },
			]),
			createIndexes(db.collection<TradeRecord>("trades"), [
				{ key: { onChainTradeId: 1 }, unique: true },
			]),
		]).then(() => undefined);
	}
	await indexesReady;
}

async function createIndexes<TSchema extends object>(
	collection: Collection<TSchema>,
	indexes: IndexDescription[],
): Promise<void> {
	await collection.createIndexes(indexes);
}

export function createOpaqueId(bytes = 32): string {
	return randomBytes(bytes).toString("hex");
}
