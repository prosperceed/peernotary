import { Activity, Coins, LockKeyhole, Zap } from "lucide-react";
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

function Card({ icon, label, value, detail, accent, tint }: { icon: React.ReactNode; label: string; value: string; detail: string; accent: string; tint: string }) {
	return (
		<div className="rounded-2xl border border-white/60 p-5 shadow-[0_12px_35px_rgba(20,100,65,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(20,100,65,0.12)]" style={{ background: tint }}>
			<div className="flex items-center justify-between">
				<span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}12` }}>{icon}</span>
				<span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
			</div>
			<div className="mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#7aaa92]">{label}</div>
			<div className="mt-1 text-2xl font-bold tracking-tight text-[#0d2b1e]">{value}</div>
			<div className="mt-2 text-xs text-[#527663]">{detail}</div>
		</div>
	);
}

export default function AdminKpiGrid({ metrics }: { metrics: AdminMetrics }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Card icon={<Activity size={17} className="text-[#087f4e]" />} label="Total volume" value={usdc(metrics.totalVolumeUsdcUnits)} detail={`${naira(metrics.totalVolumeFiatMinor)} fiat volume`} accent="#087f4e" tint="linear-gradient(135deg, #dff7e9 0%, #bcebd2 100%)" />
			<Card icon={<Zap size={17} className="text-[#238557]" />} label="Queued transactions" value={metrics.queuedTransactions.toLocaleString()} detail="Awaiting payment or release" accent="#238557" tint="linear-gradient(135deg, #edf8e3 0%, #d3efc5 100%)" />
			<Card icon={<LockKeyhole size={17} className="text-[#0d7652]" />} label="Active escrow" value={usdc(metrics.totalEscrowUsdcUnits)} detail={`${metrics.activeEscrows.toLocaleString()} live positions`} accent="#0d7652" tint="linear-gradient(135deg, #dff5ed 0%, #bfe9dc 100%)" />
			<Card icon={<Coins size={17} className="text-[#367d59]" />} label="Treasury balance" value={usdc(metrics.treasuryUsdcUnits)} detail={`${usdc(metrics.platformFeesUsdcUnits)} recorded platform fees`} accent="#367d59" tint="linear-gradient(135deg, #e6f5e9 0%, #cbe8d3 100%)" />
		</div>
	);
}
