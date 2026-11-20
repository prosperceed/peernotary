import "server-only";

import { getAuthenticatedUser } from "@/lib/auth/wallet";
import {
	supabaseServerSelect,
	supabaseServerUpsert,
} from "@/lib/supabase/server";

export class AdminAccessError extends Error {
	constructor(public readonly status = 403) {
		super("Administrator access required");
		this.name = "AdminAccessError";
	}
}

function configuredAdminWallets(): Set<string> {
	return new Set(
		(
			process.env.SUPER_ADMIN_WALLETS ||
			process.env.SUPER_ADMIN_WALLET ||
			""
		)
			.split(",")
			.map((address) => address.trim().toLowerCase())
			.filter((address) => /^0x[a-f0-9]{40}$/.test(address)),
	);
}

export async function requireSuperAdmin(expectedAddress?: string) {
	const user = await getAuthenticatedUser(expectedAddress).catch(() => {
		throw new AdminAccessError(401);
	});
	const walletAddress = user.walletAddress.toLowerCase();

	if (!configuredAdminWallets().has(walletAddress)) {
		throw new AdminAccessError();
	}

	const existing = await supabaseServerSelect<{ wallet_address: string }>(
		"super_admin_wallets",
		`wallet_address=eq.${encodeURIComponent(walletAddress)}&select=wallet_address&limit=1`,
	);

	if (existing.length === 0) {
		const created = await supabaseServerUpsert(
			"super_admin_wallets",
			{
				wallet_address: walletAddress,
				profile_id: user.id,
				last_authenticated_at: new Date().toISOString(),
			},
			{ onConflict: "wallet_address" },
		);
		if (created === null) throw new AdminAccessError(503);
	} else {
		await supabaseServerUpsert(
			"super_admin_wallets",
			{
				wallet_address: walletAddress,
				profile_id: user.id,
				last_authenticated_at: new Date().toISOString(),
			},
			{ onConflict: "wallet_address" },
		);
	}

	return { user, walletAddress };
}

export function isConfiguredSuperAdmin(address?: string): boolean {
	return Boolean(address && configuredAdminWallets().has(address.toLowerCase()));
}
