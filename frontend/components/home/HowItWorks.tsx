"use client";

import { motion } from "framer-motion";

const ACCENT = "#2f4096";

function IconLock() {
	return (
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
			<rect x="6" y="12.5" width="16" height="11" rx="2.5" stroke={ACCENT} strokeWidth="1.6" fill="rgba(47, 64, 150,0.07)" />
			<path d="M9.5 12.5V9.5a4.5 4.5 0 0 1 9 0v3" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
			<circle cx="14" cy="17.5" r="1.4" fill={ACCENT} />
			<path d="M14 18.9v1.8" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

function IconVerify() {
	return (
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
			<path
				d="M14 3.5L4.5 7v7c0 5.25 4.2 9.1 9.5 10.5C19.3 23.1 23.5 19.25 23.5 14V7L14 3.5z"
				stroke={ACCENT}
				strokeWidth="1.6"
				fill="rgba(47, 64, 150,0.07)"
				strokeLinejoin="round"
			/>
			<path d="M10 14l2.5 2.5L18 11" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function IconSettle() {
	return (
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
			<circle cx="14" cy="14" r="8.5" stroke={ACCENT} strokeWidth="1.6" fill="rgba(47, 64, 150,0.07)" />
			<path d="M14 18.5v-9M10.5 13l3.5-3.5 3.5 3.5" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

const STEPS = [
	{
		icon: <IconLock />,
		title: "Seller locks the USDC",
		description:
			"Before an offer goes live, the seller's USDC moves into escrow on Arc. Buyers only ever see offers that are already funded.",
		details: [
			"The offer appears only once the deposit confirms",
			"Buyers post no collateral",
			"Unsold USDC can be withdrawn at any time",
		],
	},
	{
		icon: <IconVerify />,
		title: "Buyer pays, payment is proven",
		description:
			"The buyer pays in their local currency through Flutterwave or a bank transfer. Payment is confirmed by the provider or a TLSNotary proof of the bank session, never a screenshot.",
		details: [
			"Rate and amount are locked when the order opens",
			"20 minutes to pay, then the USDC frees up again",
			"Each payment proof can be used only once",
		],
	},
	{
		icon: <IconSettle />,
		title: "Escrow releases to the buyer",
		description:
			"Once the payment checks out, the escrow sends the USDC straight to the buyer's wallet. The seller doesn't need to be online to approve it.",
		details: [
			"1% platform fee, deducted at release",
			"Buy a whole offer or just part of it",
			"Every release has a receipt you can look up",
		],
	},
];

const EDGE_CASES = [
	{
		q: "Buyer never pays",
		a: "The order expires after 20 minutes and the USDC goes back to the seller's offer.",
	},
	{
		q: "Wrong amount is sent",
		a: "Underpayments are held for review. Nothing is released automatically.",
	},
	{
		q: "Seller goes quiet",
		a: "Doesn't matter. A proven payment releases the USDC without the seller.",
	},
];

function DashedConnector({ index }: { index: number }) {
	return (
		<svg
			className="mt-10 hidden w-16 shrink-0 self-start overflow-visible lg:block xl:w-24"
			height="24"
			viewBox="0 0 96 24"
			fill="none"
			preserveAspectRatio="none"
			aria-hidden
		>
			<motion.path
				d="M4 20 Q 48 4 92 20"
				stroke={ACCENT}
				strokeWidth="1.5"
				strokeDasharray="5 4"
				strokeLinecap="round"
				fill="none"
				initial={{ pathLength: 0, opacity: 0 }}
				whileInView={{ pathLength: 1, opacity: 0.4 }}
				viewport={{ once: true }}
				transition={{ duration: 0.9, delay: 0.3 + index * 0.2 }}
			/>
			<circle r="2.2" fill="#3b4daa" opacity="0">
				<animateMotion dur="2.6s" repeatCount="indefinite" begin={`${1.2 + index * 0.4}s`} path="M4 20 Q 48 4 92 20" />
				<animate attributeName="opacity" values="0;1;1;0" dur="2.6s" repeatCount="indefinite" begin={`${1.2 + index * 0.4}s`} />
			</circle>
			<motion.circle
				cx="92"
				cy="20"
				r="3"
				fill={ACCENT}
				initial={{ scale: 0, opacity: 0 }}
				whileInView={{ scale: 1, opacity: 0.6 }}
				viewport={{ once: true }}
				transition={{ duration: 0.4, delay: 0.8 + index * 0.2 }}
			/>
		</svg>
	);
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
	return (
		<motion.div
			className="group relative flex w-full flex-col items-center rounded-xl px-6 pb-7 pt-8 text-center transition-colors duration-300 hover:bg-white hover:shadow-card lg:w-72 xl:w-80"
			initial={{ opacity: 0, y: 28 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.6, delay: index * 0.18, ease: [0.16, 1, 0.3, 1] }}
		>
			<div className="relative mb-6">
				<div className="absolute inset-0 rounded-full bg-accent/15 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
				<div className="absolute inset-0 rounded-full border-2 border-dashed border-accent/35 transition-colors duration-300 group-hover:border-solid group-hover:border-accent/50" />
				<motion.div
					className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/80 shadow-card"
					initial={{ scale: 0.6, opacity: 0 }}
					whileInView={{ scale: 1, opacity: 1 }}
					viewport={{ once: true }}
					whileHover={{ scale: 1.06, rotate: -4 }}
					transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 + index * 0.15 }}
				>
					{step.icon}
				</motion.div>
				<motion.span
					className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white"
					initial={{ scale: 0 }}
					whileInView={{ scale: 1 }}
					viewport={{ once: true }}
					transition={{ type: "spring", stiffness: 500, delay: 0.3 + index * 0.15 }}
				>
					{index + 1}
				</motion.span>
			</div>
			<h3 className="mb-2 text-base font-semibold tracking-tight text-ink">{step.title}</h3>
			<p className="text-[13px] leading-relaxed text-ink-2">{step.description}</p>
			<ul className="mt-5 w-full space-y-2 border-t border-dashed border-line pt-4 text-left">
				{step.details.map((d, i) => (
					<motion.li
						key={d}
						className="flex gap-2.5 text-xs leading-relaxed text-ink-3"
						initial={{ opacity: 0, x: -8 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: 0.5 + index * 0.18 + i * 0.08 }}
					>
						<span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/60" />
						{d}
					</motion.li>
				))}
			</ul>
		</motion.div>
	);
}

export default function HowItWorks() {
	return (
		<section id="how-it-works" className="relative scroll-mt-24 overflow-hidden px-4 py-24">
			<div className="relative mx-auto max-w-6xl">
				<motion.div
					className="mb-14 text-center"
					initial={{ opacity: 0, y: 24 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-60px" }}
					transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
				>
					<span className="mb-4 inline-block rounded-full border border-line bg-white px-3 py-1 font-mono text-[11px] tracking-widest text-accent">
						[how it works]
					</span>
					<h2 className="mb-3 text-3xl font-bold text-ink sm:text-4xl">
						Settlement in three steps
					</h2>
					<p className="mx-auto max-w-md text-sm leading-relaxed text-ink-2">
						The USDC is locked before anyone pays, and released only when the payment is proven.
						Neither side has to trust the other.
					</p>
				</motion.div>

				<div className="flex flex-col items-center justify-center gap-6 lg:flex-row lg:items-start lg:gap-0">
					{STEPS.map((step, index) => (
						<div key={step.title} className="flex w-full flex-col items-center lg:w-auto lg:flex-row lg:items-start">
							<StepCard step={step} index={index} />
							{index < STEPS.length - 1 && <DashedConnector index={index} />}
						</div>
					))}
				</div>

				<motion.div
					className="mx-auto mt-14 max-w-4xl rounded-2xl border border-dashed border-line-strong bg-white px-6 py-5 backdrop-blur-xl"
					initial={{ opacity: 0, y: 16 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.6, delay: 0.4 }}
				>
					<div className="mb-3 text-xs font-medium text-ink-3">When things don&apos;t go to plan</div>
					<dl className="grid gap-5 sm:grid-cols-3">
						{EDGE_CASES.map((c) => (
							<div key={c.q}>
								<dt className="text-sm font-medium text-ink">{c.q}</dt>
								<dd className="mt-1 text-xs leading-relaxed text-ink-2">{c.a}</dd>
							</div>
						))}
					</dl>
				</motion.div>
			</div>
		</section>
	);
}
