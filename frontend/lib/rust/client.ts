import "server-only";

import { getRustBackendConfig, type RustBackendConfig } from "./config";
import type {
	RustChallengeRequest,
	RustChallengeResponse,
	RustCheckoutRequest,
	RustCheckoutResponse,
	RustCreateListingRequest,
	RustCreateSessionRequest,
	RustCreateSessionResponse,
	RustCreateTradeRequest,
	RustEscrowReleaseRequest,
	RustEscrowReleaseResponse,
	RustEvaluateEscrowReleaseRequest,
	RustEvaluateEscrowReleaseResponse,
	RustExecuteSessionRequest,
	RustHealthResponse,
	RustListingOrderRequest,
	RustListingOrderResponse,
	RustLiveResponse,
	RustPayoutRequest,
	RustPayoutResponse,
	RustProofEvidenceResponse,
	RustProofRecord,
	RustProofSummaryResponse,
	RustReadyResponse,
	RustRefundRequest,
	RustRefundResponse,
	RustSellerListingRecord,
	RustSessionRecord,
	RustTradeRecord,
	RustUserProfileRecord,
	RustUserTrustProfile,
	RustVerifyPaymentRequest,
	RustVerifyPaymentResponse,
	RustVerifyProofRequest,
	RustVerifyWalletRequest,
	RustVerifyWalletResponse,
} from "./types";

export class RustApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code: string,
		public readonly endpoint: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "RustApiError";
	}
}

interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	walletAddress?: string;
	idempotencyKey?: string;
	timeoutMs?: number;
	retries?: number;
}

export class RustApiClient {
	private readonly config: RustBackendConfig;

	constructor(config?: RustBackendConfig) {
		this.config = config ?? getRustBackendConfig();
	}

	public getBaseUrl(): string {
		return this.config.baseUrl;
	}

	public getEscrowAddress(): string {
		return this.config.escrowAddress;
	}

	public getExpectedChainId(): number {
		return this.config.expectedChainId;
	}

	private async request<T>(
		endpoint: string,
		options: RequestOptions = {},
	): Promise<T> {
		const method = options.method ?? "GET";
		const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
		const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
		const maxRetries = options.retries ?? (method === "GET" ? this.config.coldStartRetries : 0);

		const headers: Record<string, string> = {
			authorization: `Bearer ${this.config.apiKey}`,
		};

		if (options.walletAddress) {
			headers["x-wallet-address"] = options.walletAddress.toLowerCase();
		}

		if (options.idempotencyKey) {
			headers["idempotency-key"] = options.idempotencyKey;
		}

		let bodyStr: string | undefined;
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
			bodyStr = JSON.stringify(options.body);
		}

		let attempt = 0;
		while (true) {
			attempt += 1;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);

			try {
				const response = await fetch(url, {
					method,
					headers,
					body: bodyStr,
					cache: "no-store",
					signal: controller.signal,
				});
				clearTimeout(timer);

				// If Render is waking up or gateway has transient 502/503/504, retry for safe requests
				if (
					(response.status === 502 || response.status === 503 || response.status === 504) &&
					attempt <= maxRetries
				) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}

				if (!response.ok) {
					let errorPayload: unknown;
					let errorMessage = `Rust backend request failed (${response.status} ${response.statusText})`;
					let errorCode = `HTTP_${response.status}`;

					try {
						const errJson = await response.json();
						errorPayload = errJson;
						if (errJson && typeof errJson === "object") {
							if ("error" in errJson && typeof errJson.error === "string") {
								errorMessage = errJson.error;
								errorCode = errJson.error;
							} else if ("message" in errJson && typeof errJson.message === "string") {
								errorMessage = errJson.message;
							}
						}
					} catch {
						try {
							const text = await response.text();
							if (text) {
								errorMessage = text.slice(0, 300);
							}
						} catch {
							// Ignored
						}
					}

					throw new RustApiError(
						errorMessage,
						response.status,
						errorCode,
						endpoint,
						errorPayload,
					);
				}

				return (await response.json()) as T;
			} catch (err) {
				clearTimeout(timer);

				if (err instanceof RustApiError) {
					throw err;
				}

				const isTimeout =
					err instanceof Error &&
					(err.name === "AbortError" || err.message.toLowerCase().includes("timeout"));

				if (attempt <= maxRetries && !isTimeout) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}

				const message = isTimeout
					? `Rust backend request timed out after ${timeoutMs}ms (${endpoint})`
					: `Network error connecting to Rust backend (${endpoint}): ${err instanceof Error ? err.message : String(err)}`;

				throw new RustApiError(
					message,
					isTimeout ? 504 : 503,
					isTimeout ? "GATEWAY_TIMEOUT" : "SERVICE_UNAVAILABLE",
					endpoint,
					err,
				);
			}
		}
	}

	// ─── HEALTH CHECK ENDPOINTS ───────────────────────────────────────────────

	public async getHealth(): Promise<RustHealthResponse> {
		return this.request<RustHealthResponse>("/health", {
			method: "GET",
			timeoutMs: 12_000,
			retries: 2,
		});
	}

	public async getHealthLive(): Promise<RustLiveResponse> {
		return this.request<RustLiveResponse>("/health/live", {
			method: "GET",
			timeoutMs: 8_000,
			retries: 2,
		});
	}

	public async getHealthReady(): Promise<RustReadyResponse> {
		return this.request<RustReadyResponse>("/health/ready", {
			method: "GET",
			timeoutMs: 8_000,
			retries: 2,
		});
	}

	// ─── TLSNOTARY SESSION ENDPOINTS ──────────────────────────────────────────

	public async createSession(
		req: RustCreateSessionRequest,
		walletAddress?: string,
	): Promise<RustCreateSessionResponse> {
		const numericAmount =
			typeof req.expected_amount_units === "bigint"
				? Number(req.expected_amount_units)
				: typeof req.expected_amount_units === "string"
					? parseInt(req.expected_amount_units.replace(/[^0-9]/g, ""), 10) || 0
					: req.expected_amount_units;

		return this.request<RustCreateSessionResponse>("/api/v1/sessions", {
			method: "POST",
			walletAddress: walletAddress ?? req.buyer_address,
			idempotencyKey: req.idempotency_key ?? undefined,
			body: {
				trade_id: req.trade_id,
				buyer_address: req.buyer_address,
				expected_amount_units: numericAmount,
				expected_currency: req.expected_currency,
				payment_reference: req.payment_reference,
				expected_recipient_hash: req.expected_recipient_hash ?? null,
				target_hostname: req.target_hostname,
				idempotency_key: req.idempotency_key ?? null,
			},
		});
	}

	public async getSession(
		sessionId: string,
		walletAddress?: string,
	): Promise<RustSessionRecord> {
		return this.request<RustSessionRecord>(
			`/api/v1/sessions/${encodeURIComponent(sessionId)}`,
			{
				method: "GET",
				walletAddress,
			},
		);
	}

	public async executeSession(
		sessionId: string,
		req: RustExecuteSessionRequest,
		walletAddress?: string,
	): Promise<RustProofSummaryResponse> {
		return this.request<RustProofSummaryResponse>(
			`/api/v1/sessions/${encodeURIComponent(sessionId)}/execute`,
			{
				method: "POST",
				walletAddress,
				body: {
					presentation_bincode_hex: req.presentation_bincode_hex ?? null,
					payment_status: null,
				},
				timeoutMs: 30_000, // Presentation verification can take several seconds
			},
		);
	}

	public async cancelSession(
		sessionId: string,
		walletAddress?: string,
	): Promise<{ session_id: string; state: string }> {
		return this.request<{ session_id: string; state: string }>(
			`/api/v1/sessions/${encodeURIComponent(sessionId)}/cancel`,
			{
				method: "POST",
				walletAddress,
			},
		);
	}

	// ─── PROOFS & EVIDENCE ENDPOINTS ──────────────────────────────────────────

	public async verifyProof(
		req: RustVerifyProofRequest,
		walletAddress?: string,
	): Promise<RustProofSummaryResponse> {
		return this.request<RustProofSummaryResponse>("/api/v1/proofs/verify", {
			method: "POST",
			walletAddress: walletAddress ?? req.buyer_address,
			body: req,
			timeoutMs: 30_000,
		});
	}

	public async getProof(
		proofId: string,
		walletAddress?: string,
	): Promise<RustProofRecord> {
		return this.request<RustProofRecord>(
			`/api/v1/proofs/${encodeURIComponent(proofId)}`,
			{
				method: "GET",
				walletAddress,
			},
		);
	}

	public async getProofEvidence(
		proofId: string,
		walletAddress?: string,
	): Promise<RustProofEvidenceResponse> {
		return this.request<RustProofEvidenceResponse>(
			`/api/v1/proofs/${encodeURIComponent(proofId)}/evidence`,
			{
				method: "GET",
				walletAddress,
			},
		);
	}

	public async evaluateEscrowRelease(
		req: RustEvaluateEscrowReleaseRequest,
		walletAddress?: string,
	): Promise<RustEvaluateEscrowReleaseResponse> {
		const numericAmount =
			typeof req.expected_amount_units === "bigint"
				? Number(req.expected_amount_units)
				: typeof req.expected_amount_units === "string"
					? parseInt(req.expected_amount_units.replace(/[^0-9]/g, ""), 10) || 0
					: req.expected_amount_units;

		return this.request<RustEvaluateEscrowReleaseResponse>(
			"/api/v1/escrow/evaluate-release",
			{
				method: "POST",
				walletAddress: walletAddress ?? req.buyer_address,
				body: {
					session_id: req.session_id,
					proof_id: req.proof_id,
					trade_id: req.trade_id,
					buyer_address: req.buyer_address,
					expected_amount_units: numericAmount,
					expected_currency: req.expected_currency,
					expected_payment_reference: req.expected_payment_reference,
					chain_id: req.chain_id,
					escrow_address: req.escrow_address.toLowerCase(),
				},
			},
		);
	}

	// ─── WALLET AUTHENTICATION & PROFILES ─────────────────────────────────────

	public async createAuthChallenge(
		req: RustChallengeRequest,
	): Promise<RustChallengeResponse> {
		return this.request<RustChallengeResponse>("/api/v1/auth/challenge", {
			method: "POST",
			body: req,
		});
	}

	public async verifyWalletSignature(
		req: RustVerifyWalletRequest,
	): Promise<RustVerifyWalletResponse> {
		return this.request<RustVerifyWalletResponse>("/api/v1/auth/verify", {
			method: "POST",
			body: req,
		});
	}

	public async getUserProfile(
		walletAddress: string,
	): Promise<RustUserProfileRecord> {
		return this.request<RustUserProfileRecord>("/api/v1/users/profile", {
			method: "GET",
			walletAddress,
		});
	}

	public async updateUsername(
		username: string,
		walletAddress: string,
	): Promise<RustUserProfileRecord> {
		return this.request<RustUserProfileRecord>("/api/v1/users/username", {
			method: "PUT",
			walletAddress,
			body: { username },
		});
	}

	public async getUserTrustProfile(
		walletAddress: string,
	): Promise<RustUserTrustProfile> {
		return this.request<RustUserTrustProfile>("/api/v1/users/trust", {
			method: "GET",
			walletAddress,
		});
	}

	// ─── SELLER LISTINGS & PARTIAL QUEUE ──────────────────────────────────────

	public async listSellerListings(): Promise<RustSellerListingRecord[]> {
		return this.request<RustSellerListingRecord[]>("/api/v1/listings", {
			method: "GET",
			retries: 2,
		});
	}

	public async createSellerListing(
		req: RustCreateListingRequest,
		walletAddress?: string,
	): Promise<RustSellerListingRecord> {
		return this.request<RustSellerListingRecord>("/api/v1/listings", {
			method: "POST",
			walletAddress: walletAddress ?? req.seller_address,
			body: req,
		});
	}

	public async requestListingOrder(
		listingRef: string,
		req: RustListingOrderRequest,
		walletAddress?: string,
	): Promise<RustListingOrderResponse> {
		return this.request<RustListingOrderResponse>(
			`/api/v1/listings/${encodeURIComponent(listingRef)}/orders`,
			{
				method: "POST",
				walletAddress: walletAddress ?? req.buyer_address,
				idempotencyKey: req.idempotency_key,
				body: req,
			},
		);
	}

	// ─── TRADES, CHECKOUT & PAYOUTS ───────────────────────────────────────────

	public async createOrRegisterTrade(
		req: RustCreateTradeRequest,
		walletAddress?: string,
	): Promise<RustTradeRecord> {
		return this.request<RustTradeRecord>("/api/v1/trades", {
			method: "POST",
			walletAddress: walletAddress ?? req.buyer_address,
			body: req,
		});
	}

	public async getTradeDetail(
		tradeId: string,
		walletAddress?: string,
	): Promise<RustTradeRecord> {
		return this.request<RustTradeRecord>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}`,
			{
				method: "GET",
				walletAddress,
			},
		);
	}

	public async initCheckout(
		tradeId: string,
		req: RustCheckoutRequest,
		walletAddress?: string,
	): Promise<RustCheckoutResponse> {
		return this.request<RustCheckoutResponse>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}/checkout`,
			{
				method: "POST",
				walletAddress,
				idempotencyKey: req.idempotency_key,
				body: req,
			},
		);
	}

	public async verifyPayment(
		tradeId: string,
		req: RustVerifyPaymentRequest,
		walletAddress?: string,
	): Promise<RustVerifyPaymentResponse> {
		return this.request<RustVerifyPaymentResponse>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}/verify-payment`,
			{
				method: "POST",
				walletAddress,
				body: req,
			},
		);
	}

	public async processPayout(
		tradeId: string,
		req: RustPayoutRequest,
		walletAddress?: string,
	): Promise<RustPayoutResponse> {
		return this.request<RustPayoutResponse>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}/payout`,
			{
				method: "POST",
				walletAddress,
				idempotencyKey: req.idempotency_key,
				body: req,
			},
		);
	}

	public async processRefund(
		tradeId: string,
		req: RustRefundRequest,
		walletAddress?: string,
	): Promise<RustRefundResponse> {
		return this.request<RustRefundResponse>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}/refund`,
			{
				method: "POST",
				walletAddress,
				idempotencyKey: req.idempotency_key,
				body: req,
			},
		);
	}

	public async processEscrowRelease(
		tradeId: string,
		req: RustEscrowReleaseRequest,
		walletAddress?: string,
	): Promise<RustEscrowReleaseResponse> {
		return this.request<RustEscrowReleaseResponse>(
			`/api/v1/trades/${encodeURIComponent(tradeId)}/escrow`,
			{
				method: "POST",
				walletAddress,
				idempotencyKey: req.idempotency_key,
				body: req,
			},
		);
	}
}

// Export default singleton instance
export const rustApiClient = new RustApiClient();
