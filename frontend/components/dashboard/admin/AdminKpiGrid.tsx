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

function Card({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
	return (
		<div className="card p-5">
			<div className="flex items-center gap-2 text-ink-3">
				{icon}
				<span className="label">{label}</span>
			</div>
			<div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-ink">{value}</div>
			<div className="mt-2 text-xs text-ink-2">{detail}</div>
		</div>
	);
}

export default function AdminKpiGrid({ metrics }: { metrics: AdminMetrics }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Card icon={<Activity size={15} strokeWidth={1.75} />} label="Total volume" value={usdc(metrics.totalVolumeUsdcUnits)} detail={`${naira(metrics.totalVolumeFiatMinor)} fiat volume`} />
			<Card icon={<Zap size={15} strokeWidth={1.75} />} label="Queued transactions" value={metrics.queuedTransactions.toLocaleString()} detail="Awaiting payment or release" />
			<Card icon={<LockKeyhole size={15} strokeWidth={1.75} />} label="Active escrow" value={usdc(metrics.totalEscrowUsdcUnits)} detail={`${metrics.activeEscrows.toLocaleString()} live positions`} />
			<Card icon={<Coins size={15} strokeWidth={1.75} />} label="Treasury balance" value={usdc(metrics.treasuryUsdcUnits)} detail={`${usdc(metrics.platformFeesUsdcUnits)} recorded platform fees`} />
		</div>
	);
}
