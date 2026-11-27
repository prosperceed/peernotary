"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
	ArrowDownLeft,
	ArrowRight,
	ArrowUpRight,
	BadgeCheck,
	Inbox,
	Landmark,
	Plus,
	ShieldCheck,
	Star,
	Wallet,
} from "lucide-react";
import { cn, RATE } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import type { PeerTradeOffer, UserTransaction, UserTrustSummary } from "@/types";

interface OverviewTabProps {
	transactions: UserTransaction[];
	peerOffers: PeerTradeOffer[];
	address?: string;
	username: string | null;
	trustSummary?: UserTrustSummary | null;
	walletUsdc: number;
	releasingTradeId: string | null;
	onReleaseEscrow: (tx: UserTransaction) => void;
	onViewAllTransactions: () => void;
	onViewEscrows: () => void;
	onPostOffer: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const num = (v?: string) => parseFloat((v ?? "0").replace(/,/g, "")) || 0;
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function checkoutHref(tx: UserTransaction) {
	const q = new URLSearchParams({
		tradeId: tx.tradeId,
		bank: tx.bankName,
		amountNgn: tx.ngnAmount.replace(/[^0-9]/g, ""),
		amountUsdc: tx.usdcAmount,
		accountNo: tx.sellerAccountNumber || "",
		returnTo: "/dashboard",
	});
	return `/bank-checkout?${q.toString()}`;
}

function statusChip(tx: UserTransaction): { label: string; tone: string } {
	if (tx.lifecycleState === "AWAITING_PAYMENT") return { label: "Awaiting payment", tone: "bg-amber-50 text-amber-700" };
	if (tx.lifecycleState === "CANCELLED") return { label: "Cancelled", tone: "bg-subtle text-ink-3" };
	switch (tx.status) {
		case "completed":
			return { label: "Settled", tone: "bg-mint-soft text-mint" };
		case "escrow":
			return { label: "In escrow", tone: "bg-accent/15 text-accent-ink" };
		case "disputed":
			return { label: "Disputed", tone: "bg-red-50 text-red-600" };
		default:
			return { label: "Pending", tone: "bg-amber-50 text-amber-700" };
	}
}

function Panel({
	title,
	action,
	children,
	className,
	delay = 0,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	delay?: number;
}) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, delay, ease: EASE }}
			className={cn("card p-5", className)}
		>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-[15px] font-semibold text-ink">{title}</h2>
				{action}
			</div>
			{children}
		</motion.section>
	);
}

function CornerLink({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<button
			onClick={onClick}
			className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
		>
			{label}
			<ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
		</button>
	);
}

function EmptyState({ icon, text, cta }: { icon: React.ReactNode; text: string; cta?: React.ReactNode }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong/70 px-6 py-10 text-center">
			<span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink-3">{icon}</span>
			<p className="mt-3 max-w-xs text-sm text-ink-3">{text}</p>
			{cta && <div className="mt-4">{cta}</div>}
		</div>
	);
}

/** Completion ring: draws itself in on mount. */
function Ring({ pct }: { pct: number }) {
	const r = 34;
	return (
		<svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
			<circle cx="40" cy="40" r={r} fill="none" stroke="rgb(47 64 150 / 0.1)" strokeWidth="7" />
			<motion.circle
				cx="40"
				cy="40"
				r={r}
				fill="none"
				stroke="url(#ring-grad)"
				strokeWidth="7"
				strokeLinecap="round"
				initial={{ pathLength: 0 }}
				animate={{ pathLength: Math.max(0, Math.min(1, pct / 100)) }}
				transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
			/>
			<defs>
				<linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#6b7cc9" />
					<stop offset="1" stopColor="#1f2a6b" />
				</linearGradient>
			</defs>
		</svg>
	);
}

export function OverviewTab({
	transactions,
	peerOffers,
	address,
	username,
	trustSummary,
	walletUsdc,
	releasingTradeId,
	onReleaseEscrow,
	onViewAllTransactions,
	onViewEscrows,
	onPostOffer,
}: OverviewTabProps) {
	const { rate, rateData } = useMonierateRate();
	const liveRate = rate || RATE;
	const competitors = (rateData?.competitors ?? []).slice(0, 3);

	const userOffers = peerOffers.filter((o) => o.peerAddress.toLowerCase() === address?.toLowerCase());
	const inOffersUsdc = userOffers.filter((o) => o.side === "sell").reduce((acc, o) => acc + num(o.availableUsdc), 0);
	const fundsTotal = walletUsdc + inOffersUsdc;

	const perf = useMemo(() => {
		const completed = transactions.filter((t) => t.status === "completed" || t.lifecycleState === "COMPLETED");
		const disputed = transactions.filter((t) => t.status === "disputed" || t.lifecycleState === "DISPUTED");
		const finished = transactions.filter(
			(t) =>
				t.status === "completed" ||
				t.status === "disputed" ||
				t.lifecycleState === "CANCELLED" ||
				t.lifecycleState === "COMPLETED" ||
				t.lifecycleState === "DISPUTED",
		);
		const completedCount = Math.max(completed.length, trustSummary?.completedTradeCount ?? 0);
		const finishedCount = Math.max(
			finished.length,
			(trustSummary?.completedTradeCount ?? 0) + (trustSummary?.unexplainedExpiryCount ?? 0),
		);
		const completion = finishedCount > 0 ? (completedCount / finishedCount) * 100 : 0;
		const posDen = completedCount + disputed.length;
		const positive = posDen > 0 ? (completedCount / posDen) * 100 : 0;
		return {
			completion,
			positive,
			completedCount,
			finishedCount,
			tier: trustSummary?.trustTier ?? "NEW",
			maxTrade: trustSummary?.maxTradeUsdc,
		};
	}, [transactions, trustSummary]);

	return (
		<div className="space-y-5">
			<div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
				{/* Recent orders */}
				<Panel
					title="Recent orders"
					className="lg:col-span-8"
					action={<CornerLink onClick={onViewAllTransactions} label="All orders" />}
				>
					{transactions.length === 0 ? (
						<EmptyState
							icon={<Inbox size={18} />}
							text="No orders yet. Buy from a funded offer, or lock USDC and post your own."
							cta={
								<button onClick={onPostOffer} className="btn-secondary h-9 px-4 text-xs">
									<Plus size={14} />
									Post an offer
								</button>
							}
						/>
					) : (
						<ul className="space-y-2">
							{transactions.slice(0, 5).map((tx, i) => {
								const chip = statusChip(tx);
								const isBuy = tx.role === "buyer";
								const canPay = isBuy && tx.lifecycleState === "AWAITING_PAYMENT";
								const canRelease =
									tx.role === "seller" &&
									(tx.paymentState === "CONFIRMED" ||
										tx.lifecycleState === "PAYMENT_CONFIRMED" ||
										tx.lifecycleState === "SELLER_PAYOUT_CONFIRMED");
								return (
									<motion.li
										key={tx.id}
										initial={{ opacity: 0, x: -10 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ duration: 0.45, delay: 0.15 + i * 0.05, ease: EASE }}
										className="group flex flex-col gap-3 rounded-xl border border-line bg-subtle/60 px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-subtle sm:flex-row sm:items-center"
									>
										<div className="flex min-w-0 flex-1 items-center gap-3">
											<span
												className={cn(
													"flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
													isBuy ? "bg-mint-soft text-mint" : "bg-accent/15 text-accent-ink",
												)}
											>
												{isBuy ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
											</span>
											<div className="min-w-0">
												<div className="flex items-center gap-2 text-sm text-ink">
													{isBuy ? "Bought" : "Sold"} USDC
													<span className="font-mono text-xs text-ink-4">#{tx.tradeId}</span>
												</div>
												<div className="truncate text-xs text-ink-3">
													{tx.counterparty} · {tx.bankName}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-4 sm:justify-end">
											<div className="text-right">
												<div className="font-mono text-sm text-ink">{tx.ngnAmount}</div>
												<div className="font-mono text-xs text-ink-3">{tx.usdcAmount} USDC</div>
											</div>
											<span className={cn("w-[118px] rounded-full px-2.5 py-1 text-center text-[11px] font-medium", chip.tone)}>
												{chip.label}
											</span>
											{canPay ? (
												<Link href={checkoutHref(tx)} className="btn-primary h-8 px-3.5 text-xs">
													Pay
												</Link>
											) : canRelease ? (
												<button
													onClick={() => onReleaseEscrow(tx)}
													disabled={releasingTradeId === tx.tradeId}
													className="btn-primary h-8 px-3.5 text-xs"
												>
													{releasingTradeId === tx.tradeId ? "Releasing…" : "Release"}
												</button>
											) : (
												<Link href={checkoutHref(tx)} className="btn-ghost h-8 px-3 text-xs">
													View
												</Link>
											)}
										</div>
									</motion.li>
								);
							})}
						</ul>
					)}
				</Panel>

				<div className="space-y-5 lg:col-span-4">
					{/* Trust profile */}
					<Panel
						title="Trust profile"
						delay={0.08}
						action={
							<span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent-ink">
								<BadgeCheck size={12} />
								{perf.tier}
							</span>
						}
					>
						<div className="flex items-center gap-5">
							<div className="relative">
								<Ring pct={perf.completion} />
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<span className="font-display text-lg font-semibold text-ink">{perf.completion.toFixed(0)}%</span>
									<span className="text-[10px] uppercase tracking-wider text-ink-4">complete</span>
								</div>
							</div>
							<dl className="space-y-2.5 text-xs">
								<div className="flex items-center gap-2 text-ink-2">
									<ShieldCheck size={14} className="text-mint" />
									@{username || "trader"}
								</div>
								<div className="flex items-center gap-2 text-ink-3">
									<Star size={14} className="text-amber-400" />
									<span className="font-mono text-ink">{perf.positive.toFixed(0)}%</span> positive
								</div>
								<div className="text-ink-3">
									<span className="font-mono text-ink">{perf.completedCount}</span> of{" "}
									<span className="font-mono text-ink">{perf.finishedCount}</span> trades settled
								</div>
								{perf.maxTrade && (
									<div className="text-ink-3">
										Limit <span className="font-mono text-ink">{perf.maxTrade} USDC</span>
									</div>
								)}
							</dl>
						</div>
					</Panel>

					{/* Market */}
					<Panel title="Market rate" delay={0.14}>
						<div className="flex items-baseline gap-2">
							<span className="font-display text-2xl font-semibold text-ink">
								₦{liveRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
							</span>
							<span className="text-xs text-ink-3">/ USDC</span>
						</div>
						{competitors.length > 0 ? (
							<ul className="mt-4 space-y-2 border-t border-line pt-3">
								{competitors.map((c) => (
									<li key={c.name} className="flex items-center justify-between text-xs">
										<span className="text-ink-3">{c.name}</span>
										<span className="font-mono text-ink-2">{c.formattedDiff}</span>
									</li>
								))}
							</ul>
						) : (
							<p className="mt-3 text-xs text-ink-3">Offers are priced against this live rate.</p>
						)}
					</Panel>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
				{/* Your offers */}
				<Panel
					title="Your offers"
					className="lg:col-span-7"
					delay={0.2}
					action={
						<button onClick={onPostOffer} className="btn-secondary h-8 px-3 text-xs">
							<Plus size={13} />
							New offer
						</button>
					}
				>
					{userOffers.length === 0 ? (
						<EmptyState
							icon={<Landmark size={18} />}
							text="You have no live offers. Lock USDC in escrow to list it for buyers."
						/>
					) : (
						<ul className="grid gap-3 sm:grid-cols-2">
							{userOffers.slice(0, 4).map((o) => {
								const total = num(o.totalDepositedUsdc) || num(o.availableUsdc);
								const avail = num(o.availableUsdc);
								const pct = total > 0 ? (avail / total) * 100 : 0;
								return (
									<li key={o.tradeId} className="rounded-xl border border-line bg-subtle/60 p-3.5">
										<div className="flex items-center justify-between">
											<span
												className={cn(
													"rounded-full px-2 py-0.5 text-[11px] font-medium",
													o.side === "sell" ? "bg-accent/15 text-accent-ink" : "bg-mint-soft text-mint",
												)}
											>
												{o.side === "sell" ? "Selling" : "Buying"} · #{o.tradeId}
											</span>
											<span className="text-[11px] text-ink-3">{o.bankName}</span>
										</div>
										<div className="mt-3 font-mono text-base text-ink">
											₦{o.rateNgn.toLocaleString("en-NG")}
											<span className="ml-1 text-xs text-ink-3">/ USDC</span>
										</div>
										<div className="mt-3 h-1 overflow-hidden rounded-full bg-subtle">
											<motion.div
												className="h-full rounded-full bg-accent"
												initial={{ width: 0 }}
												animate={{ width: `${pct}%` }}
												transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
											/>
										</div>
										<div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
											<span>{usd(avail)} available</span>
											<span>of {usd(total)}</span>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</Panel>

				{/* Where the USDC is */}
				<Panel
					title="Where your USDC is"
					className="lg:col-span-5"
					delay={0.26}
					action={<CornerLink onClick={onViewEscrows} label="Escrows" />}
				>
					<div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-subtle">
						{fundsTotal > 0 && (
							<>
								<motion.div
									className="h-full rounded-full bg-mint"
									initial={{ width: 0 }}
									animate={{ width: `${(walletUsdc / fundsTotal) * 100}%` }}
									transition={{ duration: 1, delay: 0.4, ease: EASE }}
								/>
								<motion.div
									className="h-full rounded-full bg-accent"
									initial={{ width: 0 }}
									animate={{ width: `${(inOffersUsdc / fundsTotal) * 100}%` }}
									transition={{ duration: 1, delay: 0.5, ease: EASE }}
								/>
							</>
						)}
					</div>
					<dl className="mt-4 space-y-3">
						<div className="flex items-center justify-between text-sm">
							<dt className="flex items-center gap-2.5 text-ink-2">
								<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint-soft text-mint">
									<Wallet size={14} />
								</span>
								In your wallet
							</dt>
							<dd className="font-mono text-ink">{usd(walletUsdc)}</dd>
						</div>
						<div className="flex items-center justify-between text-sm">
							<dt className="flex items-center gap-2.5 text-ink-2">
								<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-ink">
									<Landmark size={14} />
								</span>
								Listed in escrow
							</dt>
							<dd className="font-mono text-ink">{usd(inOffersUsdc)}</dd>
						</div>
					</dl>
				</Panel>
			</div>
		</div>
	);
}
