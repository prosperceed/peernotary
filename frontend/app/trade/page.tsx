"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
	RefreshCw,
	ArrowLeft,
	Search,
} from "lucide-react";
import TradingWidget from "@/components/trading/TradingWidget";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import { BankSearchSelect } from "@/components/shared";
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
	const { rate: liveRate } = useMonierateRate();

	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [transactions, setTransactions] = useState<UserTransaction[]>([]);
	const [selectedOffer, setSelectedOffer] = useState<PeerTradeOffer | null>(
		null,
	);
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
			const parsed = parseFloat(
				formatUnits(nativeBalance.value, nativeBalance.decimals),
			);
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
			if (bankFilter !== "all") {
				const bf = bankFilter.toLowerCase();
				const ob = offer.bankName.toLowerCase();
				if (ob !== bf && !ob.includes(bf) && !bf.includes(ob)) return false;
			}
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

	return (
		<div className="min-h-screen bg-subtle py-6 sm:py-10 px-3 sm:px-6">
			<div className="max-w-[1380px] w-full mx-auto space-y-6">
				{/* Top Header Strip */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
					<div>
						<div className="flex items-center gap-2">
							<Link
								href="/dashboard"
								className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"
							>
								<ArrowLeft size={13} />
								<span>Dashboard</span>
							</Link>
							<span className="text-line">/</span>
							<h1 className="text-base sm:text-lg font-semibold text-ink">
								Trading desk
							</h1>
						</div>
						<p className="text-xs text-ink-3 mt-0.5">
							Buy USDC from sellers whose funds are already locked on Arc.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<div className="px-3 py-1.5 rounded-lg border border-line bg-surface text-xs">
							<span className="text-ink-3 mr-2">Market rate</span>
							<span className="font-mono font-semibold text-ink">
								₦{(liveRate || RATE).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
							</span>
						</div>

						{isConnected && (
							<div className="px-3 py-1.5 rounded-lg border border-line bg-surface text-xs">
								<span className="text-ink-3 mr-2">Wallet:</span>
								<span className="font-mono font-semibold text-accent">
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
							className="p-2 rounded-lg border border-line bg-surface text-ink-2 hover:bg-subtle transition-colors"
							title="Refresh order book"
						>
							<RefreshCw
								size={13}
								className={loading ? "animate-spin text-accent" : ""}
							/>
						</button>
					</div>
				</div>

				{/* Main Responsive Grid: Order Book (Left 7 cols) + Execution Terminal (Right 5 cols) */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
					{/* Left Column: Live Order Book & User Active Escrows */}
					<div className="lg:col-span-7 space-y-5">
						{/* Live Peer Order Book Card */}
						<div className="rounded-lg border border-[#d6e2dc] bg-surface p-4 sm:p-5 shadow-card space-y-4">
							<div className="border-b border-subtle pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<div>
									<h2 className="text-sm font-semibold text-ink">
										Sell offers ({filteredOffers.length})
									</h2>
									<p className="text-xs text-ink-3">
										Every offer here is backed by USDC already locked on Arc.
									</p>
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<BankSearchSelect
										value={bankFilter}
										onChange={setBankFilter}
										allowAll
										allLabel="All Banks"
										compact
									/>

									<div className="relative">
										<Search
											size={12}
											className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
										/>
										<input
											type="text"
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											placeholder="Filter handle or ID..."
											className="pl-7 pr-3 py-1.5 rounded-lg border border-line bg-surface text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent w-36 sm:w-44"
										/>
									</div>
								</div>
							</div>

							{filteredOffers.length === 0 ? (
								<div className="p-8 text-center text-xs text-ink-3">
									No open peer offers match your filter. Publish a new offer
									from your dashboard.
								</div>
							) : (
								<div className="divide-y divide-line/60">
									{filteredOffers.map((offer) => {
										const isSelected = selectedOffer?.tradeId === offer.tradeId;
										const isOwnOffer =
											Boolean(address) &&
											offer.peerAddress.toLowerCase() ===
												address?.toLowerCase();

										return (
											<div
												key={offer.tradeId}
												className={cn(
													"p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors",
													isSelected ? "bg-subtle/70" : "hover:bg-surface",
												)}
											>
												<div className="space-y-1 min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-semibold text-ink">
															{offer.peerHandle}
														</span>
														<span className="font-mono text-xs text-ink-3">
															#{offer.tradeId}
														</span>
														<span className="px-2 py-0.5 rounded text-[11px] font-medium bg-subtle text-accent border border-line">
															{offer.bankName}
														</span>
														{offer.sellerBusy && (
															<span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
																Active Slot Busy · Queue:{" "}
																{offer.queueDepth ?? 0}
															</span>
														)}
													</div>
													<div className="text-xs text-ink-3">
														{offer.completionRate} completion ·{" "}
														{offer.completedTrades} settled ·{" "}
														{offer.avgReleaseTime} avg release · Partial fills
														enabled
													</div>
												</div>

												<div className="flex flex-wrap items-center justify-between sm:justify-end gap-4">
													<div className="text-left sm:text-right">
														<div className="font-mono font-semibold text-ink">
															{offer.availableUsdc} USDC
														</div>
														<div className="text-xs font-mono text-ink-3">
															{offer.ngnAmount} @ ₦
															{offer.rateNgn.toLocaleString("en-NG")}
														</div>
													</div>

													{isOwnOffer ? (
														<span className="px-2.5 py-1.5 rounded-lg border border-line bg-surface text-xs font-medium text-ink-3">
															Your Published Offer
														</span>
													) : (
														<div className="flex items-center gap-2">
															<button
																type="button"
																onClick={() => setSelectedOffer(offer)}
																className={cn(
																	"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
																	isSelected
																		? "bg-accent text-white"
																		: "border border-accent text-accent hover:bg-subtle",
																)}
															>
																{isSelected ? "Selected" : "Customize"}
															</button>
															<Link
																href={`/bank-checkout?tradeId=${encodeURIComponent(
																	offer.tradeId,
																)}&bank=${encodeURIComponent(
																	offer.bankName,
																)}&amountNgn=${encodeURIComponent(
																	offer.ngnAmount.replace(/[^0-9]/g, ""),
																)}&amountUsdc=${encodeURIComponent(
																	offer.availableUsdc,
																)}&returnTo=/trade`}
																className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-colors shadow-card"
															>
																Buy Now
															</Link>
														</div>
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
							<div className="rounded-lg border border-line bg-surface overflow-hidden">
								<div className="px-4 py-3 border-b border-line flex items-center justify-between">
									<h3 className="text-xs font-semibold text-ink">
										Your Active Escrow Positions ({activeEscrows.length})
									</h3>
									<Link
										href="/dashboard"
										className="text-xs font-medium text-accent hover:underline"
									>
										Manage in Dashboard
									</Link>
								</div>
								<div className="divide-y divide-line/60">
									{activeEscrows.map((tx) => (
										<div
											key={tx.id}
											className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
										>
											<div>
												<div className="flex items-center gap-2">
													<span className="font-mono font-semibold text-ink">
														Trade #{tx.tradeId}
													</span>
													<span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-50 text-amber-700 border border-amber-200">
														{tx.lifecycleState ?? "AWAITING_PAYMENT"}
													</span>
													<span className="text-ink-3">
														· {tx.bankName}
													</span>
												</div>
												<div className="text-xs text-ink-3 mt-0.5">
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
												className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium text-center"
											>
												Open Settlement Portal
											</Link>
										</div>
									))}
								</div>
							</div>
						)}

					</div>

					{/* Right Column: Order Execution Terminal */}
					<div className="lg:col-span-5">
						<div>
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
