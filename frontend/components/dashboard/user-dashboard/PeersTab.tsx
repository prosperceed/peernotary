"use client";

import { Search } from "lucide-react";
import { BankSearchSelect } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { PeerTradeOffer } from "@/types";

function parseNumericUsdc(val: string): number {
	return parseFloat(val.replace(/,/g, "")) || 0;
}

interface PeersTabProps {
	peerOffers: PeerTradeOffer[];
	peerSideFilter: "all" | "buy" | "sell";
	setPeerSideFilter: (side: "all" | "buy" | "sell") => void;
	peerBankFilter: string;
	setPeerBankFilter: (bank: string) => void;
	peerSearch: string;
	setPeerSearch: (search: string) => void;
	partialAmountsByOffer: Record<string, string>;
	setPartialAmountsByOffer: React.Dispatch<
		React.SetStateAction<Record<string, string>>
	>;
	address?: string;
	joiningTradeId: string | null;
	onTakePeerOffer: (offer: PeerTradeOffer) => void;
}

export function PeersTab({
	peerOffers,
	peerSideFilter,
	setPeerSideFilter,
	peerBankFilter,
	setPeerBankFilter,
	peerSearch,
	setPeerSearch,
	partialAmountsByOffer,
	setPartialAmountsByOffer,
	address,
	joiningTradeId,
	onTakePeerOffer,
}: PeersTabProps) {
	return (
		<div className="rounded-xl border border-line bg-surface p-6 shadow-card space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					{(["all", "sell", "buy"] as const).map((side) => (
						<button
							key={side}
							onClick={() => setPeerSideFilter(side)}
							className={cn(
								"rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors",
								peerSideFilter === side
									? "bg-raised text-white"
									: "bg-subtle text-ink-2 hover:bg-accent-soft",
							)}
						>
							{side === "all"
								? "All"
								: side === "sell"
									? "Buy USDC"
									: "Sell USDC"}
						</button>
					))}

					<BankSearchSelect
						value={peerBankFilter}
						onChange={setPeerBankFilter}
						allowAll
						allLabel="All Banks"
						compact
					/>
				</div>

				<div className="relative w-full sm:w-64">
					<Search
						size={13}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
					/>
					<input
						type="text"
						value={peerSearch}
						onChange={(e) => setPeerSearch(e.target.value)}
						placeholder="Filter peer or bank..."
						className="w-full pl-8 pr-3 py-2 rounded-full border border-line text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{peerOffers.map((offer) => {
					const maxAvail = parseNumericUsdc(offer.availableUsdc);
					const customStr =
						partialAmountsByOffer[offer.tradeId] ?? offer.availableUsdc;
					const customNumeric = parseNumericUsdc(customStr);
					const isOwner =
						address &&
						offer.peerAddress.toLowerCase() === address.toLowerCase();

					return (
						<div
							key={offer.tradeId}
							className="p-5 rounded-xl border border-line bg-surface flex flex-col justify-between gap-3 text-xs shadow-card hover:border-accent/40 transition-colors"
						>
							<div className="flex items-start justify-between">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-semibold text-ink">
											{offer.peerHandle}
										</span>
										<span
											className={cn(
												"px-2 py-0.5 rounded-md text-[11px] font-semibold",
												offer.side === "sell"
													? "bg-green-50 text-green-700"
													: "bg-blue-50 text-blue-700",
											)}
										>
											{offer.side === "sell" ? "Selling USDC" : "Buying USDC"}
										</span>
										{offer.sellerBusy && (
											<span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
												Slot Busy · Queue #{(offer.queueDepth ?? 0) + 1}
											</span>
										)}
									</div>
									<div className="text-xs text-ink-3 mt-0.5">
										{offer.bankName} · {offer.completionRate} completion
									</div>
								</div>

								<div className="text-right">
									<div className="text-[11px] text-ink-3">Rate</div>
									<div className="font-mono font-semibold text-sm text-ink">
										₦{offer.rateNgn.toLocaleString("en-NG")}
									</div>
								</div>
							</div>

							<div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between text-xs">
								<div>
									<div className="text-[11px] text-ink-3">
										Available Liquidity
									</div>
									<div className="font-mono font-semibold text-ink">
										{offer.availableUsdc} USDC
									</div>
								</div>
							</div>

							{!isOwner && (
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-[11px] text-ink-3">
										<span>Order Amount (USDC)</span>
										<div className="flex items-center gap-1">
											{[0.25, 0.5, 1].map((pct) => (
												<button
													key={pct}
													type="button"
													onClick={() =>
														setPartialAmountsByOffer((prev) => ({
															...prev,
															[offer.tradeId]: (
																Math.round(maxAvail * pct * 100) / 100
															).toFixed(2),
														}))
													}
													className="px-2 py-0.5 rounded-md border border-line bg-surface text-ink-2 hover:border-accent font-mono text-[11px]"
												>
													{pct === 1 ? "MAX" : `${pct * 100}%`}
												</button>
											))}
										</div>
									</div>
									<div className="relative">
										<input
											type="text"
											value={customStr}
											onChange={(e) =>
												setPartialAmountsByOffer((prev) => ({
													...prev,
													[offer.tradeId]: e.target.value,
												}))
											}
											className="w-full px-3.5 py-2 rounded-md border border-line text-xs font-mono text-ink focus:outline-none focus:border-accent"
											placeholder={offer.availableUsdc}
										/>
										<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-3">
											≈ ₦
											{Math.round(
												customNumeric * offer.rateNgn,
											).toLocaleString("en-NG")}
										</span>
									</div>
								</div>
							)}

							<div className="flex items-center justify-between pt-1">
								<span className="text-xs font-mono text-ink-3">
									Offer #{offer.tradeId}
								</span>
								{isOwner ? (
									<span className="px-3 py-1 rounded-md text-xs font-semibold bg-subtle text-accent border border-line">
										Your Active Offer
									</span>
								) : (
									<button
										onClick={() => onTakePeerOffer(offer)}
										disabled={joiningTradeId === offer.tradeId}
										className="rounded-md px-5 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover transition-colors shadow-card disabled:opacity-60"
									>
										{joiningTradeId === offer.tradeId
											? "Allocating..."
											: offer.sellerBusy
												? "Join Seller Queue"
												: offer.side === "sell"
													? "Buy USDC"
													: "Take Offer"}
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
