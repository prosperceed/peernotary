import "server-only";

const SESSION_ID = /^[A-Za-z0-9._:-]{16,200}$/;

export interface TlsnWebhookPayload {
	sessionId: unknown;
	server_name: unknown;
	sessionData: unknown;
	redactedTranscript?: unknown;
}

export interface VerificationExpectation {
	tradeId: string;
	amount: string;
	paymentReference: string;
	allowedHostnames: readonly string[];
}

export type VerificationFailure =
	| "MALFORMED_PROOF"
	| "INVALID_SESSION"
	| "UNEXPECTED_HOST"
	| "MISSING_PAYMENT_FIELDS"
	| "MISMATCHED_PAYMENT";

export type VerificationResult =
	| { valid: true; sessionId: string }
	| { valid: false; reason: VerificationFailure };

export function validateTlsnPayload(
	payload: TlsnWebhookPayload,
	expectation: VerificationExpectation,
): VerificationResult {
	if (
		typeof payload.sessionId !== "string" ||
		!SESSION_ID.test(payload.sessionId) ||
		typeof payload.sessionData !== "object" ||
		payload.sessionData === null ||
		typeof payload.server_name !== "string"
	) {
		return { valid: false, reason: "MALFORMED_PROOF" };
	}
	if (!expectation.allowedHostnames.includes(payload.server_name)) {
		return { valid: false, reason: "UNEXPECTED_HOST" };
	}

	const data = payload.sessionData as Record<string, unknown>;
	if (
		typeof data.tradeId !== "string" ||
		typeof data.amount !== "string" ||
		typeof data.paymentReference !== "string" ||
		typeof data.paymentStatus !== "string"
	) {
		return { valid: false, reason: "MISSING_PAYMENT_FIELDS" };
	}
	if (
		data.tradeId !== expectation.tradeId ||
		data.amount !== expectation.amount ||
		data.paymentReference !== expectation.paymentReference ||
		data.paymentStatus !== "completed"
	) {
		return { valid: false, reason: "MISMATCHED_PAYMENT" };
	}
	return { valid: true, sessionId: payload.sessionId };
}
