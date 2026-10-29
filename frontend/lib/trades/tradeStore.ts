import { randomUUID } from "node:crypto";
import { getUsernameForAddress } from "@/lib/auth/wallet";
import { supabaseServerUpsert } from "@/lib/supabase/server";
import { RATE } from "@/lib/utils";
import type {
	EscrowOperationState,
	PaymentState,
	PayoutState,
	PeerTradeOffer,
	RefundState,
	TradeAuditEventItem,
	TradeLifecycleState,
	TxStatus,
	UserTransaction,
} from "@/types";

export interface PaymentAttemptInfo {
	id: string;
	tradeId: string;
	buyerAddress: string;
	txRef: string;
	flwTxId?: number;
	expectedAmountMinor: number;
	expectedCurrency: string;
	settledAmountMinor?: number;
	checkoutUrl: string;
	status:
		| "INITIATED"
		| "REDIRECT_READY"
		| "PENDING_VERIFICATION"
		| "VERIFIED"
		| "LATE_VERIFIED"
		| "MISMATCH_HOLD"
		| "FAILED"
		| "EXPIRED";
	failureReason?: string;
	expiresAt: string;
	verifiedAt?: string;
	createdAt: string;
}

export interface SharedTrade {
	id: string;
	tradeId: string;
	sellerAddress: string;
	buyerAddress?: string;
	side: "sell" | "buy";
	usdcAmount: string;
	usdcAmountUnits: number;
	ngnAmount: string;
	fiatAmountMinor: number;
	fiatCurrency: string;
	rateNgn: number;
	bankName: string;
	bankCode: string;
	accountMasked: string;
	requiredCollateralUsdc: string;
	status: "open" | "escrow" | "completed" | "disputed";
	lifecycleState: TradeLifecycleState;
	paymentState: PaymentState;
	payoutState: PayoutState;
	refundState: RefundState;
	escrowState: EscrowOperationState;
	termsLocked: boolean;
	paymentDeadlineAt?: string;
	activeTxRef?: string;
	flwTxId?: number;
	payoutReference?: string;
	refundReference?: string;
	failureReason?: string;
	proofId?: string;
	txHash?: string;
	version: number;
	createdAt: string;
}

const PAYMENT_TIMEOUT_MINUTES = Number(
	process.env.TRADE_PAYMENT_TIMEOUT_MINUTES ?? "20",
);

const initialPeerOffers: PeerTradeOffer[] = [
	{
		tradeId: "104",
		peerHandle: "OluwaseunAd_Arc",
		peerAddress: "0x8C4b1A7E290d5f1c3E4802a9B7F510293847561a",
		side: "sell",
		availableUsdc: "1,250.00",
		ngnAmount: "₦2,037,500",
		rateNgn: 1630,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "1,250.00",
		requiredCollateralUsdc: "50.00",
		bankName: "GTBank",
		completionRate: "99.4%",
		completedTrades: 482,
		avgReleaseTime: "4.2s",
		createdAt: "4m ago",
	},
	{
		tradeId: "103",
		peerHandle: "kemi_liquidity",
		peerAddress: "0x4F902c18a3D74E9b621a0987C43120bA9823dE11",
		side: "sell",
		availableUsdc: "480.00",
		ngnAmount: "₦781,440",
		rateNgn: 1628,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "480.00",
		requiredCollateralUsdc: "50.00",
		bankName: "OPay",
		completionRate: "99.8%",
		completedTrades: 914,
		avgReleaseTime: "3.6s",
		createdAt: "11m ago",
	},
	{
		tradeId: "102",
		peerHandle: "tunde_fx",
		peerAddress: "0x2E71B4A8d90C1123456789aBcDeF0123456789C2",
		side: "sell",
		availableUsdc: "3,000.00",
		ngnAmount: "₦4,896,000",
		rateNgn: 1632,
		minLimitUsdc: "200.00",
		maxLimitUsdc: "3,000.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Access Bank",
		completionRate: "98.9%",
		completedTrades: 319,
		avgReleaseTime: "5.1s",
		createdAt: "19m ago",
	},
	{
		tradeId: "101",
		peerHandle: "amina_desk",
		peerAddress: "0x9A12c34D56e78F90123456789aBCdEf01234567D",
		side: "buy",
		availableUsdc: "850.00",
		ngnAmount: "₦1,382,100",
		rateNgn: 1626,
		minLimitUsdc: "100.00",
		maxLimitUsdc: "850.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Zenith Bank",
		completionRate: "99.2%",
		completedTrades: 267,
		avgReleaseTime: "4.7s",
		createdAt: "27m ago",
	},
	{
		tradeId: "100",
		peerHandle: "chinedu_arc",
		peerAddress: "0x6D44e55F66a77B88c99D00e11F22a33B44c55D66",
		side: "sell",
		availableUsdc: "620.00",
		ngnAmount: "₦1,010,600",
		rateNgn: 1630,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "620.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Moniepoint",
		completionRate: "99.6%",
		completedTrades: 605,
		avgReleaseTime: "3.9s",
		createdAt: "34m ago",
	},
];

const userLedgerStore = new Map<string, UserTransaction[]>();
const sharedTradesMap = new Map<string, SharedTrade>();
const paymentAttemptsByRef = new Map<string, PaymentAttemptInfo>();
const consumedFlwTxIds = new Map<number, string>();
const webhookDeduplicationSet = new Set<string>();
const tradeAuditStore = new Map<string, TradeAuditEventItem[]>();
const activePeerOffers: PeerTradeOffer[] = [...initialPeerOffers];

function bankToCode(bankName: string): string {
	const lower = bankName.toLowerCase();
	if (lower.includes("gtb")) return "058";
	if (lower.includes("access")) return "044";
	if (lower.includes("zenith")) return "057";
	if (lower.includes("opay")) return "999992";
	if (lower.includes("moniepoint")) return "50515";
	if (lower.includes("kuda")) return "50211";
	return "058";
}

function parseAmountUsdc(str: string): number {
	return parseFloat(str.replace(/,/g, "")) || 0;
}

for (const off of initialPeerOffers) {
	const numericUsdc = parseAmountUsdc(off.availableUsdc);
	const usdcUnits = Math.round(numericUsdc * 1_000_000);
	const fiatMinor = Math.round(numericUsdc * off.rateNgn * 100);
	sharedTradesMap.set(off.tradeId, {
		id: randomUUID(),
		tradeId: off.tradeId,
		sellerAddress: off.peerAddress.toLowerCase(),
		side: off.side,
		usdcAmount: off.availableUsdc,
		usdcAmountUnits: usdcUnits,
		ngnAmount: off.ngnAmount,
		fiatAmountMinor: fiatMinor,
		fiatCurrency: "NGN",
		rateNgn: off.rateNgn,
		bankName: off.bankName,
		bankCode: bankToCode(off.bankName),
		accountMasked: "******6789",
		requiredCollateralUsdc: off.requiredCollateralUsdc,
		status: "open",
		lifecycleState: "OPEN",
		paymentState: "UNPAID",
		payoutState: "NOT_STARTED",
		refundState: "NONE",
		escrowState: "CREATED",
		termsLocked: false,
		version: 1,
		createdAt: off.createdAt,
	});
}

function shortAddressOrUsername(addr: string): string {
	const username = getUsernameForAddress(addr);
	if (username) return `@${username}`;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const LEGAL_TRANSITIONS: Record<TradeLifecycleState, TradeLifecycleState[]> = {
	OPEN: ["AWAITING_PAYMENT", "CANCELLED"],
	AWAITING_PAYMENT: [
		"PAYMENT_CONFIRMED",
		"LATE_PAYMENT_REVIEW",
		"REFUND_PENDING",
		"CANCELLED",
		"DISPUTED",
	],
	PAYMENT_CONFIRMED: [
		"SELLER_PAYOUT_PENDING",
		"PAYOUT_ON_HOLD",
		"REFUND_PENDING",
		"DISPUTED",
	],
	SELLER_PAYOUT_PENDING: [
		"SELLER_PAYOUT_CONFIRMED",
		"PAYOUT_ON_HOLD",
		"DISPUTED",
	],
	PAYOUT_ON_HOLD: [
		"SELLER_PAYOUT_PENDING",
		"SELLER_PAYOUT_CONFIRMED",
		"REFUND_PENDING",
		"DISPUTED",
	],
	SELLER_PAYOUT_CONFIRMED: [
		"RELEASE_PENDING",
		"RELEASE_ON_HOLD",
		"DISPUTED",
	],
	RELEASE_PENDING: ["COMPLETED", "RELEASE_ON_HOLD", "DISPUTED"],
	RELEASE_ON_HOLD: ["RELEASE_PENDING", "COMPLETED", "DISPUTED"],
	LATE_PAYMENT_REVIEW: ["PAYMENT_CONFIRMED", "REFUND_PENDING", "DISPUTED"],
	REFUND_PENDING: ["CANCELLED", "DISPUTED"],
	COMPLETED: [],
	CANCELLED: [],
	DISPUTED: ["COMPLETED", "CANCELLED"],
};

export function canTransitionLifecycle(
	current: TradeLifecycleState,
	next: TradeLifecycleState,
): boolean {
	if (current === next) return true;
	return LEGAL_TRANSITIONS[current]?.includes(next) ?? false;
}

function mapLifecycleToUiStatus(lifecycle: TradeLifecycleState): TxStatus {
	switch (lifecycle) {
		case "COMPLETED":
			return "completed";
		case "PAYOUT_ON_HOLD":
		case "RELEASE_ON_HOLD":
		case "LATE_PAYMENT_REVIEW":
		case "REFUND_PENDING":
		case "DISPUTED":
			return "disputed";
		case "OPEN":
		case "CANCELLED":
			return "pending";
		default:
			return "escrow";
	}
}

function appendAudit(
	trade: SharedTrade,
	actorRole: TradeAuditEventItem["actorRole"],
	eventType: string,
	previousState: string | undefined,
	newState: string,
	actorAddress?: string,
	metadata?: Record<string, unknown>,
) {
	const item: TradeAuditEventItem = {
		id: randomUUID(),
		tradeId: trade.tradeId,
		actorAddress,
		actorRole,
		eventType,
		previousState,
		newState,
		metadata,
		createdAt: new Date().toISOString(),
	};
	const list = tradeAuditStore.get(trade.tradeId) ?? [];
	list.unshift(item);
	tradeAuditStore.set(trade.tradeId, list);

	void supabaseServerUpsert("trade_audit_events", {
		id: item.id,
		trade_uuid: trade.id,
		trade_id: trade.tradeId,
		actor_address: actorAddress?.toLowerCase() ?? null,
		actor_role: actorRole,
		event_type: eventType,
		previous_state: previousState ?? null,
		new_state: newState,
		metadata: metadata ?? {},
		created_at: item.createdAt,
	});
}

function syncBothUserLedgers(trade: SharedTrade) {
	const uiStatus = mapLifecycleToUiStatus(trade.lifecycleState);
	const allLedgers = Array.from(userLedgerStore.values());

	for (const ledger of allLedgers) {
		for (const tx of ledger) {
			if (tx.tradeId === trade.tradeId) {
				tx.status = uiStatus;
				tx.lifecycleState = trade.lifecycleState;
				tx.paymentState = trade.paymentState;
				tx.payoutState = trade.payoutState;
				tx.refundState = trade.refundState;
				tx.escrowState = trade.escrowState;
				tx.paymentDeadlineAt = trade.paymentDeadlineAt;
				tx.txRef = trade.activeTxRef;
				tx.flwTxId = trade.flwTxId;
				tx.payoutReference = trade.payoutReference;
				tx.refundReference = trade.refundReference;
				tx.failureReason = trade.failureReason;
				if (trade.proofId) tx.proofId = trade.proofId;
				if (trade.txHash) tx.txHash = trade.txHash;
				tx.timestamp =
					trade.lifecycleState === "COMPLETED"
						? "Settled"
						: trade.lifecycleState.replace(/_/g, " ");
			}
		}
	}
}

export function getActivePeerOffers(): PeerTradeOffer[] {
	return activePeerOffers;
}

export function getSharedTrade(tradeId: string): SharedTrade | undefined {
	return sharedTradesMap.get(tradeId);
}

export function getTradeAuditEvents(tradeId: string): TradeAuditEventItem[] {
	return tradeAuditStore.get(tradeId) ?? [];
}

export function getPaymentAttemptByRef(
	txRef: string,
): PaymentAttemptInfo | undefined {
	return paymentAttemptsByRef.get(txRef);
}

export function getUserLedger(address: string): UserTransaction[] {
	const key = address.toLowerCase();
	const existing = userLedgerStore.get(key);
	if (existing) return existing;
	const fresh: UserTransaction[] = [];
	userLedgerStore.set(key, fresh);
	return fresh;
}

export function createPeerOffer(
	sellerAddress: string,
	params: {
		usdcAmount: number;
		bankName: string;
		accountNumber?: string;
		side?: "sell" | "buy";
		txHash?: string;
	},
): { offer: PeerTradeOffer; transaction: UserTransaction } {
	const sAddr = sellerAddress.toLowerCase();
	const newTradeId = String(105 + sharedTradesMap.size);
	const formattedUsdc = params.usdcAmount.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const formattedNgn = `₦${Math.round(params.usdcAmount * RATE).toLocaleString("en-NG")}`;
	const usdcUnits = Math.round(params.usdcAmount * 1_000_000);
	const fiatMinor = Math.round(params.usdcAmount * RATE * 100);
	const rawAcct = params.accountNumber?.replace(/\D/g, "") || "0123456789";
	const accountMasked =
		rawAcct.length >= 4 ? `******${rawAcct.slice(-4)}` : "******6789";

	const sellerLedger = getUserLedger(sAddr);

	const offer: PeerTradeOffer = {
		tradeId: newTradeId,
		peerHandle: shortAddressOrUsername(sellerAddress),
		peerAddress: sellerAddress,
		side: params.side ?? "sell",
		availableUsdc: formattedUsdc,
		ngnAmount: formattedNgn,
		rateNgn: RATE,
		minLimitUsdc: "50.00",
		maxLimitUsdc: formattedUsdc,
		requiredCollateralUsdc: "50.00",
		bankName: params.bankName,
		completionRate: "100%",
		completedTrades: sellerLedger.filter((t) => t.status === "completed").length,
		avgReleaseTime: "4.1s",
		createdAt: "Just now",
	};

	activePeerOffers.unshift(offer);

	const shared: SharedTrade = {
		id: randomUUID(),
		tradeId: newTradeId,
		sellerAddress: sAddr,
		side: params.side ?? "sell",
		usdcAmount: formattedUsdc,
		usdcAmountUnits: usdcUnits,
		ngnAmount: formattedNgn,
		fiatAmountMinor: fiatMinor,
		fiatCurrency: "NGN",
		rateNgn: RATE,
		bankName: params.bankName,
		bankCode: bankToCode(params.bankName),
		accountMasked,
		requiredCollateralUsdc: "50.00",
		status: "open",
		lifecycleState: "OPEN",
		paymentState: "UNPAID",
		payoutState: "NOT_STARTED",
		refundState: "NONE",
		escrowState: "CREATED",
		termsLocked: false,
		txHash: params.txHash,
		version: 1,
		createdAt: "Just now",
	};

	sharedTradesMap.set(newTradeId, shared);

	appendAudit(
		shared,
		"seller",
		"OFFER_PUBLISHED",
		undefined,
		"OPEN",
		sellerAddress,
		{ usdcAmount: formattedUsdc, bankName: params.bankName },
	);

	const sellerTx: UserTransaction = {
		id: `TX-${newTradeId}-S`,
		tradeId: newTradeId,
		type: params.side === "buy" ? "buy" : "sell",
		role: params.side === "buy" ? "buyer" : "seller",
		counterparty: "Open Peer Market",
		counterpartyAddress: "0x5042f1114C6F272f5909f16510399986EF0D734D",
		usdcAmount: formattedUsdc,
		ngnAmount: formattedNgn,
		bankName: params.bankName,
		verificationMethod: "On-Chain Escrow",
		status: "pending",
		lifecycleState: "OPEN",
		paymentState: "UNPAID",
		payoutState: "NOT_STARTED",
		refundState: "NONE",
		escrowState: "CREATED",
		txHash: params.txHash ?? "0x0",
		timestamp: "OPEN",
	};
	sellerLedger.unshift(sellerTx);

	return { offer, transaction: sellerTx };
}

export function takePeerOffer(
	buyerAddress: string,
	tradeId: string,
	txHash?: string,
): {
	tradeTx: UserTransaction;
	collateralTx: UserTransaction;
	sharedTrade: SharedTrade;
} {
	const bAddr = buyerAddress.toLowerCase();
	const shared = sharedTradesMap.get(tradeId);
	if (!shared) {
		throw new Error("OFFER_NOT_FOUND");
	}
	if (shared.sellerAddress.toLowerCase() === bAddr) {
		throw new Error("CANNOT_BUY_OWN_OFFER");
	}
	if (!canTransitionLifecycle(shared.lifecycleState, "AWAITING_PAYMENT")) {
		throw new Error(`ILLEGAL_STATE_TRANSITION_FROM_${shared.lifecycleState}`);
	}

	const prevState = shared.lifecycleState;
	const deadline = new Date(
		Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1_000,
	).toISOString();

	shared.buyerAddress = bAddr;
	shared.status = "escrow";
	shared.lifecycleState = "AWAITING_PAYMENT";
	shared.paymentState = "UNPAID";
	shared.payoutState = "NOT_STARTED";
	shared.refundState = "NONE";
	shared.escrowState = "FUNDED";
	shared.termsLocked = true;
	shared.paymentDeadlineAt = deadline;
	shared.version += 1;
	if (txHash) shared.txHash = txHash;

	// Remove taken offer from open publishing list so another buyer cannot double-take
	const offerIdx = activePeerOffers.findIndex((o) => o.tradeId === tradeId);
	if (offerIdx !== -1) {
		activePeerOffers.splice(offerIdx, 1);
	}

	appendAudit(
		shared,
		"buyer",
		"COLLATERAL_LOCKED_AWAITING_PAYMENT",
		prevState,
		"AWAITING_PAYMENT",
		buyerAddress,
		{ paymentDeadlineAt: deadline, txHash },
	);

	const sAddr = shared.sellerAddress;
	const sellerLedger = getUserLedger(sAddr);
	const existingSellerTx = sellerLedger.find(
		(t) => t.tradeId === tradeId && t.role === "seller",
	);
	if (existingSellerTx) {
		existingSellerTx.status = "escrow";
		existingSellerTx.lifecycleState = "AWAITING_PAYMENT";
		existingSellerTx.paymentState = "UNPAID";
		existingSellerTx.payoutState = "NOT_STARTED";
		existingSellerTx.escrowState = "FUNDED";
		existingSellerTx.paymentDeadlineAt = deadline;
		existingSellerTx.counterparty = shortAddressOrUsername(buyerAddress);
		existingSellerTx.counterpartyAddress = buyerAddress;
		existingSellerTx.timestamp = "AWAITING PAYMENT";
	} else {
		sellerLedger.unshift({
			id: `TX-${tradeId}-S`,
			tradeId,
			type: "sell",
			role: "seller",
			counterparty: shortAddressOrUsername(buyerAddress),
			counterpartyAddress: buyerAddress,
			usdcAmount: shared.usdcAmount,
			ngnAmount: shared.ngnAmount,
			bankName: shared.bankName,
			verificationMethod: "Flutterwave Checkout",
			status: "escrow",
			lifecycleState: "AWAITING_PAYMENT",
			paymentState: "UNPAID",
			payoutState: "NOT_STARTED",
			refundState: "NONE",
			escrowState: "FUNDED",
			paymentDeadlineAt: deadline,
			txHash: txHash ?? "0x0",
			timestamp: "AWAITING PAYMENT",
		});
	}

	const buyerLedger = getUserLedger(bAddr);
	const collateralTx: UserTransaction = {
		id: `TX-${tradeId}-COL`,
		tradeId,
		type: "collateral",
		role: "buyer",
		counterparty: shortAddressOrUsername(shared.sellerAddress),
		counterpartyAddress: shared.sellerAddress,
		usdcAmount: shared.requiredCollateralUsdc,
		ngnAmount: `₦${Math.round(parseFloat(shared.requiredCollateralUsdc) * shared.rateNgn).toLocaleString("en-NG")}`,
		bankName: shared.bankName,
		verificationMethod: "On-Chain Escrow",
		status: "escrow",
		lifecycleState: "AWAITING_PAYMENT",
		escrowState: "FUNDED",
		paymentDeadlineAt: deadline,
		txHash: txHash ?? "0x0",
		timestamp: "AWAITING PAYMENT",
	};

	const tradeTx: UserTransaction = {
		id: `TX-${tradeId}-B`,
		tradeId,
		type: shared.side === "sell" ? "buy" : "sell",
		role: shared.side === "sell" ? "buyer" : "seller",
		counterparty: shortAddressOrUsername(shared.sellerAddress),
		counterpartyAddress: shared.sellerAddress,
		usdcAmount: shared.usdcAmount,
		ngnAmount: shared.ngnAmount,
		bankName: shared.bankName,
		verificationMethod: "Flutterwave Checkout",
		status: "escrow",
		lifecycleState: "AWAITING_PAYMENT",
		paymentState: "UNPAID",
		payoutState: "NOT_STARTED",
		refundState: "NONE",
		escrowState: "FUNDED",
		paymentDeadlineAt: deadline,
		txHash: txHash ?? "0x0",
		timestamp: "AWAITING PAYMENT",
	};

	buyerLedger.unshift(tradeTx, collateralTx);

	return { tradeTx, collateralTx, sharedTrade: shared };
}

export function createOrReuseCheckoutAttempt(
	tradeId: string,
	buyerAddress: string,
	customCheckoutUrl?: string,
	customTxRef?: string,
): PaymentAttemptInfo {
	const bAddr = buyerAddress.toLowerCase();
	let shared = sharedTradesMap.get(tradeId);

	if (!shared) {
		// Auto-register trade if created via widget
		const deadline = new Date(
			Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1_000,
		).toISOString();
		shared = {
			id: randomUUID(),
			tradeId,
			sellerAddress: "0x8c4b1a7e290d5f1c3e4802a9b7f510293847561a",
			buyerAddress: bAddr,
			side: "sell",
			usdcAmount: "306.75",
			usdcAmountUnits: 306_750_000,
			ngnAmount: "₦500,000",
			fiatAmountMinor: 50_000_000,
			fiatCurrency: "NGN",
			rateNgn: RATE,
			bankName: "GTBank",
			bankCode: "058",
			accountMasked: "******6789",
			requiredCollateralUsdc: "50.00",
			status: "escrow",
			lifecycleState: "AWAITING_PAYMENT",
			paymentState: "UNPAID",
			payoutState: "NOT_STARTED",
			refundState: "NONE",
			escrowState: "FUNDED",
			termsLocked: true,
			paymentDeadlineAt: deadline,
			version: 1,
			createdAt: "Just now",
		};
		sharedTradesMap.set(tradeId, shared);
	}

	if (shared.sellerAddress.toLowerCase() === bAddr) {
		throw new Error("SELLER_CANNOT_PAY_OWN_TRADE");
	}
	if (shared.buyerAddress && shared.buyerAddress.toLowerCase() !== bAddr) {
		throw new Error("CALLER_NOT_TRADE_BUYER");
	}
	shared.buyerAddress = bAddr;

	if (shared.lifecycleState === "OPEN") {
		takePeerOffer(buyerAddress, tradeId);
	}
	if (shared.lifecycleState !== "AWAITING_PAYMENT") {
		throw new Error(`TRADE_NOT_AWAITING_PAYMENT:${shared.lifecycleState}`);
	}

	const now = new Date();
	const deadlineDate = shared.paymentDeadlineAt
		? new Date(shared.paymentDeadlineAt)
		: new Date(now.getTime() + PAYMENT_TIMEOUT_MINUTES * 60 * 1_000);

	if (now >= deadlineDate) {
		throw new Error("TRADE_PAYMENT_DEADLINE_EXPIRED");
	}

	shared.paymentDeadlineAt = deadlineDate.toISOString();
	shared.termsLocked = true;

	// Return existing active attempt if unexpired
	if (shared.activeTxRef) {
		const existing = paymentAttemptsByRef.get(shared.activeTxRef);
		if (
			existing &&
			new Date(existing.expiresAt) > now &&
			(existing.status === "INITIATED" ||
				existing.status === "REDIRECT_READY" ||
				existing.status === "PENDING_VERIFICATION")
		) {
			return existing;
		}
	}

	const txRef =
		customTxRef ||
		`PN-FLW-${tradeId}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
	const majorNgn = (shared.fiatAmountMinor / 100).toFixed(2);
	const checkoutUrl =
		customCheckoutUrl ||
		`/bank-checkout?tradeId=${encodeURIComponent(tradeId)}&tx_ref=${encodeURIComponent(txRef)}&amountNgn=${encodeURIComponent(majorNgn)}&bank=${encodeURIComponent(shared.bankName)}&flw_checkout=1`;

	const attempt: PaymentAttemptInfo = {
		id: randomUUID(),
		tradeId,
		buyerAddress: bAddr,
		txRef,
		expectedAmountMinor: shared.fiatAmountMinor,
		expectedCurrency: shared.fiatCurrency,
		checkoutUrl,
		status: "REDIRECT_READY",
		expiresAt: deadlineDate.toISOString(),
		createdAt: now.toISOString(),
	};

	paymentAttemptsByRef.set(txRef, attempt);
	shared.activeTxRef = txRef;
	shared.paymentState = "CHECKOUT_CREATED";
	shared.version += 1;
	syncBothUserLedgers(shared);

	appendAudit(
		shared,
		"buyer",
		"FLW_CHECKOUT_SESSION_CREATED",
		shared.lifecycleState,
		shared.lifecycleState,
		buyerAddress,
		{
			txRef,
			expectedAmountMinor: shared.fiatAmountMinor,
			currency: shared.fiatCurrency,
			expiresAt: attempt.expiresAt,
		},
	);

	return attempt;
}

export function recordVerifiedFlutterwavePayment(params: {
	tradeId: string;
	txRef: string;
	flwTxId: number;
	amountMinor: number;
	currency: string;
	source: "webhook" | "verify_api";
	eventId?: string;
}): {
	trade: SharedTrade;
	attempt: PaymentAttemptInfo;
	deduplicated: boolean;
} {
	if (params.eventId) {
		if (webhookDeduplicationSet.has(params.eventId)) {
			const existingTrade = sharedTradesMap.get(params.tradeId);
			const existingAttempt = paymentAttemptsByRef.get(params.txRef);
			if (existingTrade && existingAttempt) {
				return {
					trade: existingTrade,
					attempt: existingAttempt,
					deduplicated: true,
				};
			}
		}
		webhookDeduplicationSet.add(params.eventId);
	}

	const attempt = paymentAttemptsByRef.get(params.txRef);
	if (!attempt) {
		throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
	}
	if (attempt.tradeId !== params.tradeId) {
		throw new Error("CROSS_TRADE_TX_REF_MISMATCH");
	}

	const existingTradeForFlwId = consumedFlwTxIds.get(params.flwTxId);
	if (existingTradeForFlwId && existingTradeForFlwId !== params.tradeId) {
		throw new Error("FLW_TRANSACTION_ID_REPLAY_DETECTED");
	}

	const trade = sharedTradesMap.get(params.tradeId);
	if (!trade) {
		throw new Error("TRADE_NOT_FOUND");
	}

	// Idempotent return if already confirmed with this flwTxId
	if (
		attempt.status === "VERIFIED" &&
		trade.paymentState === "CONFIRMED" &&
		attempt.flwTxId === params.flwTxId
	) {
		return { trade, attempt, deduplicated: true };
	}

	if (params.currency.toUpperCase() !== attempt.expectedCurrency.toUpperCase()) {
		attempt.status = "MISMATCH_HOLD";
		attempt.failureReason = `Currency mismatch: expected ${attempt.expectedCurrency}, got ${params.currency}`;
		trade.paymentState = "FAILED";
		trade.failureReason = attempt.failureReason;
		syncBothUserLedgers(trade);
		throw new Error("FLW_CURRENCY_MISMATCH");
	}

	consumedFlwTxIds.set(params.flwTxId, params.tradeId);
	attempt.flwTxId = params.flwTxId;
	attempt.settledAmountMinor = params.amountMinor;
	trade.flwTxId = params.flwTxId;

	if (params.amountMinor < attempt.expectedAmountMinor) {
		attempt.status = "MISMATCH_HOLD";
		attempt.failureReason = `Underpayment: received ${params.amountMinor} minor units, expected ${attempt.expectedAmountMinor}`;
		trade.paymentState = "UNDERPAID";
		trade.failureReason = attempt.failureReason;
		appendAudit(
			trade,
			params.source,
			"PAYMENT_UNDERPAID_HOLD",
			trade.lifecycleState,
			trade.lifecycleState,
			attempt.buyerAddress,
			{
				flwTxId: params.flwTxId,
				expectedMinor: attempt.expectedAmountMinor,
				receivedMinor: params.amountMinor,
			},
		);
		syncBothUserLedgers(trade);
		return { trade, attempt, deduplicated: false };
	}

	if (params.amountMinor > attempt.expectedAmountMinor) {
		attempt.status = "MISMATCH_HOLD";
		attempt.failureReason = `Overpayment: received ${params.amountMinor} minor units, expected ${attempt.expectedAmountMinor}`;
		trade.paymentState = "OVERPAID";
		trade.failureReason = attempt.failureReason;
		appendAudit(
			trade,
			params.source,
			"PAYMENT_OVERPAID_HOLD",
			trade.lifecycleState,
			trade.lifecycleState,
			attempt.buyerAddress,
			{
				flwTxId: params.flwTxId,
				expectedMinor: attempt.expectedAmountMinor,
				receivedMinor: params.amountMinor,
			},
		);
		syncBothUserLedgers(trade);
		return { trade, attempt, deduplicated: false };
	}

	const now = new Date();
	const isLate =
		(trade.paymentDeadlineAt && now > new Date(trade.paymentDeadlineAt)) ||
		now > new Date(attempt.expiresAt);

	if (isLate) {
		const prev = trade.lifecycleState;
		attempt.status = "LATE_VERIFIED";
		attempt.verifiedAt = now.toISOString();
		trade.paymentState = "LATE_CONFIRMED";
		trade.lifecycleState = "LATE_PAYMENT_REVIEW";
		trade.failureReason =
			"Payment settled after the 20-minute deadline; held for review or refund.";
		trade.version += 1;

		appendAudit(
			trade,
			params.source,
			"LATE_PAYMENT_DETECTED_REVIEW",
			prev,
			"LATE_PAYMENT_REVIEW",
			attempt.buyerAddress,
			{ flwTxId: params.flwTxId, txRef: params.txRef },
		);
		syncBothUserLedgers(trade);
		return { trade, attempt, deduplicated: false };
	}

	const prev = trade.lifecycleState;
	attempt.status = "VERIFIED";
	attempt.verifiedAt = now.toISOString();
	trade.paymentState = "CONFIRMED";
	trade.lifecycleState = "PAYMENT_CONFIRMED";
	trade.escrowState = "FIAT_SENT";
	trade.failureReason = undefined;
	trade.version += 1;

	appendAudit(
		trade,
		params.source,
		"FLW_PAYMENT_CONFIRMED",
		prev,
		"PAYMENT_CONFIRMED",
		attempt.buyerAddress,
		{
			flwTxId: params.flwTxId,
			txRef: params.txRef,
			amountMinor: params.amountMinor,
		},
	);

	syncBothUserLedgers(trade);
	return { trade, attempt, deduplicated: false };
}

export function transitionSellerPayoutState(
	tradeId: string,
	action: "initiate" | "confirm" | "hold",
	options?: { flwTransferId?: number; failureReason?: string },
): SharedTrade {
	const trade = sharedTradesMap.get(tradeId);
	if (!trade) throw new Error("TRADE_NOT_FOUND");

	if (trade.paymentState !== "CONFIRMED") {
		throw new Error("CANNOT_PAYOUT_WITHOUT_CONFIRMED_BUYER_PAYMENT");
	}

	const prev = trade.lifecycleState;
	if (action === "initiate") {
		if (!canTransitionLifecycle(trade.lifecycleState, "SELLER_PAYOUT_PENDING")) {
			throw new Error(`ILLEGAL_TRANSITION_FROM_${trade.lifecycleState}`);
		}
		trade.lifecycleState = "SELLER_PAYOUT_PENDING";
		trade.payoutState = "PROCESSING";
		trade.payoutReference =
			trade.payoutReference ||
			`PN-PAYOUT-${tradeId}-${randomUUID().slice(0, 8)}`;
		trade.failureReason = undefined;
		trade.version += 1;
		appendAudit(
			trade,
			"system",
			"SELLER_PAYOUT_DISPATCHED",
			prev,
			"SELLER_PAYOUT_PENDING",
			trade.sellerAddress,
			{ payoutReference: trade.payoutReference },
		);
	} else if (action === "confirm") {
		if (trade.lifecycleState === "PAYMENT_CONFIRMED") {
			trade.lifecycleState = "SELLER_PAYOUT_PENDING";
		}
		if (
			!canTransitionLifecycle(trade.lifecycleState, "SELLER_PAYOUT_CONFIRMED")
		) {
			throw new Error(`ILLEGAL_TRANSITION_FROM_${trade.lifecycleState}`);
		}
		trade.lifecycleState = "SELLER_PAYOUT_CONFIRMED";
		trade.payoutState = "CONFIRMED";
		trade.payoutReference =
			trade.payoutReference ||
			`PN-PAYOUT-${tradeId}-${randomUUID().slice(0, 8)}`;
		trade.failureReason = undefined;
		trade.version += 1;
		appendAudit(
			trade,
			"system",
			"SELLER_PAYOUT_CONFIRMED",
			prev,
			"SELLER_PAYOUT_CONFIRMED",
			trade.sellerAddress,
			{
				payoutReference: trade.payoutReference,
				flwTransferId: options?.flwTransferId,
			},
		);
	} else if (action === "hold") {
		if (!canTransitionLifecycle(trade.lifecycleState, "PAYOUT_ON_HOLD")) {
			throw new Error(`ILLEGAL_TRANSITION_FROM_${trade.lifecycleState}`);
		}
		trade.lifecycleState = "PAYOUT_ON_HOLD";
		trade.payoutState = "ON_HOLD";
		trade.failureReason =
			options?.failureReason ||
			"Destination bank transfer timed out or returned uncertain status.";
		trade.version += 1;
		appendAudit(
			trade,
			"system",
			"SELLER_PAYOUT_ON_HOLD",
			prev,
			"PAYOUT_ON_HOLD",
			trade.sellerAddress,
			{ reason: trade.failureReason },
		);
	}

	syncBothUserLedgers(trade);
	return trade;
}

export function transitionTradeRefundState(
	tradeId: string,
	action: "request" | "approve_and_complete",
	actorAddress: string,
	options?: { reason?: string; flwRefundId?: number },
): SharedTrade {
	const trade = sharedTradesMap.get(tradeId);
	if (!trade) throw new Error("TRADE_NOT_FOUND");

	const prev = trade.lifecycleState;
	if (action === "request") {
		if (!canTransitionLifecycle(trade.lifecycleState, "REFUND_PENDING")) {
			throw new Error(`ILLEGAL_REFUND_REQUEST_FROM_${trade.lifecycleState}`);
		}
		trade.lifecycleState = "REFUND_PENDING";
		trade.refundState = "REQUESTED";
		trade.refundReference = `PN-REFUND-${tradeId}-${randomUUID().slice(0, 8)}`;
		trade.failureReason =
			options?.reason || "Refund requested; awaiting provider settlement.";
		trade.version += 1;
		appendAudit(
			trade,
			"seller",
			"REFUND_REQUESTED",
			prev,
			"REFUND_PENDING",
			actorAddress,
			{ refundReference: trade.refundReference, reason: trade.failureReason },
		);
	} else if (action === "approve_and_complete") {
		if (trade.lifecycleState !== "REFUND_PENDING") {
			throw new Error("TRADE_MUST_BE_IN_REFUND_PENDING");
		}
		trade.lifecycleState = "CANCELLED";
		trade.refundState = "COMPLETED";
		trade.escrowState = "CANCELLED";
		trade.status = "disputed";
		trade.failureReason = "Buyer refund settled and escrow cancelled.";
		trade.version += 1;
		appendAudit(
			trade,
			"system",
			"REFUND_COMPLETED_ESCROW_CANCELLED",
			prev,
			"CANCELLED",
			actorAddress,
			{
				refundReference: trade.refundReference,
				flwRefundId: options?.flwRefundId,
			},
		);
	}

	syncBothUserLedgers(trade);
	return trade;
}

export function transitionEscrowReleaseState(
	tradeId: string,
	action: "request_release" | "confirm_on_chain" | "hold_revert",
	options?: { txHash?: string; proofId?: string; failureReason?: string },
): SharedTrade {
	const trade = sharedTradesMap.get(tradeId);
	if (!trade) throw new Error("TRADE_NOT_FOUND");

	const prev = trade.lifecycleState;
	if (action === "request_release") {
		if (trade.paymentState !== "CONFIRMED" || trade.payoutState !== "CONFIRMED") {
			throw new Error(
				"ESCROW_RELEASE_GATED: Both buyer payment and seller fiat payout must be CONFIRMED before releasing USDC.",
			);
		}
		if (!canTransitionLifecycle(trade.lifecycleState, "RELEASE_PENDING")) {
			throw new Error(`ILLEGAL_RELEASE_REQUEST_FROM_${trade.lifecycleState}`);
		}
		trade.lifecycleState = "RELEASE_PENDING";
		trade.escrowState = "RELEASE_PENDING";
		if (options?.txHash) trade.txHash = options.txHash;
		if (options?.proofId) trade.proofId = options.proofId;
		trade.failureReason = undefined;
		trade.version += 1;
		appendAudit(
			trade,
			"oracle",
			"ESCROW_RELEASE_SUBMITTED",
			prev,
			"RELEASE_PENDING",
			undefined,
			{ txHash: options?.txHash, proofId: options?.proofId },
		);
	} else if (action === "confirm_on_chain") {
		if (
			trade.lifecycleState !== "RELEASE_PENDING" &&
			trade.lifecycleState !== "RELEASE_ON_HOLD" &&
			trade.lifecycleState !== "SELLER_PAYOUT_CONFIRMED"
		) {
			throw new Error(
				`CANNOT_COMPLETE_TRADE_FROM_${trade.lifecycleState}`,
			);
		}
		if (trade.lifecycleState === "SELLER_PAYOUT_CONFIRMED") {
			trade.lifecycleState = "RELEASE_PENDING";
		}
		completePeerTrade(tradeId, {
			txHash: options?.txHash ?? trade.txHash,
			proofId: options?.proofId ?? trade.proofId,
		});
		return sharedTradesMap.get(tradeId)!;
	} else if (action === "hold_revert") {
		trade.lifecycleState = "RELEASE_ON_HOLD";
		trade.escrowState = "ON_HOLD";
		trade.failureReason =
			options?.failureReason ||
			"On-chain release transaction reverted or receipt is uncertain; held for reconciliation.";
		trade.version += 1;
		appendAudit(
			trade,
			"oracle",
			"ESCROW_RELEASE_ON_HOLD",
			prev,
			"RELEASE_ON_HOLD",
			undefined,
			{ reason: trade.failureReason, txHash: options?.txHash },
		);
	}

	syncBothUserLedgers(trade);
	return trade;
}

export function reconcileExpiredTrades(): {
	expiredCancelled: string[];
	heldPending: string[];
} {
	const now = new Date();
	const expiredCancelled: string[] = [];
	const heldPending: string[] = [];

	for (const [tid, trade] of sharedTradesMap.entries()) {
		if (trade.lifecycleState !== "AWAITING_PAYMENT" || !trade.paymentDeadlineAt) {
			continue;
		}
		if (now <= new Date(trade.paymentDeadlineAt)) {
			continue;
		}

		// Never cancel while a payment is pending verification or already verified
		if (
			trade.paymentState === "PENDING_VERIFICATION" ||
			trade.paymentState === "CONFIRMED" ||
			trade.paymentState === "LATE_CONFIRMED" ||
			trade.paymentState === "UNDERPAID" ||
			trade.paymentState === "OVERPAID"
		) {
			heldPending.push(tid);
			continue;
		}

		const prev = trade.lifecycleState;
		trade.lifecycleState = "CANCELLED";
		trade.paymentState = "EXPIRED";
		trade.escrowState = "CANCELLED";
		trade.status = "disputed";
		trade.failureReason = "20-minute payment deadline expired without payment.";
		trade.version += 1;

		if (trade.activeTxRef) {
			const att = paymentAttemptsByRef.get(trade.activeTxRef);
			if (att) att.status = "EXPIRED";
		}

		appendAudit(
			trade,
			"system",
			"PAYMENT_DEADLINE_EXPIRED_CANCELLED",
			prev,
			"CANCELLED",
			undefined,
			{ deadline: trade.paymentDeadlineAt },
		);
		syncBothUserLedgers(trade);
		expiredCancelled.push(tid);
	}

	return { expiredCancelled, heldPending };
}

export function completePeerTrade(
	tradeId: string,
	params?: { proofId?: string; txHash?: string },
): void {
	const offerIdx = activePeerOffers.findIndex((o) => o.tradeId === tradeId);
	if (offerIdx !== -1) {
		activePeerOffers.splice(offerIdx, 1);
	}

	const shared = sharedTradesMap.get(tradeId);
	if (shared) {
		const prev = shared.lifecycleState;
		shared.status = "completed";
		shared.lifecycleState = "COMPLETED";
		shared.paymentState = "CONFIRMED";
		shared.payoutState = "CONFIRMED";
		shared.escrowState = "RELEASED";
		shared.failureReason = undefined;
		shared.version += 1;
		if (params?.proofId) shared.proofId = params.proofId;
		if (params?.txHash) shared.txHash = params.txHash;

		appendAudit(
			shared,
			"oracle",
			"ESCROW_SETTLED_COMPLETED",
			prev,
			"COMPLETED",
			undefined,
			{ proofId: shared.proofId, txHash: shared.txHash },
		);
		syncBothUserLedgers(shared);
	}
}
