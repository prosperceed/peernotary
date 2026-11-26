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
		<div className="max-w-md mx-auto rounded-xl border border-line bg-surface p-7 space-y-5 shadow-card">
			<div>
				<h2 className="text-base font-semibold text-ink">
					Create Peer Offer
				</h2>
				<p className="text-xs text-ink-3 mt-0.5">
					Lock USDC into Arc Escrow and publish an active offer for NGN
					settlement.
				</p>
			</div>

			<form onSubmit={onSubmit} className="space-y-4">
				<div>
					<div className="flex items-center justify-between mb-1">
						<label className="block text-xs font-semibold text-ink">
							USDC Amount
						</label>
					</div>
					<div className="relative">
						<input
							type="text"
							value={offerUsdc}
							onChange={(e) => setOfferUsdc(e.target.value)}
							className="w-full px-4 py-2.5 rounded-xl border border-line text-xs font-mono text-ink focus:outline-none focus:border-accent"
							placeholder="Enter USDC amount"
						/>
						<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-3">
							{offerUsdc.trim()
								? `≈ ₦${Math.round(parseNumericUsdc(offerUsdc) * activeRate).toLocaleString("en-NG")}`
								: `1 USDC = ₦${activeRate.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
						</span>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block text-xs font-semibold text-ink mb-1">
							Settlement Bank
						</label>
						<BankSearchSelect
							value={offerBank}
							onChange={setOfferBank}
							placeholder="Select settlement bank..."
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold text-ink mb-1">
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
							className="w-full px-4 py-2.5 rounded-xl border border-line text-xs font-mono text-ink focus:outline-none focus:border-accent"
						/>
					</div>
				</div>

				<dl className="divide-y divide-line rounded-lg border border-line text-xs">
					<div className="flex justify-between px-3.5 py-2.5">
						<dt className="text-ink-3">Rate (Monierate)</dt>
						<dd className="font-mono text-ink">
							₦{activeRate.toLocaleString("en-NG", { minimumFractionDigits: 2 })} / USDC
						</dd>
					</div>
					<div className="flex justify-between px-3.5 py-2.5">
						<dt className="text-ink-3">Wallet prompts</dt>
						<dd className="text-ink">Approve USDC, then deposit to escrow</dd>
					</div>
					<div className="flex justify-between px-3.5 py-2.5">
						<dt className="text-ink-3">Withdrawable</dt>
						<dd className="text-ink">Any unsold USDC, at any time</dd>
					</div>
				</dl>

				<button type="submit" disabled={creatingOffer} className="btn-primary h-11 w-full">
					{creatingOffer ? "Waiting for Arc…" : "Lock USDC and publish"}
				</button>
			</form>
		</div>
	);
}
