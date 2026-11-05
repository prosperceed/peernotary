"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Star } from "lucide-react";
import { cn, RATE } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import type { PeerTradeOffer, UserTransaction } from "@/types";

interface OverviewTabProps {
	transactions: UserTransaction[];
	peerOffers: PeerTradeOffer[];
	address?: string;
	username: string | null;
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

	return (
		<div className="space-y-6">
			{/* Row 1: Orders and Performance Split */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
				{/* Left 65%: Orders Card */}
				<div className="lg:col-span-8 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="text-base font-bold text-[#0d2b1e]">Orders</h2>
						<button
							onClick={onViewAllTransactions}
							className="w-8 h-8 rounded-full bg-[#f4f7f5] flex items-center justify-center text-[#3d6b55] hover:bg-[#e2f0e8] transition-colors"
							title="View all transactions"
						>
							<ArrowUpRight size={14} />
						</button>
					</div>

					<div className="space-y-2.5">
						{transactions.length === 0 ? (
							<div className="py-10 text-center text-xs text-[#7aaa92]">
								No active orders recorded yet. Explore peer offers or post your
								own.
							</div>
						) : (
							transactions.slice(0, 4).map((tx) => {
								return (
									<div
										key={tx.id}
										className="p-3.5 rounded-2xl bg-[#fbfdfc] border border-[#eef2ee] hover:border-[#d1e8dc] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
									>
										<div className="flex items-center gap-3">
											<div className="w-10 h-10 rounded-full bg-[#e2f5ec] text-[#1a9e5c] flex items-center justify-center font-bold text-xs shrink-0">
												$
											</div>
											<div>
												<div className="font-semibold text-[#0d2b1e] flex items-center gap-1.5">
													<span>USDC</span>
													<span className="text-[#7aaa92] font-mono text-[11px]">
														#{tx.tradeId}
													</span>
												</div>
												<div className="text-[11px] text-[#7aaa92]">
													{tx.counterparty}
												</div>
											</div>
										</div>

										<div className="flex items-center gap-4">
											<div>
												<div className="font-bold text-[#0d2b1e] font-mono">
													{tx.ngnAmount}
												</div>
												<div className="text-[11px] text-[#7aaa92] font-mono">
													{tx.usdcAmount} USDC
												</div>
											</div>

											<div className="hidden sm:block text-[11px] text-[#3d6b55] font-medium">
												{tx.bankName} Direct
											</div>

											<span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
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
														className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#1a9e5c] text-white hover:bg-[#15854c] transition-all shadow-sm"
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
														className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#0d2b1e] text-white hover:bg-[#1a9e5c] transition-all disabled:opacity-60"
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
														className="rounded-full px-3.5 py-1.5 text-xs font-semibold border border-[#d1e8dc] text-[#0d2b1e] hover:bg-[#f0f7f3] transition-all"
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
					<div className="rounded-[28px] relative overflow-hidden h-[240px] p-5 flex flex-col justify-between shadow-sm bg-gradient-to-br from-[#0d2b1e] via-[#145a3a] to-[#082015] text-white">
						<div>
							<span className="text-lg font-bold text-white tracking-tight block">
								Performance
							</span>
							<div className="flex items-center gap-1.5 text-xs text-white/80 mt-1">
								<ShieldCheck size={14} className="text-[#4dd68c]" />
								<span>
									Verified P2P Merchant (@{username || "trader"})
								</span>
							</div>
						</div>

						<div className="rounded-full bg-black/40 backdrop-blur-md px-4 py-2 border border-white/20 text-white flex items-center justify-between text-xs">
							<div className="flex items-center gap-1.5">
								<div className="w-3.5 h-3.5 rounded-full bg-[#1a9e5c] text-white flex items-center justify-center text-[9px] font-bold">
									✓
								</div>
								<span className="font-semibold text-white/95">99.4%</span>
								<span className="text-white/70 text-[10px]">
									30D Completion
								</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Star size={12} className="text-amber-400 fill-amber-400" />
								<span className="font-semibold text-white/95">99.8%</span>
								<span className="text-white/70 text-[10px]">Positive</span>
							</div>
						</div>
					</div>

					{/* Spread Edge Card */}
					<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-xs font-semibold text-[#0d2b1e]">
								Spread Edge
							</span>
							<span className="rounded-full bg-[#f0f7f3] border border-[#d1e8dc] px-3 py-0.5 text-[10px] font-semibold text-[#1a9e5c] flex items-center gap-1.5">
								<span className="w-1.5 h-1.5 rounded-full bg-[#1a9e5c] animate-pulse" />
								Auto-Peg ✓
							</span>
						</div>

						<div className="relative pt-2 pb-1">
							<div className="h-1.5 w-full bg-[#eef4f0] rounded-full relative">
								<div className="h-full bg-[#1a9e5c] rounded-full w-[65%]" />
								<div className="absolute top-1/2 -translate-y-1/2 left-[25%] w-3 h-3 rounded-full bg-[#1a9e5c] border-2 border-white" />
								<div className="absolute top-1/2 -translate-y-1/2 left-[65%] w-3.5 h-3.5 rounded-full bg-[#0d2b1e] border-2 border-white shadow-sm" />
							</div>
							<div className="flex items-center justify-between text-[10px] text-[#7aaa92] pt-2">
								<span>{competitor1 ? `${competitor1.name} ${competitor1.formattedDiff}` : "Our Ad +₦0.00"}</span>
								<span>{competitor2 ? `Rank 2 (${competitor2.name}): ${competitor2.formattedDiff}` : "Rank 2: -₦2.98"}</span>
								<span>Rank 1: Best Rate</span>
							</div>
						</div>

						<div className="flex items-center justify-between pt-1">
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-lg font-bold text-[#0d2b1e]">
									₦ {liveRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
								</span>
								<span className={cn("text-[10px] font-bold", isPositive ? "text-[#1a9e5c]" : "text-rose-600")}>
									{rateData?.change24hText ?? "+0.85%"}
								</span>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f7ee] text-[#1a9e5c]">
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
				<div className="lg:col-span-6 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-bold text-[#0d2b1e]">
							Asset Inventory
						</h3>
						<button
							onClick={onViewEscrows}
							className="w-7 h-7 rounded-full bg-[#f4f7f5] flex items-center justify-center text-[#7aaa92] hover:text-[#0d2b1e]"
						>
							<ArrowUpRight size={13} />
						</button>
					</div>

					<div className="space-y-2 pt-1">
						<div className="flex h-3 w-full rounded-full overflow-hidden bg-[#eef4f0] gap-1">
							<div
								className="h-full bg-[#0d2b1e] rounded-full"
								style={{ width: "35%" }}
							/>
							<div
								className="h-full bg-[#1a9e5c] rounded-full"
								style={{ width: "45%" }}
							/>
							<div
								className="h-full bg-[#4dd68c] rounded-full"
								style={{ width: "20%" }}
							/>
						</div>
						<div className="flex items-center justify-between text-[11px] text-[#7aaa92]">
							<span>Escrow (35%)</span>
							<span>Wallet (45%)</span>
							<span>Vault (20%)</span>
						</div>
					</div>

					<div className="flex items-center justify-between pt-2">
						<span className="text-xs text-[#7aaa92]">
							Dynamic threshold &lt; 15%
						</span>
						<button
							onClick={onRebalance}
							className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#0d2b1e] text-white hover:bg-[#1a9e5c] transition-all"
						>
							Rebalance
						</button>
					</div>
				</div>

				{/* My Active Offers */}
				<div className="lg:col-span-6 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-bold text-[#0d2b1e]">
							My Active Offers
						</h3>
						<span className="text-xs font-mono text-[#7aaa92]">
							{userOffers.length}/10 Active
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
						<div className="p-3.5 rounded-2xl bg-[#f4fbf7] border border-[#d1e8dc] space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#1a9e5c] border border-[#d1e8dc]">
									BUY USDC #9901
								</span>
								<span className="text-[10px] font-mono text-[#7aaa92]">
									Instant
								</span>
							</div>
							<div className="text-base font-bold text-[#0d2b1e] font-mono">
								₦ 1,550.00
							</div>
							<div className="text-[10px] text-[#7aaa92]">
								GTBank, OPay, Kuda
							</div>
						</div>

						<div className="p-3.5 rounded-2xl bg-[#fdfaf4] border border-[#edd5be] space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-amber-800 border border-[#edd5be]">
									SELL USDC #9902
								</span>
								<span className="text-[10px] font-mono text-[#7aaa92]">
									Auto-Peg
								</span>
							</div>
							<div className="text-base font-bold text-[#0d2b1e] font-mono">
								₦ 1,545.00
							</div>
							<div className="text-[10px] text-[#7aaa92]">
								Zenith, Access Bank
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
