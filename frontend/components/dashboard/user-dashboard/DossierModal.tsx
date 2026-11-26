"use client";

import type { UserTrustSummary } from "@/types";

interface DossierModalProps {
	trustSummary: UserTrustSummary | null;
	onClose: () => void;
}

export function DossierModal({ trustSummary, onClose }: DossierModalProps) {
	return (
		<div className="p-5 rounded-xl bg-subtle border border-line shadow-card space-y-3 animate-in fade-in duration-200">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-xs text-ink">
						Merchant Status
					</span>
					<span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-accent text-white">
						{trustSummary?.trustTier ?? "LEVEL 1"}
					</span>
				</div>
				<button
					onClick={onClose}
					className="text-xs text-ink-3 hover:text-ink"
				>
					Close
				</button>
			</div>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
				<div className="p-3 rounded-xl bg-surface border border-line">
					<div className="text-[11px] text-ink-3">Trust Score</div>
					<div className="font-semibold text-ink mt-0.5 font-mono">
						{trustSummary?.trustScore ?? 50}/100
					</div>
				</div>
				<div className="p-3 rounded-xl bg-surface border border-line">
					<div className="text-[11px] text-ink-3">Trade Limit</div>
					<div className="font-semibold text-ink mt-0.5 font-mono">
						{trustSummary?.maxTradeUsdc ?? "150.00"} USDC
					</div>
				</div>
				<div className="p-3 rounded-xl bg-surface border border-line">
					<div className="text-[11px] text-ink-3">Unpaid Slots</div>
					<div className="font-semibold text-ink mt-0.5 font-mono">
						{trustSummary?.activeUnpaidCount ?? 0}/
						{trustSummary?.maxConcurrentUnpaidTrades ?? 1}
					</div>
				</div>
				<div className="p-3 rounded-xl bg-surface border border-line">
					<div className="text-[11px] text-ink-3">Arc Network</div>
					<div className="font-semibold text-accent mt-0.5 font-mono">
						Chain 5042002
					</div>
				</div>
			</div>
		</div>
	);
}
