import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, isConfiguredSuperAdmin, requireSuperAdmin } from "@/lib/auth/admin";
import { supabaseServerSelect, supabaseServerUpsert } from "@/lib/supabase/server";

type WalletRow = { profile_id: string; wallet_address: string; last_authenticated_at: string | null; created_at: string };
type ProfileRow = { id: string; username: string | null; role: string; created_at: string; updated_at: string };
type TradeRow = { buyer_address: string | null; seller_address: string; usdc_amount_units: string | number; lifecycle_state: string };

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const search = request.nextUrl.searchParams.get("search")?.toLowerCase() || "";
		const [wallets, profiles, controls, trades] = await Promise.all([
			supabaseServerSelect<WalletRow>("wallet_accounts", "select=profile_id,wallet_address,last_authenticated_at,created_at&order=last_authenticated_at.desc.nullslast&limit=1000"),
			supabaseServerSelect<ProfileRow>("profiles", "select=id,username,role,created_at,updated_at&order=updated_at.desc&limit=1000"),
			supabaseServerSelect<{ wallet_address: string; status: string; reason: string | null; imposed_at: string }>("admin_user_controls", "select=wallet_address,status,reason,imposed_at&limit=1000"),
			supabaseServerSelect<TradeRow>("trades", "select=buyer_address,seller_address,usdc_amount_units,lifecycle_state&limit=2000"),
		]);
		const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
		const controlByAddress = new Map(controls.map((control) => [control.wallet_address.toLowerCase(), control]));
		const activity = new Map<string, { trades: number; volume: bigint; completed: number }>();
		for (const trade of trades) {
			for (const address of [trade.buyer_address, trade.seller_address]) {
				if (!address) continue;
				const key = address.toLowerCase();
				const current = activity.get(key) || { trades: 0, volume: 0n, completed: 0 };
				current.trades += 1;
				current.volume += BigInt(trade.usdc_amount_units || 0);
				if (trade.lifecycle_state === "COMPLETED") current.completed += 1;
				activity.set(key, current);
			}
		}
		const users = wallets.map((wallet) => {
			const address = wallet.wallet_address.toLowerCase();
			const profile = profileById.get(wallet.profile_id);
			const control = controlByAddress.get(address);
			const stats = activity.get(address) || { trades: 0, volume: 0n, completed: 0 };
			return { walletAddress: wallet.wallet_address, profileId: wallet.profile_id, username: profile?.username || null, role: profile?.role || "trader", status: control?.status || "ACTIVE", reason: control?.reason || null, trades: stats.trades, completedTrades: stats.completed, volumeUsdcUnits: stats.volume.toString(), lastAuthenticatedAt: wallet.last_authenticated_at, createdAt: wallet.created_at, imposedAt: control?.imposed_at || null };
		}).filter((user) => !search || [user.walletAddress, user.username || "", user.status].some((value) => value.toLowerCase().includes(search))).slice(0, 100);
		return NextResponse.json({ users, total: users.length });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_USERS_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}

export async function POST(request: NextRequest) {
	try {
		const { walletAddress: adminWallet } = await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const body = (await request.json().catch(() => ({}))) as { walletAddress?: string; action?: "suspend" | "restore"; reason?: string };
		const walletAddress = body.walletAddress?.toLowerCase() || "";
		if (!/^0x[a-f0-9]{40}$/.test(walletAddress) || !body.action || !body.reason?.trim()) return NextResponse.json({ error: "WALLET_ACTION_REQUIRES_ADDRESS_ACTION_REASON" }, { status: 400 });
		if (isConfiguredSuperAdmin(walletAddress)) return NextResponse.json({ error: "SUPER_ADMIN_CANNOT_BE_SUSPENDED" }, { status: 409 });
		const suspended = body.action === "suspend";
		const saved = await supabaseServerUpsert("admin_user_controls", { wallet_address: walletAddress, status: suspended ? "SUSPENDED" : "ACTIVE", reason: body.reason.trim(), imposed_by: adminWallet, imposed_at: new Date().toISOString(), lifted_at: suspended ? null : new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "wallet_address" });
		if (saved === null) return NextResponse.json({ error: "ADMIN_CONTROL_WRITE_FAILED" }, { status: 503 });
		const logged = await supabaseServerUpsert("admin_action_log", { admin_wallet_address: adminWallet, action: suspended ? "SUSPEND_WALLET" : "RESTORE_WALLET", target_type: "wallet", target_id: walletAddress, reason: body.reason.trim() });
		if (logged === null) return NextResponse.json({ error: "ADMIN_ACTION_LOG_FAILED" }, { status: 503 });
		return NextResponse.json({ ok: true, status: suspended ? "SUSPENDED" : "ACTIVE" });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_USER_ACTION_FAILED" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}
