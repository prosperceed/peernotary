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
		<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-bold text-[#0d2b1e]">
						Escrow Positions
					</h2>
					<p className="text-xs text-[#7aaa92]">
						Active trades secured inside Arc smart contract awaiting fiat
						confirmation
					</p>
				</div>
				<span className="text-xs font-mono font-semibold text-[#1a9e5c]">
					{activeEscrows.length} Active Positions
				</span>
			</div>

			{activeEscrows.length === 0 ? (
				<div className="p-10 text-center rounded-[24px] bg-[#fbfdfc] border border-[#e5ebe7] space-y-2">
					<p className="text-xs text-[#7aaa92]">
						No open escrow trades found.
					</p>
					<button
						onClick={onExplorePeers}
						className="rounded-full px-5 py-2 bg-[#1a9e5c] text-white text-xs font-semibold hover:bg-[#15854c] transition-all"
					>
						Explore Peer Markets
					</button>
				</div>
			) : (
				<div className="space-y-3">
					{activeEscrows.map((trade) => (
						<div
							key={trade.id}
							className="p-4 rounded-2xl border border-[#d1e8dc] bg-[#fbfdfc] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
						>
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="font-mono font-bold text-[#0d2b1e]">
										Trade #{trade.tradeId}
									</span>
									<span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
										{trade.lifecycleState ?? "AWAITING_PAYMENT"}
									</span>
									<span className="text-[#7aaa92]">· {trade.bankName}</span>
								</div>
								<div className="text-[11px] text-[#7aaa92]">
									Counterparty: {trade.counterparty}
								</div>
								<div className="font-mono font-semibold text-[#0d2b1e]">
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
									className="rounded-full px-4 py-2 text-xs font-semibold bg-[#1a9e5c] text-white hover:bg-[#15854c] transition-all shadow-sm"
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
										className="rounded-full px-4 py-2 text-xs font-semibold text-white bg-[#0d2b1e] hover:bg-[#1a9e5c] transition-all disabled:opacity-60"
									>
										{releasingTradeId === trade.tradeId
											? "Releasing..."
											: "Release USDC"}
									</button>
								) : (
									<button
										onClick={() => onVerifyAndRelease(trade)}
										disabled={verifyingTradeId === trade.tradeId}
										className="rounded-full px-4 py-2 text-xs font-semibold text-[#0d2b1e] border border-[#d1e8dc] hover:bg-[#f0f7f3] transition-all disabled:opacity-60"
									>
										{verifyingTradeId === trade.tradeId
											? "Verifying Proof..."
											: "Verify & Release"}
									</button>
								)}

								{(trade.lifecycleState === "AWAITING_PAYMENT" ||
									trade.lifecycleState === "OPEN" ||
									trade.status === "escrow") && (
									<button
										onClick={() => onCancelTrade(trade.tradeId)}
										disabled={cancellingTradeId === trade.tradeId}
										className="rounded-full px-3.5 py-2 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-all disabled:opacity-60"
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
