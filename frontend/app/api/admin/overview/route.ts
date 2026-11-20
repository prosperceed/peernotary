import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireSuperAdmin, AdminAccessError } from "@/lib/auth/admin";
import {
	supabaseServerRpc,
	supabaseServerSelect,
} from "@/lib/supabase/server";

const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];

type TradeRow = {
	trade_id: string;
	seller_address: string;
	buyer_address: string | null;
	usdc_amount_units: number | string;
	fiat_amount_minor: number | string;
	platform_fee_usdc_units: number | string;
	fiat_currency: string;
	lifecycle_state: string;
	payment_state: string;
	escrow_state: string;
	release_tx_hash: string | null;
	created_at: string;
	updated_at: string;
};

type Snapshot = {
	total_volume_usdc_units: number | string;
	total_volume_fiat_minor: number | string;
	completed_transactions: number;
	queued_transactions: number;
	active_escrows: number;
	total_escrow_usdc_units: number | string;
	treasury_fee_usdc_units: number | string;
	total_users: number;
};

function units(value: number | string | bigint | null | undefined): string {
	return BigInt(value ?? 0).toString();
}

async function onChainBalances() {
	const rpcUrl = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL;
	const usdcAddress = process.env.USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS;
	const treasury = process.env.TREASURY_WALLET || process.env.NEXT_PUBLIC_ARC_TREASURY_WALLET;
	const escrow = process.env.ESCROW_ADDRESS || process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
	if (!rpcUrl || !usdcAddress || !treasury || !escrow) {
		return { treasuryUsdcUnits: null, escrowBalanceUsdcUnits: null };
	}

	try {
		const provider = new ethers.JsonRpcProvider(rpcUrl, 5042002, {
			staticNetwork: true,
		});
		const usdc = new ethers.Contract(usdcAddress, USDC_ABI, provider);
		const [treasuryBalance, escrowBalance] = await Promise.all([
			usdc.balanceOf(treasury) as Promise<bigint>,
			usdc.balanceOf(escrow) as Promise<bigint>,
		]);
		return {
			treasuryUsdcUnits: treasuryBalance.toString(),
			escrowBalanceUsdcUnits: escrowBalance.toString(),
		};
	} catch {
		return { treasuryUsdcUnits: null, escrowBalanceUsdcUnits: null };
	}
}

export async function GET(request: NextRequest) {
	try {
		const address = request.headers.get("x-wallet-address") || undefined;
		await requireSuperAdmin(address);

		const [rpcSnapshot, trades, users, balances] = await Promise.all([
			supabaseServerRpc<Snapshot>("admin_dashboard_snapshot", {}),
			supabaseServerSelect<TradeRow>(
				"trades",
				"select=trade_id,seller_address,buyer_address,usdc_amount_units,fiat_amount_minor,platform_fee_usdc_units,fiat_currency,lifecycle_state,payment_state,escrow_state,release_tx_hash,created_at,updated_at&order=created_at.desc&limit=250",
			),
			supabaseServerSelect<{ wallet_address: string }>(
				"wallet_accounts",
				"select=wallet_address&limit=1000",
			),
			onChainBalances(),
		]);

		const snapshot = rpcSnapshot ?? {
			total_volume_usdc_units: trades.reduce((sum, row) => sum + Number(row.usdc_amount_units || 0), 0),
			total_volume_fiat_minor: trades.reduce((sum, row) => sum + Number(row.fiat_amount_minor || 0), 0),
			completed_transactions: trades.filter((row) => row.lifecycle_state === "COMPLETED").length,
			queued_transactions: trades.filter((row) => ["AWAITING_PAYMENT", "PAYMENT_CONFIRMED", "SELLER_PAYOUT_PENDING", "RELEASE_PENDING"].includes(row.lifecycle_state)).length,
			active_escrows: trades.filter((row) => ["CREATED", "FUNDED", "FIAT_SENT", "RELEASE_PENDING", "ON_HOLD", "DISPUTED"].includes(row.escrow_state)).length,
			total_escrow_usdc_units: trades.filter((row) => row.escrow_state !== "RELEASED" && row.escrow_state !== "CANCELLED").reduce((sum, row) => sum + Number(row.usdc_amount_units || 0), 0),
			treasury_fee_usdc_units: trades.reduce((sum, row) => sum + Number(row.platform_fee_usdc_units || 0), 0),
			total_users: users.length,
		};
		const activityByDay = new Map<string, { transactions: number; volumeUsdcUnits: bigint }>();
		for (const row of trades) {
			const day = row.created_at.slice(0, 10);
			const current = activityByDay.get(day) ?? { transactions: 0, volumeUsdcUnits: 0n };
			current.transactions += 1;
			current.volumeUsdcUnits += BigInt(row.usdc_amount_units || 0);
			activityByDay.set(day, current);
		}

		return NextResponse.json({
			updatedAt: new Date().toISOString(),
			metrics: {
				totalVolumeUsdcUnits: units(snapshot.total_volume_usdc_units),
				totalVolumeFiatMinor: units(snapshot.total_volume_fiat_minor),
				completedTransactions: snapshot.completed_transactions,
				queuedTransactions: snapshot.queued_transactions,
				activeEscrows: snapshot.active_escrows,
				totalEscrowUsdcUnits: balances.escrowBalanceUsdcUnits ?? units(snapshot.total_escrow_usdc_units),
				treasuryUsdcUnits: balances.treasuryUsdcUnits ?? units(snapshot.treasury_fee_usdc_units),
				platformFeesUsdcUnits: units(snapshot.treasury_fee_usdc_units),
				totalUsers: snapshot.total_users,
			},
			activity: [...activityByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([day, value]) => ({
				day,
				transactions: value.transactions,
				volumeUsdcUnits: value.volumeUsdcUnits.toString(),
			})),
			recentTransactions: trades.slice(0, 12).map((row) => ({
				id: row.trade_id,
				sellerAddress: row.seller_address,
				buyerAddress: row.buyer_address,
				usdcAmountUnits: units(row.usdc_amount_units),
				fiatAmountMinor: units(row.fiat_amount_minor),
				fiatCurrency: row.fiat_currency,
				status: row.lifecycle_state,
				paymentState: row.payment_state,
				escrowState: row.escrow_state,
				txHash: row.release_tx_hash,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			})),
		});
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json(
			{ error: status === 500 ? "ADMIN_OVERVIEW_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" },
			{ status },
		);
	}
}
