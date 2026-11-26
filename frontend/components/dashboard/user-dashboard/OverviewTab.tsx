"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Star , Check} from "lucide-react";
import { cn, RATE } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import type { PeerTradeOffer, UserTransaction, UserTrustSummary } from "@/types";

interface OverviewTabProps {
	transactions: UserTransaction[];
	peerOffers: PeerTradeOffer[];
	address?: string;
	username: string | null;
	trustSummary?: UserTrustSummary | null;
	releasingTradeId: string | null;
	onReleaseEscrow: (tx: UserTransaction) => void;
	onViewAllTransactions: () => void;
	onViewEscrows: () => void;
	onRebalance: () => void;
}

export function OverviewTab({
	transactions,
	peerOffers,
	address,
	username,
	trustSummary,
	releasingTradeId,
	onReleaseEscrow,
	onViewAllTransactions,
	onViewEscrows,
	onRebalance,
}: OverviewTabProps) {
	const { rate, rateData } = useMonierateRate();
	const liveRate = rate || RATE;
	const competitor1 = rateData?.competitors?.[0];
	const competitor2 = rateData?.competitors?.[1];
	const isPositive = (rateData?.change24h ?? 0) >= 0;

	const userOffers = peerOffers.filter(
		(o) => o.peerAddress.toLowerCase() === address?.toLowerCase(),
	);

	const performanceMetrics = useMemo(() => {
		const finishedTrades = transactions.filter(
			(t) =>
				t.status === "completed" ||
				t.status === "disputed" ||
				t.lifecycleState === "CANCELLED" ||
				t.lifecycleState === "COMPLETED" ||
				t.lifecycleState === "DISPUTED",
		);
		const completedTrades = transactions.filter(
			(t) => t.status === "completed" || t.lifecycleState === "COMPLETED",
		);
		const disputedTrades = transactions.filter(
			(t) => t.status === "disputed" || t.lifecycleState === "DISPUTED",
		);

		const completedCount = Math.max(
			completedTrades.length,
			trustSummary?.completedTradeCount ?? 0,
		);
		const totalFinishedCount = Math.max(
			finishedTrades.length,
			(trustSummary?.completedTradeCount ?? 0) +
				(trustSummary?.unexplainedExpiryCount ?? 0),
		);

		if (totalFinishedCount === 0 && completedCount === 0) {
			return {
				completionRate: "0.0%",
				positiveRate: "0.0%",
				completedCount: 0,
				totalCount: 0,
				tier: trustSummary?.trustTier ?? "NEW",
				isNew: true,
			};
		}

		const compPct =
			totalFinishedCount > 0
				? (completedCount / totalFinishedCount) * 100
				: 100;
		const posDenominator = completedCount + disputedTrades.length;
		const posPct =
			posDenominator > 0
				? (completedCount / posDenominator) * 100
				: completedCount > 0
					? 100
					: 0;

		return {
			completionRate: `${compPct.toFixed(1)}%`,
			positiveRate: `${posPct.toFixed(1)}%`,
			completedCount,
			totalCount: totalFinishedCount,
			tier: trustSummary?.trustTier ?? "STANDARD",
			isNew: false,
		};
	}, [transactions, trustSummary]);

	return (
		<div className="space-y-6">
			{/* Row 1: Orders and Performance Split */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
				{/* Left 65%: Orders Card */}
				<div className="lg:col-span-8 rounded-xl border border-line bg-surface p-5 shadow-card space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-base font-semibold text-ink">Orders</h2>
						<button
							onClick={onViewAllTransactions}
							className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-ink-2 hover:bg-accent-soft transition-colors"
							title="View all transactions"
						>
							<ArrowUpRight size={14} />
						</button>
					</div>

					<div className="space-y-2.5">
						{transactions.length === 0 ? (
							<div className="py-10 text-center text-xs text-ink-3">
								No active orders recorded yet. Explore peer offers or post your
								own.
							</div>
						) : (
							transactions.slice(0, 4).map((tx) => {
								return (
									<div
										key={tx.id}
										className="p-3.5 rounded-xl bg-surface border border-subtle hover:border-line transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
									>
										<div className="flex items-center gap-3">
											<div className="w-10 h-10 rounded-full bg-[#e2f5ec] text-accent flex items-center justify-center font-semibold text-xs shrink-0">
												$
											</div>
											<div>
												<div className="font-semibold text-ink flex items-center gap-1.5">
													<span>USDC</span>
													<span className="text-ink-3 font-mono text-xs">
														#{tx.tradeId}
													</span>
												</div>
												<div className="text-xs text-ink-3">
													{tx.counterparty}
												</div>
											</div>
										</div>

										<div className="flex items-center gap-4">
											<div>
												<div className="font-semibold text-ink font-mono">
													{tx.ngnAmount}
												</div>
												<div className="text-xs text-ink-3 font-mono">
													{tx.usdcAmount} USDC
												</div>
											</div>

											<div className="hidden sm:block text-xs text-ink-2 font-medium">
												{tx.bankName} Direct
											</div>

											<span className="px-3 py-1 rounded-md text-xs font-semibold bg-subtle text-accent border border-line">
												{tx.status === "completed"
													? "Settled"
													: tx.status === "escrow"
														? "Valid Match"
														: tx.status}
											</span>

											<div className="shrink-0">
												{tx.role === "buyer" &&
												tx.lifecycleState === "AWAITING_PAYMENT" ? (
													<Link
														href={`/bank-checkout?tradeId=${encodeURIComponent(
															tx.tradeId,
														)}&bank=${encodeURIComponent(
															tx.bankName,
														)}&amountNgn=${encodeURIComponent(
															tx.ngnAmount.replace(/[^0-9]/g, ""),
														)}&amountUsdc=${encodeURIComponent(
															tx.usdcAmount,
														)}&accountNo=${encodeURIComponent(
															tx.sellerAccountNumber || "",
														)}&returnTo=/dashboard`}
														className="rounded-md px-4 py-1.5 text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-card"
													>
														Pay
													</Link>
												) : tx.role === "seller" &&
												  (tx.paymentState === "CONFIRMED" ||
														tx.lifecycleState === "PAYMENT_CONFIRMED" ||
														tx.lifecycleState === "SELLER_PAYOUT_CONFIRMED") ? (
													<button
														onClick={() => onReleaseEscrow(tx)}
														disabled={releasingTradeId === tx.tradeId}
														className="rounded-md px-4 py-1.5 text-xs font-semibold bg-ink text-white hover:bg-accent transition-colors disabled:opacity-60"
													>
														{releasingTradeId === tx.tradeId
															? "Releasing..."
															: "Release"}
													</button>
												) : (
													<Link
														href={`/bank-checkout?tradeId=${encodeURIComponent(
															tx.tradeId,
														)}&bank=${encodeURIComponent(
															tx.bankName,
														)}&amountNgn=${encodeURIComponent(
															tx.ngnAmount.replace(/[^0-9]/g, ""),
														)}&amountUsdc=${encodeURIComponent(
															tx.usdcAmount,
														)}&accountNo=${encodeURIComponent(
															tx.sellerAccountNumber || "",
														)}&returnTo=/dashboard`}
														className="rounded-md px-3.5 py-1.5 text-xs font-semibold border border-line text-ink hover:bg-subtle transition-colors"
													>
														View
													</Link>
												)}
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* Right 35%: Performance & Spread Edge */}
				<div className="lg:col-span-4 space-y-4">
					{/* Performance Card */}
					<div className="rounded-xl relative overflow-hidden h-[240px] p-5 flex flex-col justify-between bg-ink text-white">
						<div>
							<div className="flex items-center justify-between">
								<span className="text-lg font-semibold text-white tracking-tight block">
									Performance
								</span>
								<span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-white/10 border border-white/20 text-accent">
									{performanceMetrics.tier}
								</span>
							</div>
							<div className="flex items-center gap-1.5 text-xs text-white/80 mt-1">
								<ShieldCheck size={14} className="text-accent" />
								<span>
									{performanceMetrics.completedCount > 0
										? `Verified P2P Merchant (@${username || "trader"})`
										: `New P2P Trader (@${username || "trader"})`}
								</span>
							</div>
						</div>

						<div className="rounded-full bg-black/40 backdrop-blur-md px-4 py-2 border border-white/20 text-white flex items-center justify-between text-xs">
							<div className="flex items-center gap-1.5">
								<Check size={13} className="text-white/80" />
								<span className="font-semibold text-white/95">
									{performanceMetrics.completionRate}
								</span>
								<span className="text-white/70 text-[11px]">
									30D Completion
									{performanceMetrics.totalCount > 0
										? ` (${performanceMetrics.completedCount}/${performanceMetrics.totalCount})`
										: ""}
								</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Star size={12} className="text-amber-400 fill-amber-400" />
								<span className="font-semibold text-white/95">
									{performanceMetrics.positiveRate}
								</span>
								<span className="text-white/70 text-[11px]">Positive</span>
							</div>
						</div>
					</div>

					{/* Spread Edge Card */}
					<div className="rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-ink">
								Spread Edge
							</span>
							<span className="rounded-full bg-subtle border border-line px-3 py-0.5 text-[11px] font-semibold text-accent flex items-center gap-1.5">
								Auto-peg on
							</span>
						</div>

						<div className="relative pt-2 pb-1">
							<div className="h-1.5 w-full bg-subtle rounded-full relative">
								<div className="h-full bg-accent rounded-full w-[65%]" />
								<div className="absolute top-1/2 -translate-y-1/2 left-[25%] w-3 h-3 rounded-full bg-accent border-2 border-white" />
								<div className="absolute top-1/2 -translate-y-1/2 left-[65%] w-3.5 h-3.5 rounded-full bg-ink border-2 border-white shadow-card" />
							</div>
							<div className="flex items-center justify-between text-[11px] text-ink-3 pt-2">
								<span>{competitor1 ? `${competitor1.name} ${competitor1.formattedDiff}` : "Our Ad +₦0.00"}</span>
								<span>{competitor2 ? `Rank 2 (${competitor2.name}): ${competitor2.formattedDiff}` : "Rank 2: -₦2.98"}</span>
								<span>Rank 1: Best Rate</span>
							</div>
						</div>

						<div className="flex items-center justify-between pt-1">
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-lg font-semibold text-ink">
									₦ {liveRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
								</span>
								<span className={cn("text-[11px] font-semibold", isPositive ? "text-accent" : "text-rose-600")}>
									{rateData?.change24hText ?? "+0.85%"}
								</span>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-accent-soft text-accent">
									Rank 1
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Row 2: Asset Inventory & My Active Offers */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
				{/* Asset Inventory */}
				<div className="lg:col-span-6 rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-ink">
							Asset Inventory
						</h3>
						<button
							onClick={onViewEscrows}
							className="w-7 h-7 rounded-full bg-subtle flex items-center justify-center text-ink-3 hover:text-ink"
						>
							<ArrowUpRight size={13} />
						</button>
					</div>

					<div className="space-y-2 pt-1">
						<div className="flex h-3 w-full rounded-full overflow-hidden bg-subtle gap-1">
							<div
								className="h-full bg-ink rounded-full"
								style={{ width: "35%" }}
							/>
							<div
								className="h-full bg-accent rounded-full"
								style={{ width: "45%" }}
							/>
							<div
								className="h-full bg-accent rounded-full"
								style={{ width: "20%" }}
							/>
						</div>
						<div className="flex items-center justify-between text-xs text-ink-3">
							<span>Escrow (35%)</span>
							<span>Wallet (45%)</span>
							<span>Vault (20%)</span>
						</div>
					</div>

					<div className="flex items-center justify-between pt-2">
						<span className="text-xs text-ink-3">
							Dynamic threshold &lt; 15%
						</span>
						<button
							onClick={onRebalance}
							className="rounded-md px-4 py-1.5 text-xs font-semibold bg-ink text-white hover:bg-accent transition-colors"
						>
							Rebalance
						</button>
					</div>
				</div>

				{/* My Active Offers */}
				<div className="lg:col-span-6 rounded-xl border border-line bg-surface p-5 shadow-card space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-ink">
							My Active Offers
						</h3>
						<span className="text-xs font-mono text-ink-3">
							{userOffers.length}/10 Active
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
						<div className="p-3.5 rounded-xl bg-subtle border border-line space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface text-accent border border-line">
									BUY USDC #9901
								</span>
								<span className="text-[11px] font-mono text-ink-3">
									Instant
								</span>
							</div>
							<div className="text-base font-semibold text-ink font-mono">
								₦ 1,550.00
							</div>
							<div className="text-[11px] text-ink-3">
								GTBank, OPay, Kuda
							</div>
						</div>

						<div className="p-3.5 rounded-xl bg-[#fdfaf4] border border-[#edd5be] space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface text-amber-800 border border-[#edd5be]">
									SELL USDC #9902
								</span>
								<span className="text-[11px] font-mono text-ink-3">
									Auto-Peg
								</span>
							</div>
							<div className="text-base font-semibold text-ink font-mono">
								₦ 1,545.00
							</div>
							<div className="text-[11px] text-ink-3">
								Zenith, Access Bank
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
