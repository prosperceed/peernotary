import { randomUUID } from "node:crypto";
import { getUsernameForAddress } from "@/lib/auth/wallet";
import {
	supabaseServerSelect,
	supabaseServerUpdate,
	supabaseServerUpsert,
} from "@/lib/supabase/server";
import { RATE } from "@/lib/utils";
import type {
	EscrowOperationState,
	PaymentState,
	PayoutState,
	PeerTradeOffer,
	QueueEntryItem,
	RefundState,
	TradeAuditEventItem,
	TradeLifecycleState,
	TrustTier,
	TxStatus,
	UserTransaction,
	UserTrustSummary,
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

const initialPeerOffers: PeerTradeOffer[] = [];

interface SellerInventoryRecord {
	listingTradeId: string;
	sellerAddress: string;
	totalDepositedUnits: number;
	availableUnits: number;
	allocatedUnits: number;
	reservedQueuedUnits: number;
	filledUnits: number;
	rateNgn: number;
	bankName: string;
	activeSlotTradeId?: string;
}

const userLedgerStore = new Map<string, UserTransaction[]>();
const sharedTradesMap = new Map<string, SharedTrade>();
const sellerInventoryMap = new Map<string, SellerInventoryRecord>();
const childTradeToParentListingMap = new Map<string, string>();
const queueEntriesStore = new Map<string, QueueEntryItem>();
const userTrustStore = new Map<string, UserTrustSummary>();
const paymentAttemptsByRef = new Map<string, PaymentAttemptInfo>();
const consumedFlwTxIds = new Map<number, string>();
const webhookDeduplicationSet = new Set<string>();
const tradeAuditStore = new Map<string, TradeAuditEventItem[]>();
const activePeerOffers: PeerTradeOffer[] = [...initialPeerOffers];

export function syncTradeToSupabase(trade: SharedTrade): void {
	void supabaseServerUpsert(
		"trades",
		{
			trade_id: trade.tradeId,
			seller_address: trade.sellerAddress.toLowerCase(),
			buyer_address: trade.buyerAddress ? trade.buyerAddress.toLowerCase() : null,
			side: trade.side,
			usdc_amount_units: trade.usdcAmountUnits,
			buyer_collateral_usdc_units: 0,
			platform_fee_bps: 100,
			platform_fee_usdc_units: Math.round(trade.usdcAmountUnits * 0.01),
			fiat_currency: trade.fiatCurrency || "NGN",
			fiat_amount_minor: trade.fiatAmountMinor,
			exchange_rate_minor: Math.round(trade.rateNgn * 100),
			seller_bank_code: trade.bankCode,
			seller_bank_name: trade.bankName,
			seller_account_masked: trade.accountMasked,
			seller_account_hash: trade.accountMasked,
			lifecycle_state: trade.lifecycleState,
			payment_state: trade.paymentState,
			payout_state: trade.payoutState,
			refund_state: trade.refundState,
			escrow_state: trade.escrowState,
			version: trade.version,
			created_at: new Date().toISOString(),
		},
		{ onConflict: "trade_id" },
	);
}

export function syncListingToSupabase(
	inv: SellerInventoryRecord,
	depositTxHash?: string,
): void {
	void supabaseServerUpsert(
		"seller_listings",
		{
			listing_ref: inv.listingTradeId,
			seller_address: inv.sellerAddress.toLowerCase(),
			total_escrowed_usdc_units: inv.totalDepositedUnits,
			available_usdc_units: inv.availableUnits,
			allocated_active_usdc_units: inv.allocatedUnits,
			reserved_queued_usdc_units: inv.reservedQueuedUnits,
			settled_usdc_units: inv.filledUnits,
			exchange_rate_minor: Math.round(inv.rateNgn * 100),
			fiat_currency: "NGN",
			seller_bank_code: bankToCode(inv.bankName),
			seller_bank_name: inv.bankName,
			seller_account_masked: "******",
			seller_account_hash: inv.listingTradeId,
			chain_id: 5042002,
			escrow_contract_address:
				process.env.ESCROW_ADDRESS ||
				"0x5042f1114C6F272f5909f16510399986EF0D734D",
			deposit_tx_hash: depositTxHash || null,
			status: inv.availableUnits > 0 ? "ACTIVE" : "DEPLETED",
			version: 1,
		},
		{ onConflict: "listing_ref" },
	);
}

export function persistPaymentAttemptToSupabase(
	attempt: PaymentAttemptInfo,
): void {
	void supabaseServerUpsert(
		"payment_attempts",
		{
			attempt_id: attempt.id,
			trade_id: attempt.tradeId,
			buyer_address: attempt.buyerAddress.toLowerCase(),
			tx_ref: attempt.txRef,
			expected_amount_minor: attempt.expectedAmountMinor,
			expected_currency: attempt.expectedCurrency,
			status: attempt.status,
			checkout_url: attempt.checkoutUrl,
			flw_tx_id: attempt.flwTxId || null,
			expires_at: attempt.expiresAt,
		},
		{ onConflict: "tx_ref" },
	);
}

export async function hydrateUserTradesFromSupabase(
	address: string,
): Promise<void> {
	const lower = address.toLowerCase();
	try {
		const rows = await supabaseServerSelect<{
			trade_id: string;
			seller_address: string;
			buyer_address: string | null;
			side: "sell" | "buy";
			usdc_amount_units: number;
			fiat_amount_minor: number;
			fiat_currency: string;
			exchange_rate_minor: number;
			seller_bank_code: string;
			seller_bank_name: string;
			seller_account_masked: string;
			lifecycle_state: TradeLifecycleState;
			payment_state: PaymentState;
			payout_state: PayoutState;
			refund_state: RefundState;
			escrow_state: EscrowOperationState;
			version: number;
			created_at: string;
		}>(
			"trades",
			`or=(seller_address.eq.${encodeURIComponent(lower)},buyer_address.eq.${encodeURIComponent(lower)})&order=created_at.desc&limit=50`,
		);

		for (const row of rows) {
			if (!sharedTradesMap.has(row.trade_id)) {
				const usdcAmt = formatUnitsToUsdcString(row.usdc_amount_units);
				const ngnAmt = `₦${(row.fiat_amount_minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
				const shared: SharedTrade = {
					id: row.trade_id,
					tradeId: row.trade_id,
					sellerAddress: row.seller_address.toLowerCase(),
					buyerAddress: row.buyer_address
						? row.buyer_address.toLowerCase()
						: undefined,
					side: row.side || "sell",
					usdcAmount: usdcAmt,
					usdcAmountUnits: row.usdc_amount_units,
					ngnAmount: ngnAmt,
					fiatAmountMinor: row.fiat_amount_minor,
					fiatCurrency: row.fiat_currency || "NGN",
					rateNgn: row.exchange_rate_minor
						? row.exchange_rate_minor / 100
						: RATE,
					bankName: row.seller_bank_name || "Bank Transfer",
					bankCode: row.seller_bank_code || "058",
					accountMasked: row.seller_account_masked || "******",
					requiredCollateralUsdc: "0.00",
					status:
						row.lifecycle_state === "COMPLETED"
							? "completed"
							: row.lifecycle_state === "CANCELLED" ||
								  row.lifecycle_state === "DISPUTED"
								? "disputed"
								: "escrow",
					lifecycleState: row.lifecycle_state,
					paymentState: row.payment_state,
					payoutState: row.payout_state,
					refundState: row.refund_state,
					escrowState: row.escrow_state,
					termsLocked: true,
					version: row.version || 1,
					createdAt: row.created_at || "Recent",
				};
				sharedTradesMap.set(row.trade_id, shared);
				syncBothUserLedgers(shared);
			}
		}
	} catch {
		// Ignore hydration failure
	}
}

function formatUnitsToUsdcString(units: number): string {
	return (units / 1_000_000).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	});
}

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
	sellerInventoryMap.set(off.tradeId, {
		listingTradeId: off.tradeId,
		sellerAddress: off.peerAddress.toLowerCase(),
		totalDepositedUnits: usdcUnits,
		availableUnits: usdcUnits,
		allocatedUnits: 0,
		reservedQueuedUnits: 0,
		filledUnits: 0,
		rateNgn: off.rateNgn,
		bankName: off.bankName,
	});
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
		requiredCollateralUsdc: "0.00",
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
	SELLER_PAYOUT_CONFIRMED: ["RELEASE_PENDING", "RELEASE_ON_HOLD", "DISPUTED"],
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
	syncTradeToSupabase(trade);
}

function syncOfferFromInventory(listingTradeId: string) {
	const inv = sellerInventoryMap.get(listingTradeId);
	if (!inv) return;

	const waitingEntries = Array.from(queueEntriesStore.values())
		.filter(
			(q) =>
				q.listingTradeId === listingTradeId &&
				(q.status === "QUEUED" || q.status === "ELIGIBLE_AWAITING_CONSENT"),
		)
		.sort((a, b) => a.queuePosition - b.queuePosition);

	const offerIdx = activePeerOffers.findIndex(
		(o) => o.tradeId === listingTradeId,
	);
	if (
		inv.availableUnits <= 0 &&
		inv.allocatedUnits <= 0 &&
		inv.reservedQueuedUnits <= 0
	) {
		if (offerIdx !== -1) activePeerOffers.splice(offerIdx, 1);
		return;
	}

	if (offerIdx !== -1) {
		const off = activePeerOffers[offerIdx];
		off.availableUsdc = formatUnitsToUsdcString(inv.availableUnits);
		off.availableUsdcUnits = inv.availableUnits;
		off.allocatedUsdc = formatUnitsToUsdcString(inv.allocatedUnits);
		off.reservedQueuedUsdc = formatUnitsToUsdcString(inv.reservedQueuedUnits);
		off.filledUsdc = formatUnitsToUsdcString(inv.filledUnits);
		off.maxLimitUsdc = off.availableUsdc;
		off.ngnAmount = `₦${Math.round((inv.availableUnits / 1_000_000) * inv.rateNgn).toLocaleString("en-NG")}`;
		off.sellerBusy = Boolean(inv.activeSlotTradeId);
		off.activeSlotTradeId = inv.activeSlotTradeId;
		off.queueDepth = waitingEntries.length;
		off.estimatedWaitSeconds = inv.activeSlotTradeId
			? (waitingEntries.length + 1) * 600
			: 0;
	}
}

function countBuyerActiveUnpaidObligations(buyerAddress: string): number {
	const bAddr = buyerAddress.toLowerCase();
	let count = 0;
	for (const trade of sharedTradesMap.values()) {
		if (
			trade.buyerAddress?.toLowerCase() === bAddr &&
			trade.lifecycleState === "AWAITING_PAYMENT" &&
			(trade.paymentState === "UNPAID" ||
				trade.paymentState === "CHECKOUT_CREATED" ||
				trade.paymentState === "PENDING_VERIFICATION")
		) {
			count += 1;
		}
	}
	for (const q of queueEntriesStore.values()) {
		if (
			q.buyerAddress.toLowerCase() === bAddr &&
			(q.status === "QUEUED" || q.status === "ELIGIBLE_AWAITING_CONSENT")
		) {
			count += 1;
		}
	}
	return count;
}

function recalculateTrustSummary(summary: UserTrustSummary): UserTrustSummary {
	const nowMs = Date.now();
	if (summary.cooldownUntil) {
		const untilMs = new Date(summary.cooldownUntil).getTime();
		if (untilMs > nowMs) {
			summary.cooldownRemainingSeconds = Math.ceil((untilMs - nowMs) / 1000);
		} else {
			summary.cooldownRemainingSeconds = 0;
			summary.cooldownUntil = undefined;
			summary.cooldownReason = undefined;
		}
	} else {
		summary.cooldownRemainingSeconds = 0;
	}

	const completedBonus = Math.min(summary.completedTradeCount * 12, 240);
	const verBonus = summary.strongerVerificationStatus === "VERIFIED" ? 60 : 0;
	const expiryPenalty =
		summary.unexplainedExpiryCount * 25 + summary.consecutiveExpiryStreak * 20;
	const rawScore = 50 + completedBonus + verBonus - expiryPenalty;
	summary.trustScore = Math.max(0, Math.min(1000, rawScore));

	let tier: TrustTier = "NEW";
	let maxUnits = 150_000_000; // 150 USDC
	let maxConcurrent = 1;

	if (summary.consecutiveExpiryStreak >= 4 || summary.trustScore < 25) {
		tier = "RESTRICTED";
		maxUnits = 50_000_000; // 50 USDC
		maxConcurrent = 1;
	} else if (summary.completedTradeCount >= 20 && summary.trustScore >= 300) {
		tier = "HIGH_LIMIT";
		maxUnits = 10_000_000_000; // 10,000 USDC
		maxConcurrent = 3;
	} else if (summary.completedTradeCount >= 5 && summary.trustScore >= 140) {
		tier = "ESTABLISHED";
		maxUnits = 2_500_000_000; // 2,500 USDC
		maxConcurrent = 2;
	} else if (summary.completedTradeCount >= 1 && summary.trustScore >= 60) {
		tier = "STANDARD";
		maxUnits = 500_000_000; // 500 USDC
		maxConcurrent = 1;
	}

	if (summary.strongerVerificationStatus === "VERIFIED") {
		maxUnits = Math.max(maxUnits, 2_500_000_000);
	}
	if (summary.activeGuarantorBackedUsdc) {
		const backedUnits = Math.round(
			parseAmountUsdc(summary.activeGuarantorBackedUsdc) * 1_000_000,
		);
		maxUnits = Math.max(maxUnits, backedUnits);
	}

	summary.trustTier = tier;
	summary.maxTradeUsdcUnits = maxUnits;
	summary.maxTradeUsdc = formatUnitsToUsdcString(maxUnits);
	summary.maxConcurrentUnpaidTrades = maxConcurrent;
	summary.activeUnpaidCount = countBuyerActiveUnpaidObligations(
		summary.walletAddress,
	);
	return summary;
}

export function getUserTrustSummary(address: string): UserTrustSummary {
	const key = address.toLowerCase();
	let existing = userTrustStore.get(key);
	if (!existing) {
		existing = {
			walletAddress: key,
			trustTier: "NEW",
			trustScore: 50,
			maxTradeUsdc: "150.00",
			maxTradeUsdcUnits: 150_000_000,
			maxConcurrentUnpaidTrades: 1,
			activeUnpaidCount: 0,
			completedTradeCount: 0,
			completedVolumeUsdc: "0.00",
			unexplainedExpiryCount: 0,
			consecutiveExpiryStreak: 0,
			cooldownRemainingSeconds: 0,
			strongerVerificationStatus: "NONE",
		};
		userTrustStore.set(key, existing);
	}
	return recalculateTrustSummary(existing);
}

export function getUserQueueEntries(address: string): QueueEntryItem[] {
	const key = address.toLowerCase();
	return Array.from(queueEntriesStore.values())
		.filter(
			(q) =>
				(q.buyerAddress.toLowerCase() === key ||
					q.sellerAddress.toLowerCase() === key) &&
				(q.status === "QUEUED" ||
					q.status === "ELIGIBLE_AWAITING_CONSENT" ||
					q.status === "ACTIVE_SLOT"),
		)
		.sort((a, b) => a.queuePosition - b.queuePosition);
}

export function getActivePeerOffers(): PeerTradeOffer[] {
	for (const listingId of sellerInventoryMap.keys()) {
		syncOfferFromInventory(listingId);
	}
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
		tradeId?: string;
	},
): { offer: PeerTradeOffer; transaction: UserTransaction } {
	const sAddr = sellerAddress.toLowerCase();
	const newTradeId = params.tradeId || String(1001 + sharedTradesMap.size);
	const usdcUnits = Math.round(params.usdcAmount * 1_000_000);
	if (usdcUnits <= 0) {
		throw new Error("AMOUNT_MUST_BE_POSITIVE");
	}
	const fiatMinor = Math.round((usdcUnits * RATE * 100) / 1_000_000);
	if (fiatMinor < 100) {
		throw new Error("BELOW_PROVIDER_MINIMUM_NGN");
	}

	const formattedUsdc = formatUnitsToUsdcString(usdcUnits);
	const formattedNgn = `₦${Math.round(params.usdcAmount * RATE).toLocaleString("en-NG")}`;
	const rawAcct = params.accountNumber?.replace(/\D/g, "") || "";
	const accountMasked =
		rawAcct.length >= 4 ? `******${rawAcct.slice(-4)}` : "—";

	const sellerLedger = getUserLedger(sAddr);

	sellerInventoryMap.set(newTradeId, {
		listingTradeId: newTradeId,
		sellerAddress: sAddr,
		totalDepositedUnits: usdcUnits,
		availableUnits: usdcUnits,
		allocatedUnits: 0,
		reservedQueuedUnits: 0,
		filledUnits: 0,
		rateNgn: RATE,
		bankName: params.bankName,
	});

	const offer: PeerTradeOffer = {
		tradeId: newTradeId,
		peerHandle: shortAddressOrUsername(sellerAddress),
		peerAddress: sellerAddress,
		side: params.side ?? "sell",
		totalDepositedUsdc: formattedUsdc,
		availableUsdc: formattedUsdc,
		availableUsdcUnits: usdcUnits,
		allocatedUsdc: "0.00",
		reservedQueuedUsdc: "0.00",
		filledUsdc: "0.00",
		ngnAmount: formattedNgn,
		rateNgn: RATE,
		minLimitUsdc: "0.01",
		maxLimitUsdc: formattedUsdc,
		requiredCollateralUsdc: "0.00",
		bankName: params.bankName,
		completionRate: "100%",
		completedTrades: sellerLedger.filter((t) => t.status === "completed")
			.length,
		avgReleaseTime: "4.1s",
		createdAt: "Just now",
		sellerBusy: false,
		queueDepth: 0,
		estimatedWaitSeconds: 0,
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
		requiredCollateralUsdc: "0.00",
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
	syncTradeToSupabase(shared);
	const inv = sellerInventoryMap.get(newTradeId);
	if (inv) syncListingToSupabase(inv, params.txHash);

	return { offer, transaction: sellerTx };
}

export function takePeerOffer(
	buyerAddress: string,
	tradeId: string,
	txHash?: string,
	requestedUsdcAmount?: number,
): {
	executionMode: "ACTIVE_SLOT" | "QUEUED";
	tradeTx?: UserTransaction;
	sharedTrade?: SharedTrade;
	queueEntry?: QueueEntryItem;
} {
	const bAddr = buyerAddress.toLowerCase();
	const parentShared = sharedTradesMap.get(tradeId);
	const inv = sellerInventoryMap.get(tradeId);
	if (!parentShared || !inv) {
		throw new Error("OFFER_NOT_FOUND");
	}
	if (parentShared.sellerAddress.toLowerCase() === bAddr) {
		throw new Error("CANNOT_BUY_OWN_OFFER");
	}

	const trust = getUserTrustSummary(bAddr);
	if (trust.cooldownRemainingSeconds > 0) {
		throw new Error(
			`BUYER_COOLDOWN_ACTIVE: Wait ${trust.cooldownRemainingSeconds}s before opening a new trade (${trust.cooldownReason ?? "Unpaid trade expiration"}).`,
		);
	}
	if (trust.activeUnpaidCount >= trust.maxConcurrentUnpaidTrades) {
		throw new Error(
			"ONE_ACTIVE_UNPAID_TRADE_LIMIT: Complete or cancel your current unpaid trade or queued request before starting another.",
		);
	}

	const reqUnits = requestedUsdcAmount
		? Math.round(requestedUsdcAmount * 1_000_000)
		: inv.availableUnits;
	if (reqUnits <= 0) {
		throw new Error("INVALID_AMOUNT");
	}
	if (reqUnits > inv.availableUnits) {
		throw new Error("REQUESTED_AMOUNT_EXCEEDS_AVAILABLE_INVENTORY");
	}
	if (reqUnits > trust.maxTradeUsdcUnits) {
		throw new Error(
			`TRUST_LIMIT_EXCEEDED: Requested ${formatUnitsToUsdcString(reqUnits)} USDC exceeds your ${trust.trustTier} tier limit of ${trust.maxTradeUsdc} USDC. Complete smaller trades or attach a guarantor commitment.`,
		);
	}

	const fiatMinor = Math.round((reqUnits * inv.rateNgn * 100) / 1_000_000);
	if (fiatMinor < 100) {
		throw new Error(
			"BELOW_PROVIDER_MINIMUM_NGN: Converted amount must be at least ₦1.00 (100 kobo).",
		);
	}

	const formattedReqUsdc = formatUnitsToUsdcString(reqUnits);
	const formattedReqNgn = `₦${Math.round((reqUnits / 1_000_000) * inv.rateNgn).toLocaleString("en-NG")}`;

	// If seller is currently serving another active buyer slot, place this buyer in deterministic FIFO queue
	if (inv.activeSlotTradeId) {
		inv.availableUnits -= reqUnits;
		inv.reservedQueuedUnits += reqUnits;

		const existingWaiting = Array.from(queueEntriesStore.values()).filter(
			(q) =>
				q.listingTradeId === tradeId &&
				(q.status === "QUEUED" || q.status === "ELIGIBLE_AWAITING_CONSENT"),
		).length;
		const position = existingWaiting + 1;
		const queueRef = `Q-${tradeId}-${Date.now().toString().slice(-5)}`;

		const qEntry: QueueEntryItem = {
			queueRef,
			listingTradeId: tradeId,
			sellerHandle: shortAddressOrUsername(parentShared.sellerAddress),
			sellerAddress: parentShared.sellerAddress,
			buyerAddress: bAddr,
			requestedUsdc: formattedReqUsdc,
			requestedUsdcUnits: reqUnits,
			ngnAmount: formattedReqNgn,
			rateNgn: inv.rateNgn,
			bankName: inv.bankName,
			queuePosition: position,
			status: "QUEUED",
			estimatedWaitSeconds: position * 600,
			createdAt: new Date().toISOString(),
		};

		queueEntriesStore.set(queueRef, qEntry);
		syncOfferFromInventory(tradeId);

		return {
			executionMode: "QUEUED",
			queueEntry: qEntry,
		};
	}

	// Seller slot is free -> allocate partial or full order into active slot immediately
	const isPartialFill =
		reqUnits < inv.totalDepositedUnits ||
		inv.filledUnits > 0 ||
		inv.reservedQueuedUnits > 0;
	const activeTradeId = isPartialFill
		? `${tradeId}${Math.floor(10 + Math.random() * 89)}`
		: tradeId;

	inv.availableUnits -= reqUnits;
	inv.allocatedUnits += reqUnits;
	inv.activeSlotTradeId = activeTradeId;
	childTradeToParentListingMap.set(activeTradeId, tradeId);

	const deadline = new Date(
		Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1_000,
	).toISOString();

	const activeShared: SharedTrade = {
		id: randomUUID(),
		tradeId: activeTradeId,
		sellerAddress: parentShared.sellerAddress,
		buyerAddress: bAddr,
		side: parentShared.side,
		usdcAmount: formattedReqUsdc,
		usdcAmountUnits: reqUnits,
		ngnAmount: formattedReqNgn,
		fiatAmountMinor: fiatMinor,
		fiatCurrency: "NGN",
		rateNgn: inv.rateNgn,
		bankName: inv.bankName,
		bankCode: parentShared.bankCode,
		accountMasked: parentShared.accountMasked,
		requiredCollateralUsdc: "0.00",
		status: "escrow",
		lifecycleState: "AWAITING_PAYMENT",
		paymentState: "UNPAID",
		payoutState: "NOT_STARTED",
		refundState: "NONE",
		escrowState: "FUNDED",
		termsLocked: true,
		paymentDeadlineAt: deadline,
		txHash: txHash ?? parentShared.txHash,
		version: 1,
		createdAt: "Just now",
	};

	sharedTradesMap.set(activeTradeId, activeShared);
	syncOfferFromInventory(tradeId);

	appendAudit(
		activeShared,
		"buyer",
		"SELLER_ESCROW_ALLOCATED_AWAITING_PAYMENT",
		"OPEN",
		"AWAITING_PAYMENT",
		buyerAddress,
		{
			parentListingId: tradeId,
			requestedUsdc: formattedReqUsdc,
			buyerCollateralUsdc: "0.00",
			paymentDeadlineAt: deadline,
			txHash,
		},
	);

	const sAddr = parentShared.sellerAddress;
	const sellerLedger = getUserLedger(sAddr);
	sellerLedger.unshift({
		id: `TX-${activeTradeId}-S`,
		tradeId: activeTradeId,
		type: "sell",
		role: "seller",
		counterparty: shortAddressOrUsername(buyerAddress),
		counterpartyAddress: buyerAddress,
		usdcAmount: formattedReqUsdc,
		ngnAmount: formattedReqNgn,
		bankName: inv.bankName,
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

	const buyerLedger = getUserLedger(bAddr);
	const tradeTx: UserTransaction = {
		id: `TX-${activeTradeId}-B`,
		tradeId: activeTradeId,
		type: parentShared.side === "sell" ? "buy" : "sell",
		role: parentShared.side === "sell" ? "buyer" : "seller",
		counterparty: shortAddressOrUsername(parentShared.sellerAddress),
		counterpartyAddress: parentShared.sellerAddress,
		usdcAmount: formattedReqUsdc,
		ngnAmount: formattedReqNgn,
		bankName: inv.bankName,
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

	buyerLedger.unshift(tradeTx);
	syncTradeToSupabase(activeShared);
	syncListingToSupabase(inv);

	return {
		executionMode: "ACTIVE_SLOT",
		tradeTx,
		sharedTrade: activeShared,
	};
}

export function cancelBuyerQueueEntry(
	buyerAddress: string,
	queueRef: string,
	reason?: string,
): QueueEntryItem {
	const bAddr = buyerAddress.toLowerCase();
	const q = queueEntriesStore.get(queueRef);
	if (!q) throw new Error("QUEUE_ENTRY_NOT_FOUND");
	if (q.buyerAddress.toLowerCase() !== bAddr) {
		throw new Error("NOT_QUEUE_ENTRY_OWNER");
	}
	if (q.status !== "QUEUED" && q.status !== "ELIGIBLE_AWAITING_CONSENT") {
		throw new Error("QUEUE_ENTRY_NOT_CANCELLABLE");
	}

	q.status = "CANCELLED_BY_BUYER";
	const inv = sellerInventoryMap.get(q.listingTradeId);
	if (inv && inv.reservedQueuedUnits >= q.requestedUsdcUnits) {
		inv.reservedQueuedUnits -= q.requestedUsdcUnits;
		inv.availableUnits += q.requestedUsdcUnits;
	}

	// Re-number remaining waiting entries in FIFO order
	const remaining = Array.from(queueEntriesStore.values())
		.filter(
			(item) =>
				item.listingTradeId === q.listingTradeId &&
				(item.status === "QUEUED" ||
					item.status === "ELIGIBLE_AWAITING_CONSENT"),
		)
		.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);

	remaining.forEach((item, index) => {
		item.queuePosition = index + 1;
		item.estimatedWaitSeconds = (index + 1) * 600;
		if (index === 0 && inv && !inv.activeSlotTradeId) {
			item.status = "ELIGIBLE_AWAITING_CONSENT";
		}
	});

	syncOfferFromInventory(q.listingTradeId);
	void reason;
	return q;
}

export function activateBuyerQueueEntry(
	buyerAddress: string,
	queueRef: string,
): {
	tradeTx: UserTransaction;
	sharedTrade: SharedTrade;
	queueEntry: QueueEntryItem;
} {
	const bAddr = buyerAddress.toLowerCase();
	const q = queueEntriesStore.get(queueRef);
	if (!q) throw new Error("QUEUE_ENTRY_NOT_FOUND");
	if (q.buyerAddress.toLowerCase() !== bAddr) {
		throw new Error("NOT_QUEUE_ENTRY_OWNER");
	}
	if (
		q.status !== "ELIGIBLE_AWAITING_CONSENT" &&
		!(q.status === "QUEUED" && q.queuePosition === 1)
	) {
		throw new Error("QUEUE_ENTRY_NOT_AT_FRONT");
	}

	const inv = sellerInventoryMap.get(q.listingTradeId);
	const parentShared = sharedTradesMap.get(q.listingTradeId);
	if (!inv || !parentShared) throw new Error("SELLER_LISTING_NOT_FOUND");
	if (inv.activeSlotTradeId) {
		throw new Error("SELLER_SLOT_STILL_BUSY");
	}

	inv.reservedQueuedUnits = Math.max(
		0,
		inv.reservedQueuedUnits - q.requestedUsdcUnits,
	);
	inv.availableUnits += q.requestedUsdcUnits;

	q.status = "ACTIVE_SLOT";
	const activated = takePeerOffer(
		buyerAddress,
		q.listingTradeId,
		undefined,
		q.requestedUsdcUnits / 1_000_000,
	);
	if (!activated.sharedTrade || !activated.tradeTx) {
		throw new Error("FAILED_TO_ACTIVATE_QUEUED_ORDER");
	}
	q.allocatedTradeId = activated.sharedTrade.tradeId;
	q.queuePosition = 0;
	q.estimatedWaitSeconds = 0;

	return {
		tradeTx: activated.tradeTx,
		sharedTrade: activated.sharedTrade,
		queueEntry: q,
	};
}

export function submitGuarantorCommitment(
	buyerAddress: string,
	guarantorAddress: string,
	maxBackedUsdc: number,
): UserTrustSummary {
	const bAddr = buyerAddress.toLowerCase();
	const gAddr = guarantorAddress.toLowerCase();
	if (bAddr === gAddr) {
		throw new Error("GUARANTOR_MUST_BE_DISTINCT_WALLET");
	}
	const summary = getUserTrustSummary(bAddr);
	summary.activeGuarantorAddress = guarantorAddress;
	summary.activeGuarantorBackedUsdc = maxBackedUsdc.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return recalculateTrustSummary(summary);
}

export function verifyStrongerIdentity(
	walletAddress: string,
): UserTrustSummary {
	const summary = getUserTrustSummary(walletAddress);
	summary.strongerVerificationStatus = "VERIFIED";
	return recalculateTrustSummary(summary);
}

function releaseSellerSlotAndAdvanceQueue(tradeId: string, completed: boolean) {
	const parentListingId = childTradeToParentListingMap.get(tradeId) ?? tradeId;
	const inv = sellerInventoryMap.get(parentListingId);
	const trade = sharedTradesMap.get(tradeId);
	if (!inv || !trade) return;

	const units = trade.usdcAmountUnits;
	if (inv.allocatedUnits >= units) {
		inv.allocatedUnits -= units;
		if (completed) {
			inv.filledUnits += units;
		} else {
			inv.availableUnits += units;
		}
	}
	if (inv.activeSlotTradeId === tradeId) {
		inv.activeSlotTradeId = undefined;
	}

	for (const q of queueEntriesStore.values()) {
		if (q.allocatedTradeId === tradeId && q.status === "ACTIVE_SLOT") {
			q.status = completed ? "COMPLETED" : "EXPIRED";
		}
	}

	// Mark next FIFO queued buyer as ELIGIBLE_AWAITING_CONSENT
	const waiting = Array.from(queueEntriesStore.values())
		.filter(
			(q) => q.listingTradeId === parentListingId && q.status === "QUEUED",
		)
		.sort((a, b) => a.queuePosition - b.queuePosition);

	if (waiting.length > 0) {
		waiting[0].status = "ELIGIBLE_AWAITING_CONSENT";
		waiting[0].queuePosition = 1;
		waiting[0].consentDeadlineAt = new Date(
			Date.now() + 5 * 60 * 1_000,
		).toISOString();
	}

	syncOfferFromInventory(parentListingId);
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
		throw new Error("TRADE_NOT_FOUND");
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
	persistPaymentAttemptToSupabase(attempt);
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

	if (
		params.currency.toUpperCase() !== attempt.expectedCurrency.toUpperCase()
	) {
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
		if (
			!canTransitionLifecycle(trade.lifecycleState, "SELLER_PAYOUT_PENDING")
		) {
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
		releaseSellerSlotAndAdvanceQueue(tradeId, false);
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
		if (
			trade.paymentState !== "CONFIRMED" ||
			trade.payoutState !== "CONFIRMED"
		) {
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
			throw new Error(`CANNOT_COMPLETE_TRADE_FROM_${trade.lifecycleState}`);
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

const COOLDOWN_STEPS_SECONDS = [300, 900, 3600, 21600, 86400];

export function reconcileExpiredTrades(): {
	expiredCancelled: string[];
	heldPending: string[];
} {
	const now = new Date();
	const expiredCancelled: string[] = [];
	const heldPending: string[] = [];

	for (const [tid, trade] of sharedTradesMap.entries()) {
		if (
			trade.lifecycleState !== "AWAITING_PAYMENT" ||
			!trade.paymentDeadlineAt
		) {
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

		releaseSellerSlotAndAdvanceQueue(tid, false);

		if (trade.buyerAddress) {
			const trust = getUserTrustSummary(trade.buyerAddress);
			trust.unexplainedExpiryCount += 1;
			trust.consecutiveExpiryStreak += 1;
			const stepIdx = Math.min(
				trust.consecutiveExpiryStreak - 1,
				COOLDOWN_STEPS_SECONDS.length - 1,
			);
			const cooldownSecs = COOLDOWN_STEPS_SECONDS[stepIdx];
			trust.cooldownUntil = new Date(
				Date.now() + cooldownSecs * 1_000,
			).toISOString();
			trust.cooldownReason = "Unpaid 20-minute trade deadline expired";
			recalculateTrustSummary(trust);
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

		releaseSellerSlotAndAdvanceQueue(tradeId, true);

		if (shared.buyerAddress) {
			const trust = getUserTrustSummary(shared.buyerAddress);
			trust.completedTradeCount += 1;
			trust.consecutiveExpiryStreak = 0;
			const prevVol = parseAmountUsdc(trust.completedVolumeUsdc);
			const addedVol = shared.usdcAmountUnits / 1_000_000;
			trust.completedVolumeUsdc = (prevVol + addedVol).toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
			recalculateTrustSummary(trust);
		}

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

export function cancelPeerTradeUser(
	tradeId: string,
	callerAddress: string,
	reason?: string,
): SharedTrade {
	const lower = callerAddress.toLowerCase();
	const trade = sharedTradesMap.get(tradeId);
	if (!trade) {
		throw new Error("TRADE_NOT_FOUND");
	}

	const isBuyer =
		trade.buyerAddress && trade.buyerAddress.toLowerCase() === lower;
	const isSeller = trade.sellerAddress.toLowerCase() === lower;

	if (!isBuyer && !isSeller) {
		throw new Error("CALLER_NOT_AUTHORIZED_TO_CANCEL");
	}

	if (
		trade.paymentState === "PENDING_VERIFICATION" ||
		trade.paymentState === "CONFIRMED" ||
		trade.paymentState === "LATE_CONFIRMED"
	) {
		throw new Error("CANNOT_CANCEL_CONFIRMED_PAYMENT");
	}

	if (trade.lifecycleState === "COMPLETED") {
		throw new Error("TRADE_ALREADY_COMPLETED");
	}

	if (trade.lifecycleState === "CANCELLED") {
		return trade;
	}

	const prev = trade.lifecycleState;
	trade.lifecycleState = "CANCELLED";
	trade.paymentState = "FAILED";
	trade.escrowState = "CANCELLED";
	trade.status = "disputed";
	trade.failureReason = reason || "Trade cancelled by user.";
	trade.version += 1;

	if (trade.activeTxRef) {
		const att = paymentAttemptsByRef.get(trade.activeTxRef);
		if (att) att.status = "FAILED";
	}

	releaseSellerSlotAndAdvanceQueue(tradeId, false);

	appendAudit(
		trade,
		isBuyer ? "buyer" : "seller",
		"USER_CANCELLED_TRADE",
		prev,
		"CANCELLED",
		lower,
		{ reason: trade.failureReason },
	);

	syncBothUserLedgers(trade);
	return trade;
}
