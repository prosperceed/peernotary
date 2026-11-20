import { Activity, Coins, LockKeyhole, Users, WalletCards, Zap } from "lucide-react";
import type { AdminMetrics } from "./types";

function usdc(units: string) {
	const atomic = BigInt(units || 0);
	const whole = (atomic / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").slice(0, 2).replace(/0+$/, "");
	return `${whole}${fraction ? `.${fraction}` : ""} USDC`;
}

function naira(minor: string) {
	const amount = BigInt(minor || 0) / 100n;
	return `₦${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function Card({ icon, label, value, detail, accent }: { icon: React.ReactNode; label: string; value: string; detail: string; accent: string }) {
	return (
		<div className="rounded-2xl border border-[#d1e8dc] bg-white p-5 shadow-[0_12px_35px_rgba(20,100,65,0.04)]">
			<div className="flex items-center justify-between">
				<span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}12` }}>{icon}</span>
				<span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
			</div>
			<div className="mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#7aaa92]">{label}</div>
			<div className="mt-1 font-mono text-2xl font-bold tracking-tight text-[#0d2b1e]">{value}</div>
			<div className="mt-2 text-xs text-[#7aaa92]">{detail}</div>
		</div>
	);
}

export default function AdminKpiGrid({ metrics }: { metrics: AdminMetrics }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			<Card icon={<Activity size={17} className="text-[#1a9e5c]" />} label="Total volume" value={usdc(metrics.totalVolumeUsdcUnits)} detail={`${naira(metrics.totalVolumeFiatMinor)} fiat volume`} accent="#1a9e5c" />
			<Card icon={<Zap size={17} className="text-[#d97706]" />} label="Queued transactions" value={metrics.queuedTransactions.toLocaleString()} detail="Awaiting payment or release" accent="#d97706" />
			<Card icon={<LockKeyhole size={17} className="text-[#22c972]" />} label="Active escrow" value={usdc(metrics.totalEscrowUsdcUnits)} detail={`${metrics.activeEscrows.toLocaleString()} live positions`} accent="#22c972" />
			<Card icon={<Coins size={17} className="text-[#7c3aed]" />} label="Treasury balance" value={usdc(metrics.treasuryUsdcUnits)} detail={`${usdc(metrics.platformFeesUsdcUnits)} recorded platform fees`} accent="#7c3aed" />
			<Card icon={<WalletCards size={17} className="text-[#0891b2]" />} label="Completed trades" value={metrics.completedTransactions.toLocaleString()} detail="Settled successfully" accent="#0891b2" />
			<Card icon={<Users size={17} className="text-[#3d6b55]" />} label="Wallets" value={metrics.totalUsers.toLocaleString()} detail="Registered wallet accounts" accent="#3d6b55" />
		</div>
	);
}
