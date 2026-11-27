import "server-only";

import {
	getFlutterwaveChargeStatus,
	settleAndReleaseEscrowAfterPaymentConfirmed,
	verifyFlutterwaveTransactionServerSide,
} from "@/lib/payments/flutterwaveServer";
import {
	getProviderConfirmedPayment,
	listTradesForPaymentWatch,
	markPaymentAttemptFailed,
	reconcileExpiredTrades,
} from "@/lib/trades/tradeStore";

/**
 * Payment watcher.
 *
 * The escrow releases USDC only after the payment provider confirms a charge.
 * Webhooks are the fast path; this watcher is the safety net that keeps
 * asking Flutterwave about every open payment so nothing depends on a buyer
 * clicking a button or on a webhook arriving:
 *
 *   successful at provider  → record it (verify API) and release on-chain
 *   failed / cancelled      → mark the attempt failed; buyer can retry
 *   confirmed, not released → retry the on-chain release (idempotent proof id)
 *   deadline passed, unpaid → cancel the order and free the seller's USDC
 *
 * It runs from: the Flutterwave webhook, an in-process timer (instrumentation.ts),
 * POST /api/payments/reconcile (cron or the Rust service's worker), and a
 * throttled check whenever a trade's status is polled.
 */

export interface WatchSummary {
	checked: number;
	released: string[];
	failed: string[];
	retried: string[];
	expired: string[];
	errors: { tradeId: string; error: string }[];
}

const lastChecked = new Map<string, number>();
const MIN_RECHECK_MS = 10_000;
let passInFlight: Promise<WatchSummary> | null = null;

async function watchTrade(tradeId: string, txRef: string, lifecycleState: string, summary: WatchSummary) {
	// Confirmed by the provider but the release didn't go through: retry it.
	const confirmed = getProviderConfirmedPayment(tradeId);
	if (confirmed && lifecycleState !== "COMPLETED") {
		await settleAndReleaseEscrowAfterPaymentConfirmed({
			tradeId,
			txRef: confirmed.txRef,
			flwTxId: confirmed.flwTxId ?? 0,
		});
		summary.retried.push(tradeId);
		return;
	}

	if (lifecycleState !== "AWAITING_PAYMENT") return;

	const status = await getFlutterwaveChargeStatus(txRef);
	if (status.state === "successful") {
		// Re-verifies with Flutterwave, records the payment and settles on-chain.
		await verifyFlutterwaveTransactionServerSide({ tradeId, txRef, flwTransactionId: status.flwTxId });
		summary.released.push(tradeId);
	} else if (status.state === "failed") {
		markPaymentAttemptFailed(txRef, `Provider reported the charge as ${status.reason}`);
		summary.failed.push(tradeId);
	}
}

/**
 * One reconciliation pass. Concurrent callers share the same pass. Pass a
 * tradeId to check just that trade (throttled), e.g. when its page polls.
 */
export async function reconcilePayments(opts: { tradeId?: string; force?: boolean } = {}): Promise<WatchSummary> {
	if (!opts.tradeId && passInFlight) return passInFlight;

	const run = async (): Promise<WatchSummary> => {
		const summary: WatchSummary = { checked: 0, released: [], failed: [], retried: [], expired: [], errors: [] };
		const now = Date.now();
		const trades = listTradesForPaymentWatch().filter((t) => !opts.tradeId || t.tradeId === opts.tradeId);

		for (const trade of trades) {
			if (!opts.force && now - (lastChecked.get(trade.tradeId) ?? 0) < MIN_RECHECK_MS) continue;
			lastChecked.set(trade.tradeId, now);
			summary.checked += 1;
			try {
				await watchTrade(trade.tradeId, trade.activeTxRef!, trade.lifecycleState, summary);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				// "Not confirmed yet" is the normal waiting state, not an error.
				if (!message.includes("PAYMENT_NOT_CONFIRMED")) summary.errors.push({ tradeId: trade.tradeId, error: message });
			}
		}

		if (!opts.tradeId) summary.expired = reconcileExpiredTrades().expiredCancelled;
		if (summary.errors.length) console.error("payment watcher errors", summary.errors);
		return summary;
	};

	if (opts.tradeId) return run();
	passInFlight = run().finally(() => {
		passInFlight = null;
	});
	return passInFlight;
}

let timerStarted = false;

/** Starts the in-process watcher once per server process (long-running hosts). */
export function startPaymentWatcher(intervalMs: number): void {
	if (timerStarted || intervalMs <= 0) return;
	timerStarted = true;
	const tick = () => {
		void reconcilePayments().catch((err) => console.error("payment watcher pass failed", err));
	};
	const handle = setInterval(tick, intervalMs);
	// Don't keep the process alive just for the watcher.
	(handle as { unref?: () => void }).unref?.();
	console.log(`payment watcher running every ${Math.round(intervalMs / 1000)}s`);
}
