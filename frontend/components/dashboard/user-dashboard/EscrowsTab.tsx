"use client";

import Link from "next/link";
import type { UserTransaction } from "@/types";

interface EscrowsTabProps {
	activeEscrows: UserTransaction[];
	releasingTradeId: string | null;
	verifyingTradeId: string | null;
	cancellingTradeId: string | null;
	onReleaseEscrow: (trade: UserTransaction) => void;
	onVerifyAndRelease: (trade: UserTransaction) => void;
	onCancelTrade: (tradeId: string) => void;
	onExplorePeers: () => void;
}

export function EscrowsTab({
	activeEscrows,
	releasingTradeId,
	verifyingTradeId,
	cancellingTradeId,
	onReleaseEscrow,
	onVerifyAndRelease,
	onCancelTrade,
	onExplorePeers,
}: EscrowsTabProps) {
	return (
		<div className="rounded-xl border border-line bg-surface p-6 shadow-card space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-semibold text-ink">
						Escrow Positions
					</h2>
					<p className="text-xs text-ink-3">
						Active trades secured inside Arc smart contract awaiting fiat
						confirmation
					</p>
				</div>
				<span className="text-xs font-mono font-semibold text-accent">
					{activeEscrows.length} Active Positions
				</span>
			</div>

			{activeEscrows.length === 0 ? (
				<div className="p-10 text-center rounded-xl bg-surface border border-line space-y-2">
					<p className="text-xs text-ink-3">
						No open escrow trades found.
					</p>
					<button
						onClick={onExplorePeers}
						className="rounded-md px-5 py-2 bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors"
					>
						Explore Peer Markets
					</button>
				</div>
			) : (
				<div className="space-y-3">
					{activeEscrows.map((trade) => (
						<div
							key={trade.id}
							className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
						>
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="font-mono font-semibold text-ink">
										Trade #{trade.tradeId}
									</span>
									<span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
										{trade.lifecycleState ?? "AWAITING_PAYMENT"}
									</span>
									<span className="text-ink-3">· {trade.bankName}</span>
								</div>
								<div className="text-xs text-ink-3">
									Counterparty: {trade.counterparty}
								</div>
								<div className="font-mono font-semibold text-ink">
									{trade.usdcAmount} USDC · {trade.ngnAmount}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Link
									href={`/bank-checkout?tradeId=${encodeURIComponent(
										trade.tradeId,
									)}&bank=${encodeURIComponent(
										trade.bankName,
									)}&amountNgn=${encodeURIComponent(
										trade.ngnAmount.replace(/[^0-9]/g, ""),
									)}&amountUsdc=${encodeURIComponent(
										trade.usdcAmount,
									)}&accountNo=${encodeURIComponent(
										trade.sellerAccountNumber || "",
									)}&returnTo=/dashboard`}
									className="rounded-md px-4 py-2 text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-card"
								>
									{trade.role === "buyer"
										? "Proceed to Payment"
										: "Settlement Portal"}
								</Link>

								{trade.role === "seller" &&
								(trade.paymentState === "CONFIRMED" ||
									trade.lifecycleState === "PAYMENT_CONFIRMED" ||
									trade.lifecycleState === "SELLER_PAYOUT_CONFIRMED") ? (
									<button
										onClick={() => onReleaseEscrow(trade)}
										disabled={releasingTradeId === trade.tradeId}
										className="rounded-md px-4 py-2 text-xs font-semibold text-white bg-raised hover:bg-accent transition-colors disabled:opacity-60"
									>
										{releasingTradeId === trade.tradeId
											? "Releasing..."
											: "Release USDC"}
									</button>
								) : (
									<button
										onClick={() => onVerifyAndRelease(trade)}
										disabled={verifyingTradeId === trade.tradeId}
										className="rounded-md px-4 py-2 text-xs font-semibold text-ink border border-line hover:bg-subtle transition-colors disabled:opacity-60"
									>
										{verifyingTradeId === trade.tradeId
											? "Checking payment…"
											: "Check payment"}
									</button>
								)}

								{(trade.lifecycleState === "AWAITING_PAYMENT" ||
									trade.lifecycleState === "OPEN" ||
									trade.status === "escrow") && (
									<button
										onClick={() => onCancelTrade(trade.tradeId)}
										disabled={cancellingTradeId === trade.tradeId}
										className="rounded-md px-3.5 py-2 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-60"
									>
										{cancellingTradeId === trade.tradeId
											? "Cancelling..."
											: "Cancel"}
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
