import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireSuperAdmin } from "@/lib/auth/admin";
import { supabaseServerSelect, supabaseServerRpc, supabaseServerUpsert } from "@/lib/supabase/server";

type Trade = { trade_id: string; version: number; buyer_address: string | null; seller_address: string; lifecycle_state: string; payment_state: string; payout_state: string; escrow_state: string; release_tx_hash: string | null; proof_id_bytes32: string | null; updated_at: string };
type Operation = { trade_id: string; operation_type: string; status: string; tx_hash: string | null; proof_id_bytes32: string | null; failure_reason: string | null; updated_at: string };
type Attempt = { trade_id: string; tx_ref: string; status: string; failure_code: string | null; failure_reason: string | null; updated_at: string };
type Audit = { trade_id: string; actor_role: string; event_type: string; previous_state: string | null; new_state: string | null; metadata: Record<string, unknown>; created_at: string };

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const [trades, operations, attempts, audits] = await Promise.all([
			supabaseServerSelect<Trade>("trades", "select=trade_id,version,buyer_address,seller_address,lifecycle_state,payment_state,payout_state,escrow_state,release_tx_hash,proof_id_bytes32,updated_at&order=updated_at.desc&limit=500"),
			supabaseServerSelect<Operation>("escrow_operations", "select=trade_id,operation_type,status,tx_hash,proof_id_bytes32,failure_reason,updated_at&order=updated_at.desc&limit=1000"),
			supabaseServerSelect<Attempt>("payment_attempts", "select=trade_id,tx_ref,status,failure_code,failure_reason,updated_at&order=updated_at.desc&limit=1000"),
			supabaseServerSelect<Audit>("trade_audit_events", "select=trade_id,actor_role,event_type,previous_state,new_state,metadata,created_at&order=created_at.desc&limit=1000"),
		]);
		const operationByTrade = new Map<string, Operation[]>();
		for (const item of operations) operationByTrade.set(item.trade_id, [...(operationByTrade.get(item.trade_id) || []), item]);
		const attemptByTrade = new Map<string, Attempt[]>();
		for (const item of attempts) attemptByTrade.set(item.trade_id, [...(attemptByTrade.get(item.trade_id) || []), item]);
		const auditByTrade = new Map<string, Audit[]>();
		for (const item of audits) auditByTrade.set(item.trade_id, [...(auditByTrade.get(item.trade_id) || []), item]);
		const items = trades.map((trade) => ({
			...trade,
			operations: operationByTrade.get(trade.trade_id) || [],
			paymentAttempts: attemptByTrade.get(trade.trade_id) || [],
			audit: (auditByTrade.get(trade.trade_id) || []).slice(0, 8),
			reason: (operationByTrade.get(trade.trade_id) || []).find((item) => item.failure_reason)?.failure_reason || (attemptByTrade.get(trade.trade_id) || []).find((item) => item.failure_reason)?.failure_reason || null,
		}));
		return NextResponse.json({ operations: items, counts: { total: items.length, troubled: items.filter((item) => item.reason || ["FAILED", "REVERTED", "UNCERTAIN_ON_HOLD"].includes(item.operations[0]?.status || "") || ["FAILED", "MISMATCH_HOLD"].includes(item.paymentAttempts[0]?.status || "")).length } });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_OPERATIONS_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}

export async function POST(request: NextRequest) {
	try {
		const { walletAddress: adminWallet } = await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const body = (await request.json().catch(() => ({}))) as { tradeId?: string; action?: "review" | "hold_release" | "confirm_payment"; reason?: string };
		if (!body.tradeId || !body.action || !body.reason?.trim()) return NextResponse.json({ error: "TRADE_ACTION_REQUIRES_TRADE_ACTION_REASON" }, { status: 400 });
		const rows = await supabaseServerSelect<Trade>("trades", `trade_id=eq.${encodeURIComponent(body.tradeId)}&select=trade_id,version,buyer_address,seller_address,lifecycle_state,payment_state,payout_state,escrow_state,release_tx_hash,proof_id_bytes32,updated_at&limit=1`);
		const trade = rows[0];
		if (!trade) return NextResponse.json({ error: "TRADE_NOT_FOUND" }, { status: 404 });
		if (body.action !== "review") {
			const transition = body.action === "hold_release" ? { lifecycle: "RELEASE_ON_HOLD", payment: null, escrow: "ON_HOLD" } : { lifecycle: "PAYMENT_CONFIRMED", payment: "CONFIRMED", escrow: null };
			const updated = await supabaseServerRpc("transition_trade_atomic", { p_trade_id: trade.trade_id, p_expected_version: trade.version, p_new_lifecycle_state: transition.lifecycle, p_new_payment_state: transition.payment, p_new_escrow_state: transition.escrow, p_actor_address: adminWallet, p_actor_role: "admin", p_event_type: body.action === "hold_release" ? "ADMIN_RELEASE_HOLD" : "ADMIN_PAYMENT_CONFIRMATION", p_audit_metadata: { reason: body.reason.trim() } });
			if (updated === null) return NextResponse.json({ error: "TRADE_TRANSITION_REJECTED_OR_CONCURRENTLY_CHANGED" }, { status: 409 });
		}
		const logged = await supabaseServerUpsert("admin_action_log", { admin_wallet_address: adminWallet, action: body.action.toUpperCase(), target_type: "trade", target_id: body.tradeId, reason: body.reason.trim() });
		if (logged === null) return NextResponse.json({ error: "ADMIN_ACTION_LOG_FAILED" }, { status: 503 });
		return NextResponse.json({ ok: true });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_OPERATION_ACTION_FAILED" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}
