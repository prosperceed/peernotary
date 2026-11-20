import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireSuperAdmin } from "@/lib/auth/admin";
import { supabaseServerSelect } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const [adminActions, tradeEvents] = await Promise.all([
			supabaseServerSelect<{ id: string; admin_wallet_address: string; action: string; target_type: string; target_id: string; reason: string; created_at: string }>("admin_action_log", "select=id,admin_wallet_address,action,target_type,target_id,reason,created_at&order=created_at.desc&limit=250"),
			supabaseServerSelect<{ id: string; trade_id: string; actor_role: string; actor_address: string | null; event_type: string; new_state: string | null; metadata: Record<string, unknown>; created_at: string }>("trade_audit_events", "select=id,trade_id,actor_role,actor_address,event_type,new_state,metadata,created_at&order=created_at.desc&limit=250"),
		]);
		return NextResponse.json({ events: [...adminActions.map((item) => ({ id: item.id, source: "ADMIN", actor: item.admin_wallet_address, action: item.action, target: `${item.target_type}:${item.target_id}`, reason: item.reason, createdAt: item.created_at })), ...tradeEvents.map((item) => ({ id: item.id, source: "TRADE", actor: item.actor_address || item.actor_role, action: item.event_type, target: `trade:${item.trade_id}`, reason: typeof item.metadata?.reason === "string" ? item.metadata.reason : null, state: item.new_state, createdAt: item.created_at }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300) });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_AUDIT_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}
