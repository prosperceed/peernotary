"use client";

import type { UserTrustSummary } from "@/types";

interface DossierModalProps {
	trustSummary: UserTrustSummary | null;
	onClose: () => void;
}

export function DossierModal({ trustSummary, onClose }: DossierModalProps) {
	return (
		<div className="p-5 rounded-[26px] bg-[#f0f7f3] border border-[#d1e8dc] shadow-sm space-y-3 animate-in fade-in duration-200">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-xs text-[#0d2b1e]">
						Merchant Status
					</span>
					<span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#1a9e5c] text-white">
						{trustSummary?.trustTier ?? "LEVEL 1"}
					</span>
				</div>
				<button
					onClick={onClose}
					className="text-xs text-[#7aaa92] hover:text-[#0d2b1e]"
				>
					Close
				</button>
			</div>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
				<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
					<div className="text-[10px] text-[#7aaa92]">Trust Score</div>
					<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
						{trustSummary?.trustScore ?? 50}/100
					</div>
				</div>
				<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
					<div className="text-[10px] text-[#7aaa92]">Trade Limit</div>
					<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
						{trustSummary?.maxTradeUsdc ?? "150.00"} USDC
					</div>
				</div>
				<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
					<div className="text-[10px] text-[#7aaa92]">Unpaid Slots</div>
					<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
						{trustSummary?.activeUnpaidCount ?? 0}/
						{trustSummary?.maxConcurrentUnpaidTrades ?? 1}
					</div>
				</div>
				<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
					<div className="text-[10px] text-[#7aaa92]">Arc Network</div>
					<div className="font-bold text-[#1a9e5c] mt-0.5 font-mono">
						Chain 5042002
					</div>
				</div>
			</div>
		</div>
	);
}
