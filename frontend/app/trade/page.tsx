"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
	RefreshCw,
	ArrowLeft,
	Search,
	ShieldCheck,
	Clock,
	Lock,
} from "lucide-react";
import TradingWidget from "@/components/trading/TradingWidget";
import {
	arcTestnet,
	USDC_ADDRESS,
	USDC_ABI,
	formatUsdc,
} from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
import type { PeerTradeOffer, UserTransaction } from "@/types";

export default function TradePage() {
	const { address, isConnected } = useAccount();

	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [transactions, setTransactions] = useState<UserTransaction[]>([]);
	const [selectedOffer, setSelectedOffer] = useState<PeerTradeOffer | null>(null);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [bankFilter, setBankFilter] = useState("all");

	const { data: nativeBalance, refetch: refetchNative } = useBalance({
		address,
		chainId: arcTestnet.id,
	});
	const { data: erc20BalanceRaw, refetch: refetchErc20 } = useReadContract(
		address
			? {
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "balanceOf",
					args: [address],
				}
			: undefined,
	);

	const walletUsdc = useMemo(() => {
		if (typeof erc20BalanceRaw === "bigint" && erc20BalanceRaw > 0n) {
			return parseFloat(formatUsdc(erc20BalanceRaw));
		}
		if (nativeBalance && typeof nativeBalance.value === "bigint") {
			const parsed = parseFloat(formatUnits(nativeBalance.value, nativeBalance.decimals));
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}, [erc20BalanceRaw, nativeBalance]);

	const fetchPortalData = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/user/dashboard", {
				cache: "no-store",
				headers: address ? { "x-wallet-address": address } : {},
			});
			if (!res.ok) return;
			const data = (await res.json()) as {
				peerOffers?: PeerTradeOffer[];
				transactions?: UserTransaction[];
			};
			const offers = data.peerOffers ?? [];
			setPeerOffers(offers);
			setTransactions(data.transactions ?? []);
		} catch {
			// Ignore transient network errors
		} finally {
			setLoading(false);
		}
	}, [address]);

	useEffect(() => {
		void fetchPortalData();
	}, [fetchPortalData]);

	const activeEscrows = useMemo(
		() => transactions.filter((t) => t.status === "escrow"),
		[transactions],
	);

	const filteredOffers = useMemo(() => {
		return peerOffers.filter((offer) => {
			if (bankFilter !== "all" && offer.bankName !== bankFilter) return false;
			if (search.trim()) {
				const q = search.toLowerCase();
				return (
					offer.peerHandle.toLowerCase().includes(q) ||
					offer.bankName.toLowerCase().includes(q) ||
					offer.tradeId.toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [bankFilter, peerOffers, search]);

	const uniqueBanks = useMemo(() => {
		const set = new Set<string>();
		for (const o of peerOffers) set.add(o.bankName);
		return Array.from(set);
	}, [peerOffers]);

	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
				{/* Top Header Strip */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#d1e8dc]">
					<div>
						<div className="flex items-center gap-2">
							<Link
								href="/dashboard"
								className="inline-flex items-center gap-1 text-xs font-medium text-[#3d6b55] hover:text-[#0d2b1e]"
							>
								<ArrowLeft size={13} />
								<span>Dashboard</span>
							</Link>
							<span className="text-[#d1e8dc]">/</span>
							<h1 className="text-base sm:text-lg font-semibold text-[#0d2b1e]">
								P2P Escrow Trading Desk
							</h1>
						</div>
						<p className="text-xs text-[#7aaa92] mt-0.5">
							Live peer-to-peer USDC/NGN exchange with automated escrow settlement
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<div className="px-3 py-1.5 rounded-lg border border-[#d1e8dc] bg-white text-xs">
							<span className="text-[#7aaa92] mr-2">Reference Rate:</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								1 USDC = ₦{RATE.toLocaleString("en-NG")}
							</span>
						</div>

						{isConnected && (
							<div className="px-3 py-1.5 rounded-lg border border-[#d1e8dc] bg-white text-xs">
								<span className="text-[#7aaa92] mr-2">Wallet:</span>
								<span className="font-mono font-semibold text-[#1a9e5c]">
									{walletUsdc.toFixed(2)} USDC
								</span>
							</div>
						)}

						<button
							type="button"
							onClick={() => {
								void fetchPortalData();
								void refetchNative();
								void refetchErc20();
							}}
							disabled={loading}
							className="p-2 rounded-lg border border-[#d1e8dc] bg-white text-[#3d6b55] hover:bg-[#f0f7f3] transition-colors"
							title="Refresh order book"
						>
							<RefreshCw size={13} className={loading ? "animate-spin text-[#1a9e5c]" : ""} />
						</button>
					</div>
				</div>

				{/* Main Responsive Grid: Order Book (Left 7 cols) + Execution Terminal (Right 5 cols) */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
					{/* Left Column: Live Order Book & User Active Escrows */}
					<div className="lg:col-span-7 space-y-5">
						{/* Live Peer Order Book Card */}
						<div className="rounded-lg border border-[#d1e8dc] bg-white overflow-hidden">
							<div className="p-4 border-b border-[#d1e8dc] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<div>
									<h2 className="text-xs font-semibold text-[#0d2b1e]">
										Open Peer Liquidity Offers ({filteredOffers.length})
									</h2>
									<p className="text-[11px] text-[#7aaa92]">
										Select an offer to load its immutable terms into the execution terminal
									</p>
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<select
										value={bankFilter}
										onChange={(e) => setBankFilter(e.target.value)}
										className="px-2.5 py-1.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] text-xs text-[#0d2b1e] focus:outline-none"
									>
										<option value="all">All Banks</option>
										{uniqueBanks.map((b) => (
											<option key={b} value={b}>
												{b}
											</option>
										))}
									</select>

									<div className="relative">
										<Search
											size={12}
											className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7aaa92]"
										/>
										<input
											type="text"
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											placeholder="Filter handle or ID..."
											className="pl-7 pr-3 py-1.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c] w-40 sm:w-44"
										/>
									</div>
								</div>
							</div>

							{filteredOffers.length === 0 ? (
								<div className="p-8 text-center text-xs text-[#7aaa92]">
									No open peer offers match your filter. Publish a new offer from your dashboard.
								</div>
							) : (
								<div className="divide-y divide-[#d1e8dc]/60">
									{filteredOffers.map((offer) => {
										const isSelected = selectedOffer?.tradeId === offer.tradeId;
										const isOwnOffer =
											Boolean(address) &&
											offer.peerAddress.toLowerCase() === address?.toLowerCase();

										return (
											<div
												key={offer.tradeId}
												className={cn(
													"p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors",
													isSelected ? "bg-[#f0f7f3]/70" : "hover:bg-[#fbfdfc]",
												)}
											>
												<div className="space-y-1 min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-semibold text-[#0d2b1e]">
															{offer.peerHandle}
														</span>
														<span className="font-mono text-[11px] text-[#7aaa92]">
															#{offer.tradeId}
														</span>
														<span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
															{offer.bankName}
														</span>
														<span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#fbfdfc] text-[#3d6b55] border border-[#d1e8dc]">
															0 USDC Buyer Bond
														</span>
														{offer.sellerBusy && (
															<span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
																Active Slot Busy · Queue: {offer.queueDepth ?? 0}
															</span>
														)}
													</div>
													<div className="text-[11px] text-[#7aaa92]">
														{offer.completionRate} completion · {offer.completedTrades} settled ·{" "}
														{offer.avgReleaseTime} avg release · Partial fills enabled
													</div>
												</div>

												<div className="flex flex-wrap items-center justify-between sm:justify-end gap-4">
													<div className="text-left sm:text-right">
														<div className="font-mono font-semibold text-[#0d2b1e]">
															{offer.availableUsdc} USDC
														</div>
														<div className="text-[11px] font-mono text-[#7aaa92]">
															{offer.ngnAmount} @ ₦{offer.rateNgn.toLocaleString("en-NG")}
														</div>
													</div>

													{isOwnOffer ? (
														<span className="px-2.5 py-1.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] text-[11px] font-medium text-[#7aaa92]">
															Your Published Offer
														</span>
													) : (
														<button
															type="button"
															onClick={() => setSelectedOffer(offer)}
															className={cn(
																"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
																isSelected
																	? "bg-[#1a9e5c] text-white"
																	: "border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3]",
															)}
														>
															{isSelected ? "Selected" : "Select Offer"}
														</button>
													)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* Active Escrow Trades for Connected Wallet */}
						{activeEscrows.length > 0 && (
							<div className="rounded-lg border border-[#d1e8dc] bg-white overflow-hidden">
								<div className="px-4 py-3 border-b border-[#d1e8dc] flex items-center justify-between">
									<h3 className="text-xs font-semibold text-[#0d2b1e]">
										Your Active Escrow Positions ({activeEscrows.length})
									</h3>
									<Link
										href="/dashboard"
										className="text-xs font-medium text-[#1a9e5c] hover:underline"
									>
										Manage in Dashboard
									</Link>
								</div>
								<div className="divide-y divide-[#d1e8dc]/60">
									{activeEscrows.map((tx) => (
										<div
											key={tx.id}
											className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
										>
											<div>
												<div className="flex items-center gap-2">
													<span className="font-mono font-semibold text-[#0d2b1e]">
														Trade #{tx.tradeId}
													</span>
													<span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200">
														{tx.lifecycleState ?? "AWAITING_PAYMENT"}
													</span>
													<span className="text-[#7aaa92]">· {tx.bankName}</span>
												</div>
												<div className="text-[11px] text-[#7aaa92] mt-0.5">
													{tx.usdcAmount} USDC · {tx.ngnAmount}
												</div>
											</div>

											<Link
												href={`/bank-checkout?tradeId=${encodeURIComponent(
													tx.tradeId,
												)}&bank=${encodeURIComponent(
													tx.bankName,
												)}&amountNgn=${encodeURIComponent(
													tx.ngnAmount.replace(/[^0-9]/g, ""),
												)}&amountUsdc=${encodeURIComponent(
													tx.usdcAmount,
												)}&returnTo=/trade`}
												className="px-3 py-1.5 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white text-xs font-medium text-center"
											>
												Open Settlement Portal
											</Link>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Concise Protocol Guarantees */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<div className="p-3.5 rounded-lg border border-[#d1e8dc] bg-white">
								<div className="flex items-center gap-2 text-xs font-semibold text-[#0d2b1e]">
									<Lock size={14} className="text-[#1a9e5c]" />
									<span>Seller-Funded Escrow</span>
								</div>
								<p className="text-[11px] text-[#7aaa92] mt-1 leading-relaxed">
									Sellers lock 100% of available USDC inventory on Arc before listing for instant buyer settlement.
								</p>
							</div>

							<div className="p-3.5 rounded-lg border border-[#d1e8dc] bg-white">
								<div className="flex items-center gap-2 text-xs font-semibold text-[#0d2b1e]">
									<Clock size={14} className="text-[#1a9e5c]" />
									<span>20-Minute Window</span>
								</div>
								<p className="text-[11px] text-[#7aaa92] mt-1 leading-relaxed">
									Every initiated trade has an immutable 20-minute payment deadline and automatic late-payment protection.
								</p>
							</div>

							<div className="p-3.5 rounded-lg border border-[#d1e8dc] bg-white">
								<div className="flex items-center gap-2 text-xs font-semibold text-[#0d2b1e]">
									<ShieldCheck size={14} className="text-[#1a9e5c]" />
									<span>Gated Release</span>
								</div>
								<p className="text-[11px] text-[#7aaa92] mt-1 leading-relaxed">
									Escrow release requires both verified buyer payment and confirmed seller fiat payout.
								</p>
							</div>
						</div>
					</div>

					{/* Right Column: Order Execution Terminal */}
					<div className="lg:col-span-5">
						<div className="rounded-lg border border-[#d1e8dc] bg-white p-4 sm:p-5">
							<TradingWidget
								selectedOffer={selectedOffer}
								onSelectOffer={(offer) => setSelectedOffer(offer)}
								onTradeUpdated={() => void fetchPortalData()}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
