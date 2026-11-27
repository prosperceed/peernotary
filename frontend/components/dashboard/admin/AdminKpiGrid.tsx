"use client";

import { motion } from "framer-motion";
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

const TONES = [
	"border-transparent bg-[#1a2148] text-white",
	"border-line/70 bg-white",
	"border-line/70 bg-white",
	"border-line/70 bg-white",
];
const TILES = [
	"border-transparent bg-white/10 text-white",
	"border-transparent bg-subtle text-ink-2",
	"border-transparent bg-subtle text-ink-2",
	"border-transparent bg-subtle text-ink-2",
];

function Card({ i, icon, label, value, detail }: { i: number; icon: React.ReactNode; label: string; value: string; detail: string }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
			className={`relative overflow-hidden rounded-card border p-5 shadow-card backdrop-blur-xl ${TONES[i]}`}
		>
			<div className="flex items-center justify-between">
				<span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${TILES[i]}`}>{icon}</span>
				<span className={i === 0 ? "text-xs font-medium text-white/75" : "label"}>{label}</span>
			</div>
			<div className={`mt-5 font-display text-2xl font-semibold tracking-tight ${i === 0 ? "text-white" : "text-ink"}`}>{value}</div>
			<div className={`mt-1.5 text-xs ${i === 0 ? "text-white/75" : "text-ink-3"}`}>{detail}</div>
		</motion.div>
	);
}

export default function AdminKpiGrid({ metrics }: { metrics: AdminMetrics }) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Card i={0} icon={<Activity size={17} strokeWidth={1.8} />} label="Total volume" value={usdc(metrics.totalVolumeUsdcUnits)} detail={`${naira(metrics.totalVolumeFiatMinor)} fiat volume`} />
			<Card i={1} icon={<Zap size={17} strokeWidth={1.8} />} label="Queued transactions" value={metrics.queuedTransactions.toLocaleString()} detail="Awaiting payment or release" />
			<Card i={2} icon={<LockKeyhole size={17} strokeWidth={1.8} />} label="Active escrow" value={usdc(metrics.totalEscrowUsdcUnits)} detail={`${metrics.activeEscrows.toLocaleString()} live positions`} />
			<Card i={3} icon={<Coins size={17} strokeWidth={1.8} />} label="Treasury balance" value={usdc(metrics.treasuryUsdcUnits)} detail={`${usdc(metrics.platformFeesUsdcUnits)} recorded platform fees`} />
		</div>
	);
}
