"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Landmark, LockKeyhole, TrendingUp, Wallet } from "lucide-react";
import { arcChain } from "@/lib/web3/arcConfig";
import { cn } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import AnimatedNumber from "@/components/shared/AnimatedNumber";
import type { DashboardStats } from "./types";

interface DashboardKpiCardsProps {
	stats: DashboardStats;
	activeEscrowsCount: number;
}

const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ngn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const rateFmt = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cardMotion = (i: number) => ({
	initial: { opacity: 0, y: 16 },
	animate: { opacity: 1, y: 0 },
	transition: { duration: 0.55, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] as const },
});

function Tile({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", className)}>{children}</span>
	);
}

export function DashboardKpiCards({ stats, activeEscrowsCount }: DashboardKpiCardsProps) {
	const { rate, rateData } = useMonierateRate();
	const total = stats.walletUsdc + stats.lockedEscrowUsdc;
	const lockedPct = total > 0 ? (stats.lockedEscrowUsdc / total) * 100 : 0;
	const rateUp = (rateData?.change24h ?? 0) >= 0;

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{/* Wallet: the one emphasised card */}
			<motion.div
				{...cardMotion(0)}
				className="relative overflow-hidden rounded-card bg-gradient-to-br from-[#1a9b62] via-accent to-[#0a5c39] p-5 text-white shadow-glow"
			>
				<div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
				<div className="flex items-center justify-between">
					<Tile className="border-white/25 bg-white/15 text-white">
						<Wallet size={17} strokeWidth={1.8} />
					</Tile>
					<span className="font-mono text-[11px] text-white/75">{arcChain.name}</span>
				</div>
				<div className="mt-5 text-xs text-white/75">Wallet balance</div>
				<div className="mt-1 font-display text-[26px] font-semibold leading-tight text-white">
					<AnimatedNumber value={stats.walletUsdc} format={usd} /> <span className="text-sm font-medium text-white/75">USDC</span>
				</div>
				<div className="mt-2 font-mono text-xs text-white/80">≈ <AnimatedNumber value={stats.walletNgn} format={ngn} /></div>
			</motion.div>

			{/* Locked in escrow */}
			<motion.div {...cardMotion(1)} className="card p-5">
				<div className="flex items-center justify-between">
					<Tile className="border-accent/25 bg-accent/10 text-accent-ink">
						<LockKeyhole size={17} strokeWidth={1.8} />
					</Tile>
					<span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-3">
						{activeEscrowsCount} open
					</span>
				</div>
				<div className="mt-5 text-xs text-ink-3">Locked in escrow</div>
				<div className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
					<AnimatedNumber value={stats.lockedEscrowUsdc} format={usd} /> <span className="text-sm font-medium text-ink-3">USDC</span>
				</div>
				<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
					<motion.div
						className="h-full rounded-full bg-gradient-to-r from-[#2fb177] to-accent"
						initial={{ width: 0 }}
						animate={{ width: `${lockedPct}%` }}
						transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
					/>
				</div>
				<div className="mt-1.5 text-[11px] text-ink-3">{lockedPct.toFixed(0)}% of your USDC is working</div>
			</motion.div>

			{/* Settled volume */}
			<motion.div {...cardMotion(2)} className="card p-5">
				<div className="flex items-center justify-between">
					<Tile className="border-mint/20 bg-mint-soft text-mint">
						<Landmark size={17} strokeWidth={1.8} />
					</Tile>
					<span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-3">
						{stats.completedCount} settled
					</span>
				</div>
				<div className="mt-5 text-xs text-ink-3">Settled volume</div>
				<div className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
					<AnimatedNumber value={stats.totalVolumeNgn} format={ngn} />
				</div>
				<div className="mt-2 font-mono text-xs text-ink-3">
					<AnimatedNumber value={stats.totalVolumeUsdc} format={usd} /> USDC
				</div>
			</motion.div>

			{/* Live market rate */}
			<motion.div {...cardMotion(3)} className="card p-5">
				<div className="flex items-center justify-between">
					<Tile className="border-line-strong bg-subtle text-ink-2">
						<TrendingUp size={17} strokeWidth={1.8} />
					</Tile>
					{rateData?.change24hText && (
						<span
							className={cn(
								"inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px]",
								rateUp ? "bg-mint-soft text-mint" : "bg-red-50 text-red-600",
							)}
						>
							{rateUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
							{rateData.change24hText}
						</span>
					)}
				</div>
				<div className="mt-5 text-xs text-ink-3">Market rate</div>
				<div className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
					{rate ? <AnimatedNumber value={rate} format={rateFmt} /> : "—"}
				</div>
				<div className="mt-2 text-xs text-ink-3">per USDC · 24h</div>
			</motion.div>
		</div>
	);
}
