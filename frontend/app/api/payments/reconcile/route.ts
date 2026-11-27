import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcilePayments } from "@/lib/payments/watcher";

/**
 * Runs one payment-watcher pass. Call it from a scheduler (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`) or from the Rust service's worker.
 * Protected by PAYMENT_RECONCILE_SECRET (or CRON_SECRET).
 */
function authorized(request: NextRequest): boolean {
	const secret = process.env.PAYMENT_RECONCILE_SECRET || process.env.CRON_SECRET;
	if (!secret) return false;
	const header = request.headers.get("authorization") ?? "";
	const expected = `Bearer ${secret}`;
	const a = Buffer.from(header);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
	if (!process.env.PAYMENT_RECONCILE_SECRET && !process.env.CRON_SECRET) {
		return NextResponse.json({ error: "RECONCILE_NOT_CONFIGURED" }, { status: 503 });
	}
	if (!authorized(request)) {
		return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
	}
	const summary = await reconcilePayments({ force: true });
	return NextResponse.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
export const dynamic = "force-dynamic";
