/**
 * Runs once when the Next.js server starts. Starts the payment watcher on
 * long-running Node hosts (next start, Docker, Render). On serverless hosts a
 * timer can't outlive a request, so schedule POST /api/payments/reconcile
 * instead (see .env.example).
 *
 * PAYMENT_WATCHER_INTERVAL_MS: default 30000; set to 0 to disable.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	if (process.env.NEXT_PHASE === "phase-production-build") return;
	const intervalMs = Number(process.env.PAYMENT_WATCHER_INTERVAL_MS ?? 30_000);
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
	const { startPaymentWatcher } = await import("@/lib/payments/watcher");
	startPaymentWatcher(intervalMs);
}
