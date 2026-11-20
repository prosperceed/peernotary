import "server-only";

import { supabaseServerSelect } from "@/lib/supabase/server";

export async function isWalletSuspended(walletAddress: string): Promise<boolean> {
	const rows = await supabaseServerSelect<{ status: string }>(
		"admin_user_controls",
		`wallet_address=eq.${encodeURIComponent(walletAddress.toLowerCase())}&status=eq.SUSPENDED&select=status&limit=1`,
	);
	return rows.length > 0;
}
