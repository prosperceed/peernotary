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

function Stat({
	i,
	label,
	icon,
	value,
	foot,
	dark = false,
}: {
	i: number;
	label: string;
	icon: React.ReactNode;
	value: React.ReactNode;
	foot: React.ReactNode;
	dark?: boolean;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
			className={cn(
				"relative overflow-hidden rounded-card border p-5",
				dark ? "border-transparent bg-[#1a2148] text-white shadow-card" : "border-line bg-white shadow-card",
			)}
		>
			<div className="flex items-start justify-between">
				<span className={cn("text-[13px] font-medium", dark ? "text-white/70" : "text-ink-3")}>{label}</span>
				<span
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-lg",
						dark ? "bg-white/10 text-white" : "bg-subtle text-ink-2",
					)}
				>
					{icon}
				</span>
			</div>
			<div className={cn("mt-3 font-display text-[26px] font-bold leading-tight", dark ? "text-white" : "text-ink")}>
				{value}
			</div>
			<div className={cn("mt-3 border-t pt-3 text-xs", dark ? "border-white/10 text-white/65" : "border-line text-ink-3")}>
				{foot}
			</div>
		</motion.div>
	);
}

export function DashboardKpiCards({ stats, activeEscrowsCount }: DashboardKpiCardsProps) {
	const { rate, rateData } = useMonierateRate();
	const total = stats.walletUsdc + stats.lockedEscrowUsdc;
	const lockedPct = total > 0 ? (stats.lockedEscrowUsdc / total) * 100 : 0;
	const rateUp = (rateData?.change24h ?? 0) >= 0;

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Stat
				i={0}
				dark
				label="Wallet balance"
				icon={<Wallet size={16} strokeWidth={1.9} />}
				value={
					<>
						<AnimatedNumber value={stats.walletUsdc} format={usd} />{" "}
						<span className="text-sm font-medium text-white/60">USDC</span>
					</>
				}
				foot={
					<span className="flex justify-between">
						<span>
							≈ <AnimatedNumber value={stats.walletNgn} format={ngn} />
						</span>
						<span className="font-mono">{arcChain.name}</span>
					</span>
				}
			/>
			<Stat
				i={1}
				label="Locked in escrow"
				icon={<LockKeyhole size={16} strokeWidth={1.9} />}
				value={
					<>
						<AnimatedNumber value={stats.lockedEscrowUsdc} format={usd} />{" "}
						<span className="text-sm font-medium text-ink-3">USDC</span>
					</>
				}
				foot={
					<div>
						<div className="flex justify-between">
							<span>{activeEscrowsCount} open</span>
							<span>{lockedPct.toFixed(0)}% of holdings</span>
						</div>
						<div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle">
							<motion.div
								className="h-full rounded-full bg-accent"
								initial={{ width: 0 }}
								animate={{ width: `${lockedPct}%` }}
								transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
							/>
						</div>
					</div>
				}
			/>
			<Stat
				i={2}
				label="Settled volume"
				icon={<Landmark size={16} strokeWidth={1.9} />}
				value={<AnimatedNumber value={stats.totalVolumeNgn} format={ngn} />}
				foot={
					<span className="flex justify-between">
						<span>{stats.completedCount} settled orders</span>
						<span className="font-mono">
							<AnimatedNumber value={stats.totalVolumeUsdc} format={usd} /> USDC
						</span>
					</span>
				}
			/>
			<Stat
				i={3}
				label="Market rate"
				icon={<TrendingUp size={16} strokeWidth={1.9} />}
				value={rate ? <AnimatedNumber value={rate} format={rateFmt} /> : "—"}
				foot={
					<span className="flex items-center justify-between">
						<span>per USDC</span>
						{rateData?.change24hText && (
							<span className={cn("inline-flex items-center gap-0.5 font-mono", rateUp ? "text-mint" : "text-red-600")}>
								{rateUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
								{rateData.change24hText} 24h
							</span>
						)}
					</span>
				}
			/>
		</div>
	);
}
