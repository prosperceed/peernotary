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
		<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					{(["all", "sell", "buy"] as const).map((side) => (
						<button
							key={side}
							onClick={() => setPeerSideFilter(side)}
							className={cn(
								"rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
								peerSideFilter === side
									? "bg-[#0d2b1e] text-white"
									: "bg-[#f0f7f3] text-[#3d6b55] hover:bg-[#e4f2eb]",
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
						className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7aaa92]"
					/>
					<input
						type="text"
						value={peerSearch}
						onChange={(e) => setPeerSearch(e.target.value)}
						placeholder="Filter peer or bank..."
						className="w-full pl-8 pr-3 py-2 rounded-full border border-[#d1e8dc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c]"
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
							className="p-5 rounded-[24px] border border-[#e5ebe7] bg-[#fbfdfc] flex flex-col justify-between gap-3 text-xs shadow-sm hover:border-[#1a9e5c]/40 transition-all"
						>
							<div className="flex items-start justify-between">
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-bold text-[#0d2b1e]">
											{offer.peerHandle}
										</span>
										<span
											className={cn(
												"px-2 py-0.5 rounded-full text-[10px] font-bold",
												offer.side === "sell"
													? "bg-green-50 text-green-700"
													: "bg-blue-50 text-blue-700",
											)}
										>
											{offer.side === "sell" ? "Selling USDC" : "Buying USDC"}
										</span>
										{offer.sellerBusy && (
											<span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
												Slot Busy · Queue #{(offer.queueDepth ?? 0) + 1}
											</span>
										)}
									</div>
									<div className="text-[11px] text-[#7aaa92] mt-0.5">
										{offer.bankName} · {offer.completionRate} completion
									</div>
								</div>

								<div className="text-right">
									<div className="text-[10px] text-[#7aaa92]">Rate</div>
									<div className="font-mono font-bold text-sm text-[#0d2b1e]">
										₦{offer.rateNgn.toLocaleString("en-NG")}
									</div>
								</div>
							</div>

							<div className="p-3 rounded-2xl bg-white border border-[#e5ebe7] flex items-center justify-between text-xs">
								<div>
									<div className="text-[10px] text-[#7aaa92]">
										Available Liquidity
									</div>
									<div className="font-mono font-bold text-[#0d2b1e]">
										{offer.availableUsdc} USDC
									</div>
								</div>
							</div>

							{!isOwner && (
								<div className="space-y-1.5">
									<div className="flex items-center justify-between text-[10px] text-[#7aaa92]">
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
													className="px-2 py-0.5 rounded-full border border-[#d1e8dc] bg-white text-[#3d6b55] hover:border-[#1a9e5c] font-mono text-[10px]"
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
											className="w-full px-3.5 py-2 rounded-full border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
											placeholder={offer.availableUsdc}
										/>
										<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#7aaa92]">
											≈ ₦
											{Math.round(
												customNumeric * offer.rateNgn,
											).toLocaleString("en-NG")}
										</span>
									</div>
								</div>
							)}

							<div className="flex items-center justify-between pt-1">
								<span className="text-[11px] font-mono text-[#7aaa92]">
									Offer #{offer.tradeId}
								</span>
								{isOwner ? (
									<span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
										Your Active Offer
									</span>
								) : (
									<button
										onClick={() => onTakePeerOffer(offer)}
										disabled={joiningTradeId === offer.tradeId}
										className="rounded-full px-5 py-2 text-xs font-semibold text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-sm disabled:opacity-60"
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
