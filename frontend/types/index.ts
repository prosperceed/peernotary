export type ViewMode = "dev" | "trader";
export type View = "home" | "trade" | "dev" | "dashboard";
export type TradeStep = 0 | 1 | 2 | 3;
export type VerifyMode = "bank" | "zk" | null;
export type TxStatus = "completed" | "escrow" | "disputed" | "pending";
export type TxCategory =
	| "buy"
	| "sell"
	| "collateral"
	| "release"
	| "dispute";
export type BadgeColor =
	| "violet"
	| "green"
	| "amber"
	| "red"
	| "blue"
	| "slate"
	| "cyan";

export type TradeLifecycleState =
	| "OPEN"
	| "AWAITING_PAYMENT"
	| "PAYMENT_CONFIRMED"
	| "SELLER_PAYOUT_PENDING"
	| "SELLER_PAYOUT_CONFIRMED"
	| "RELEASE_PENDING"
	| "COMPLETED"
	| "PAYOUT_ON_HOLD"
	| "REFUND_PENDING"
	| "RELEASE_ON_HOLD"
	| "LATE_PAYMENT_REVIEW"
	| "CANCELLED"
	| "DISPUTED";

export type PaymentState =
	| "UNPAID"
	| "CHECKOUT_CREATED"
	| "PENDING_VERIFICATION"
	| "CONFIRMED"
	| "LATE_CONFIRMED"
	| "UNDERPAID"
	| "OVERPAID"
	| "FAILED"
	| "EXPIRED";

export type PayoutState =
	| "NOT_STARTED"
	| "PENDING"
	| "PROCESSING"
	| "CONFIRMED"
	| "ON_HOLD"
	| "FAILED";

export type RefundState =
	| "NONE"
	| "REQUESTED"
	| "APPROVED"
	| "PROCESSING"
	| "COMPLETED"
	| "FAILED"
	| "REJECTED";

export type EscrowOperationState =
	| "CREATED"
	| "FUNDED"
	| "FIAT_SENT"
	| "RELEASE_PENDING"
	| "RELEASED"
	| "ON_HOLD"
	| "CANCELLED"
	| "DISPUTED";

export interface TradeAuditEventItem {
	id: string;
	tradeId: string;
	actorAddress?: string;
	actorRole: "buyer" | "seller" | "system" | "oracle" | "webhook" | "verify_api" | "admin";
	eventType: string;
	previousState?: string;
	newState: string;
	correlationId?: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
}

export interface Transaction {
	id: string;
	buyer: string;
	ngnAmount: string;
	usdc: string;
	status: TxStatus;
	time: string;
}

export interface UserTransaction {
	id: string;
	tradeId: string;
	type: TxCategory;
	role: "buyer" | "seller";
	counterparty: string;
	counterpartyAddress: string;
	usdcAmount: string;
	ngnAmount: string;
	bankName: string;
	sellerAccountNumber?: string;
	verificationMethod:
		| "Flutterwave Checkout"
		| "TLSNotary ZK"
		| "Open Banking"
		| "On-Chain Escrow";
	status: TxStatus;
	lifecycleState?: TradeLifecycleState;
	paymentState?: PaymentState;
	payoutState?: PayoutState;
	refundState?: RefundState;
	escrowState?: EscrowOperationState;
	paymentDeadlineAt?: string;
	txRef?: string;
	flwTxId?: number;
	payoutReference?: string;
	refundReference?: string;
	holdReason?: string;
	failureReason?: string;
	txHash: string;
	proofId?: string;
	timestamp: string;
}

export interface PeerTradeOffer {
	tradeId: string;
	peerHandle: string;
	peerAddress: string;
	side: "buy" | "sell";
	totalDepositedUsdc?: string;
	availableUsdc: string;
	availableUsdcUnits?: number;
	allocatedUsdc?: string;
	reservedQueuedUsdc?: string;
	filledUsdc?: string;
	ngnAmount: string;
	rateNgn: number;
	minLimitUsdc: string;
	maxLimitUsdc: string;
	requiredCollateralUsdc: string;
	bankName: string;
	completionRate: string;
	completedTrades: number;
	avgReleaseTime: string;
	createdAt: string;
	sellerBusy?: boolean;
	activeSlotTradeId?: string;
	queueDepth?: number;
	estimatedWaitSeconds?: number;
}

export type QueueEntryStatus =
	| "QUEUED"
	| "ELIGIBLE_AWAITING_CONSENT"
	| "ACTIVE_SLOT"
	| "COMPLETED"
	| "CANCELLED_BY_BUYER"
	| "EXPIRED";

export interface QueueEntryItem {
	queueRef: string;
	listingTradeId: string;
	sellerHandle: string;
	sellerAddress: string;
	buyerAddress: string;
	requestedUsdc: string;
	requestedUsdcUnits: number;
	ngnAmount: string;
	rateNgn: number;
	bankName: string;
	queuePosition: number;
	status: QueueEntryStatus;
	allocatedTradeId?: string;
	consentDeadlineAt?: string;
	estimatedWaitSeconds: number;
	createdAt: string;
}

export type TrustTier =
	| "RESTRICTED"
	| "NEW"
	| "STANDARD"
	| "ESTABLISHED"
	| "HIGH_LIMIT";

export interface UserTrustSummary {
	walletAddress: string;
	trustTier: TrustTier;
	trustScore: number;
	maxTradeUsdc: string;
	maxTradeUsdcUnits: number;
	maxConcurrentUnpaidTrades: number;
	activeUnpaidCount: number;
	completedTradeCount: number;
	completedVolumeUsdc: string;
	unexplainedExpiryCount: number;
	consecutiveExpiryStreak: number;
	cooldownUntil?: string;
	cooldownRemainingSeconds: number;
	cooldownReason?: string;
	strongerVerificationStatus: "NONE" | "PENDING" | "VERIFIED";
	activeGuarantorBackedUsdc?: string;
	activeGuarantorAddress?: string;
}

export interface ChatMessage {
	from: "buyer" | "seller" | "system";
	text: string;
	time: string;
	danger?: boolean;
}

export interface EscrowState {
	sellerLocked: string;
	buyerCollateral: string;
	arcStatus: "Secured" | "Pending" | "Released";
	verificationMethod: string;
}
