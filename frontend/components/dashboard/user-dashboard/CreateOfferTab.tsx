"use client";

import { BankSearchSelect } from "@/components/shared";
import { RATE } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";

function parseNumericUsdc(val: string): number {
	return parseFloat(val.replace(/,/g, "")) || 0;
}

interface CreateOfferTabProps {
	offerUsdc: string;
	setOfferUsdc: (val: string) => void;
	offerBank: string;
	setOfferBank: (val: string) => void;
	offerAccountNo: string;
	setOfferAccountNo: (val: string) => void;
	creatingOffer: boolean;
	onSubmit: (e: React.FormEvent) => void;
}

export function CreateOfferTab({
	offerUsdc,
	setOfferUsdc,
	offerBank,
	setOfferBank,
	offerAccountNo,
	setOfferAccountNo,
	creatingOffer,
	onSubmit,
}: CreateOfferTabProps) {
	const { rate } = useMonierateRate();
	const activeRate = rate || RATE;
	return (
		<div className="max-w-md mx-auto rounded-[32px] border border-[#e5ebe7] bg-white p-7 space-y-5 shadow-xl">
			<div>
				<h2 className="text-base font-bold text-[#0d2b1e]">
					Create Peer Offer
				</h2>
				<p className="text-xs text-[#7aaa92] mt-0.5">
					Lock USDC into Arc Escrow and publish an active offer for NGN
					settlement.
				</p>
			</div>

			<form onSubmit={onSubmit} className="space-y-4">
				<div>
					<div className="flex items-center justify-between mb-1">
						<label className="block text-xs font-semibold text-[#0d2b1e]">
							USDC Amount
						</label>
					</div>
					<div className="relative">
						<input
							type="text"
							value={offerUsdc}
							onChange={(e) => setOfferUsdc(e.target.value)}
							className="w-full px-4 py-2.5 rounded-2xl border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
							placeholder="Enter USDC amount"
						/>
						<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[#7aaa92]">
							{offerUsdc.trim()
								? `≈ ₦${Math.round(parseNumericUsdc(offerUsdc) * activeRate).toLocaleString("en-NG")}`
								: `1 USDC = ₦${activeRate.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
						</span>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block text-xs font-semibold text-[#0d2b1e] mb-1">
							Settlement Bank
						</label>
						<BankSearchSelect
							value={offerBank}
							onChange={setOfferBank}
							placeholder="Select settlement bank..."
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold text-[#0d2b1e] mb-1">
							Account Number
						</label>
						<input
							type="text"
							maxLength={10}
							value={offerAccountNo}
							onChange={(e) =>
								setOfferAccountNo(e.target.value.replace(/\D/g, ""))
							}
							placeholder="0123456789"
							className="w-full px-4 py-2.5 rounded-2xl border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
						/>
					</div>
				</div>

				<div className="p-3.5 rounded-2xl bg-[#fbfdfc] border border-[#d1e8dc] text-xs space-y-1">
					<div className="flex justify-between text-[#7aaa92]">
						<span>Platform Peg (Monierate Live)</span>
						<span className="font-mono font-bold text-[#0d2b1e]">
							1 USDC = ₦{activeRate.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
						</span>
					</div>
				</div>

				<button
					type="submit"
					disabled={creatingOffer}
					className="w-full py-3 rounded-full font-semibold text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-md disabled:opacity-60"
				>
					{creatingOffer
						? "Publishing on Arc Testnet..."
						: "Lock USDC & Publish Offer"}
				</button>
			</form>
		</div>
	);
}
