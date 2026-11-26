import Link from "next/link";
import { ArrowRight, Check, Lock, Landmark, FileCheck2, Send } from "lucide-react";
import HowItWorks from "@/components/home/HowItWorks";

const TICKET_STEPS = [
	{ icon: Lock, title: "Seller locks 250.00 USDC", meta: "Locked in escrow on Arc", done: true },
	{ icon: Landmark, title: "Buyer pays ₦345,000 by bank transfer", meta: "Flutterwave · GTBank", done: true },
	{ icon: FileCheck2, title: "Payment proven from the bank session", meta: "TLSNotary · no screenshots", done: true },
	{ icon: Send, title: "Escrow releases 247.50 USDC to buyer", meta: "Sent to buyer · 1% fee", done: false },
];

export default function Homepage() {
	return (
		<div className="bg-canvas">
			{/* Hero */}
			<section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-24">
				<div>
					<p className="text-sm font-medium text-accent">USDC ⇄ NGN on Arc</p>
					<h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
						Trade crypto for naira without trusting the other side.
					</h1>
					<p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2">
						PeerNotary holds the seller&apos;s USDC in an on-chain escrow and only releases it once the
						buyer&apos;s bank payment is verified. No fake receipts, no chargeback games.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link href="/trade" className="btn-primary h-11 px-5">
							Open trading desk
							<ArrowRight size={16} />
						</Link>
						<Link href="/dashboard" className="btn-secondary h-11 px-5">
							Sell USDC
						</Link>
					</div>
				</div>

				{/* Product illustration: what a trade looks like */}
				<div className="card overflow-hidden">
					<div className="flex items-center justify-between border-b border-line px-5 py-3.5">
						<div>
							<div className="text-sm font-medium text-ink">Trade #12-1</div>
							<div className="text-xs text-ink-3">250.00 USDC · ₦1,380 / USDC</div>
						</div>
						<span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
							Releasing
						</span>
					</div>
					<ol className="px-5 py-2">
						{TICKET_STEPS.map(({ icon: Icon, title, meta, done }, i) => (
							<li key={title} className="relative flex gap-3.5 py-3">
								{i < TICKET_STEPS.length - 1 && (
									<span className="absolute left-[13px] top-10 h-[calc(100%-28px)] w-px bg-line" />
								)}
								<span
									className={`relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
										done ? "border-accent/20 bg-accent-soft text-accent" : "border-line bg-surface text-ink-3"
									}`}
								>
									{done ? <Check size={14} strokeWidth={2.25} /> : <Icon size={14} strokeWidth={1.75} />}
								</span>
								<div className="min-w-0">
									<div className={`text-sm ${done ? "text-ink" : "text-ink-2"}`}>{title}</div>
									<div className="mt-0.5 font-mono text-xs text-ink-3">{meta}</div>
								</div>
							</li>
						))}
					</ol>
					<div className="border-t border-line bg-subtle px-5 py-3 text-xs text-ink-3">
						Example trade. Every step leaves a receipt you can check.
					</div>
				</div>
			</section>

			<HowItWorks />
		</div>
	);
}
