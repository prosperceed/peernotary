"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, Banknote, Clock3, FileCheck2, Landmark, Layers, Lock, Zap } from "lucide-react";
import HowItWorks from "@/components/home/HowItWorks";
import WaveLines from "@/components/home/WaveLines";

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp: Variants = {
	hidden: { opacity: 0, y: 16 },
	show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

/* ── Orbit illustration ─────────────────────────────────────────────────── */

function UsdcGlyph() {
	return (
		<svg viewBox="0 0 32 32" className="h-[46%] w-[46%]" aria-hidden>
			<circle cx="16" cy="16" r="16" fill="#2775CA" />
			<path
				d="M20 18.3c0-2-1.2-2.7-3.6-3-1.7-.2-2-.7-2-1.5s.6-1.3 1.7-1.3c1 0 1.6.4 1.9 1.2.1.2.2.3.4.3h1c.2 0 .4-.2.4-.4-.3-1.2-1.2-2.1-2.5-2.3V10c0-.2-.2-.4-.5-.4h-.9c-.2 0-.4.2-.4.4v1.3c-1.8.3-2.9 1.4-2.9 2.9 0 1.900 1.1 2.6 3.5 2.9 1.6.3 2.1.6 2.1 1.6 0 .9-.8 1.5-1.9 1.5-1.5 0-2-.6-2.1-1.4 0-.2-.2-.3-.4-.3h-1c-.2 0-.4.2-.4.4.2 1.4 1.1 2.3 2.9 2.6V22c0 .2.2.4.5.4h.9c.2 0 .4-.2.4-.4v-1.3c1.8-.3 3-1.5 3-3.1z"
				fill="#fff"
			/>
			<path
				d="M12.6 24.4a8.9 8.9 0 0 1 0-16.8.5.5 0 0 0 .3-.5v-.8c0-.2-.1-.4-.3-.4h-.2a10.5 10.5 0 0 0 0 20.1h.2c.2 0 .3-.2.3-.4v-.8c0-.2-.1-.3-.3-.4zm6.8-18.4h-.2c-.2 0-.3.2-.3.4v.8c0 .2.1.4.3.5a8.9 8.9 0 0 1 0 16.8.5.5 0 0 0-.3.4v.8c0 .2.1.4.3.4h.2a10.5 10.5 0 0 0 0-20.1z"
				fill="#fff"
			/>
		</svg>
	);
}

/** Fiat in general, not one currency: a banknote. */
function FiatGlyph() {
	return <Banknote className="h-[46%] w-[46%] text-[#3a8a63]" strokeWidth={2} />;
}

function ArcGlyph() {
	return (
		<svg viewBox="0 0 32 32" className="h-[44%] w-[44%]" aria-hidden>
			<defs>
				<linearGradient id="arc-g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#7e72c9" />
					<stop offset="1" stopColor="#a585cf" />
				</linearGradient>
			</defs>
			<path d="M5 25a11 11 0 0 1 22 0" stroke="url(#arc-g)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
			<path d="M11 25a5 5 0 0 1 10 0" stroke="url(#arc-g)" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.55" />
		</svg>
	);
}

/** The escrow at the centre: a navy disc holding a softly lit white padlock. */
function EscrowCore() {
	return (
		<div className="relative flex h-full w-full items-center justify-center rounded-full bg-[#1a2148] shadow-[0_24px_50px_-18px_rgba(22,28,56,0.7)] ring-[6px] ring-white">
			<svg viewBox="0 0 80 80" className="h-[54%] w-[54%]" aria-hidden>
				<defs>
					<radialGradient id="lock-body" cx="0.35" cy="0.3" r="0.9">
						<stop offset="0" stopColor="#ffffff" />
						<stop offset="0.6" stopColor="#e9ecf8" />
						<stop offset="1" stopColor="#b9c0dc" />
					</radialGradient>
					<linearGradient id="lock-shackle" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0" stopColor="#c9cfe6" />
						<stop offset="0.5" stopColor="#ffffff" />
						<stop offset="1" stopColor="#aab2d2" />
					</linearGradient>
				</defs>
				<path d="M26 36V27a14 14 0 0 1 28 0v9" stroke="url(#lock-shackle)" strokeWidth="7" strokeLinecap="round" fill="none" />
				<rect x="16" y="34" width="48" height="36" rx="11" fill="url(#lock-body)" />
				<circle cx="40" cy="50" r="4.2" fill="#1a2148" />
				<rect x="38.2" y="51" width="3.6" height="9" rx="1.8" fill="#1a2148" />
			</svg>
		</div>
	);
}

type Bubble = {
	key: string;
	size: number; // px at full 440px stage
	x: string; // centre, as % of the stage
	y: string;
	label: string;
	content: React.ReactNode;
};

const BUBBLES: Bubble[] = [
	{ key: "usdc", size: 84, x: "50%", y: "8%", label: "USDC", content: <UsdcGlyph /> },
	{ key: "arc", size: 54, x: "84%", y: "20%", label: "Arc network", content: <ArcGlyph /> },
	{ key: "fiat", size: 78, x: "90%", y: "56%", label: "Local fiat", content: <FiatGlyph /> },
	{
		key: "proof",
		size: 46,
		x: "68%",
		y: "88%",
		label: "Payment proof",
		content: <FileCheck2 className="h-[48%] w-[48%] text-[#3a92a0]" strokeWidth={2} />,
	},
	{
		key: "bank",
		size: 80,
		x: "22%",
		y: "78%",
		label: "Bank transfer",
		content: <Landmark className="h-[44%] w-[44%] text-[#c39a3d]" strokeWidth={2} />,
	},
	{
		key: "fast",
		size: 50,
		x: "11%",
		y: "34%",
		label: "Instant release",
		content: <Zap className="h-[46%] w-[46%] text-[#cf8a4f]" strokeWidth={2} />,
	},
];

function Orbit() {
	const reduce = useReducedMotion();
	return (
		<div className="relative mx-auto aspect-square w-full max-w-[440px]">
			{/* Periwinkle bloom behind */}
			<div className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(150_160_220/0.28),transparent)] blur-2xl" />
			<motion.svg
				viewBox="0 0 100 100"
				className="absolute inset-0 h-full w-full"
				aria-hidden
				initial={reduce ? false : { opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 1, ease: EASE }}
			>
				<circle cx="50" cy="50" r="40" fill="none" stroke="rgb(47 64 150 / 0.28)" strokeWidth="0.35" />
			</motion.svg>

			<motion.div
				className="absolute left-[33%] top-[33%] h-[34%] w-[34%]"
				initial={reduce ? false : { opacity: 0, scale: 0.7 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.15 }}
			>
				<EscrowCore />
			</motion.div>

			{BUBBLES.map((b, i) => {
				const pct = (b.size / 440) * 100;
				return (
					<motion.div
						key={b.key}
						title={b.label}
						className="absolute"
						style={{
							left: `calc(${b.x} - ${pct / 2}%)`,
							top: `calc(${b.y} - ${pct / 2}%)`,
							width: `${pct}%`,
							height: `${pct}%`,
						}}
						initial={reduce ? false : { opacity: 0, scale: 0.4 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.35 + i * 0.08 }}
					>
						<motion.div
							className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-[0_14px_30px_-12px_rgba(22,28,56,0.28)] ring-1 ring-[#e6e9f3]"
							animate={reduce ? undefined : { y: [0, -6, 0] }}
							transition={{ duration: 5 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}
						>
							{b.content}
						</motion.div>
					</motion.div>
				);
			})}
		</div>
	);
}

/* ── Integrations row ───────────────────────────────────────────────────── */

const BUILT_ON = [
	{ name: "Arc", node: <span className="text-[22px] font-bold tracking-tight">Arc</span> },
	{
		name: "USDC",
		node: (
			<span className="inline-flex items-center gap-2 text-[19px] font-semibold">
				<span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-current text-[11px] font-bold">
					$
				</span>
				USDC
			</span>
		),
	},
	{ name: "Flutterwave", node: <span className="text-[20px] font-semibold lowercase tracking-tight">flutterwave</span> },
	{ name: "TLSNotary", node: <span className="font-mono text-[17px] font-medium">TLSNotary</span> },
	{
		name: "Local banks",
		node: (
			<span className="inline-flex items-center gap-2 text-[17px] font-semibold">
				<Landmark size={19} strokeWidth={2.2} />
				Local banks
			</span>
		),
	},
];

/* ── Feature cards ──────────────────────────────────────────────────────── */

const FEATURES = [
	{
		icon: Lock,
		tone: "bg-[#eef1ff] text-accent",
		title: "Seller-funded escrow",
		body: "An offer goes live only after the seller's USDC is locked on Arc.",
	},
	{
		icon: FileCheck2,
		tone: "bg-[#eefafc] text-[#3a8a98]",
		title: "Proof, not screenshots",
		body: "Payments are confirmed by Flutterwave or a TLSNotary proof of the bank session.",
	},
	{
		icon: Layers,
		tone: "bg-[#f8f0f5] text-[#a85b8c]",
		title: "Buy any amount",
		body: "Take a whole offer or just part of it. The rest stays listed for the next buyer.",
	},
	{
		icon: Clock3,
		tone: "bg-[#ecf9f2] text-[#3a8a63]",
		title: "No waiting on sellers",
		body: "A proven payment releases the USDC, even if the seller is offline.",
	},
];

export default function Homepage() {
	const reduce = useReducedMotion();
	return (
		<div className="overflow-x-clip">
			{/* Hero */}
			<section className="relative">
				<WaveLines className="pointer-events-none absolute inset-x-0 top-[34%] h-[420px] w-full" />
				<div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-12 md:pt-20 lg:grid-cols-[1.08fr_1fr] lg:gap-8 lg:pb-20">
					<motion.div variants={stagger} initial={reduce ? false : "hidden"} animate="show">
						<motion.h1
							variants={fadeUp}
							className="max-w-xl text-[38px] font-bold leading-[1.1] text-ink sm:text-[48px] lg:text-[52px]"
						>
							Swap USDC and fiat with escrow that pays on proof.
						</motion.h1>
						<motion.p variants={fadeUp} className="mt-6 max-w-lg text-[15px] leading-relaxed text-ink-2">
							PeerNotary locks the seller&apos;s USDC on Arc and releases it only when the buyer&apos;s bank payment
							is proven. Buy from funded offers or sell at your own rate, paying from your local bank.
						</motion.p>
						<motion.div variants={fadeUp} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
							<Link href="/trade" className="btn-primary h-12 w-full px-6 sm:w-auto">
								<Zap size={16} strokeWidth={2.2} />
								Start trading for free
							</Link>
							<Link
								href="/dashboard"
								className="group inline-flex h-12 items-center justify-center gap-1.5 px-3 text-sm font-medium text-ink hover:text-accent"
							>
								Sell your USDC
								<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
							</Link>
						</motion.div>
					</motion.div>

					<Orbit />
				</div>

				{/* Built on */}
				<motion.div
					className="relative mx-auto max-w-6xl px-6 pb-20"
					initial={reduce ? false : { opacity: 0, y: 14 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.7, ease: EASE }}
				>
					<p className="text-center text-[15px] font-semibold text-ink">Built on</p>
					<ul className="mt-7 grid grid-cols-2 items-center justify-items-center gap-x-6 gap-y-6 text-ink/70 sm:grid-cols-3 lg:grid-cols-5">
						{BUILT_ON.map(({ name, node }) => (
							<li key={name} title={name} className="transition-colors hover:text-ink">
								{node}
							</li>
						))}
					</ul>
				</motion.div>
			</section>

			{/* Features */}
			<section className="mx-auto max-w-6xl px-6 py-20">
				<div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
					<div className="grid gap-5 sm:grid-cols-2">
						{FEATURES.map(({ icon: Icon, tone, title, body }, i) => (
							<motion.div
								key={title}
								className="card p-6"
								initial={reduce ? false : { opacity: 0, y: 20 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-40px" }}
								transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
								whileHover={reduce ? undefined : { y: -3 }}
							>
								<span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
									<Icon size={17} strokeWidth={2} />
								</span>
								<h3 className="mt-5 text-[15px] font-semibold text-ink">{title}</h3>
								<p className="mt-2 text-[13px] leading-relaxed text-ink-3">{body}</p>
							</motion.div>
						))}
					</div>

					<motion.div
						initial={reduce ? false : { opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, margin: "-40px" }}
						transition={{ duration: 0.7, ease: EASE }}
					>
						<p className="kicker">Take the risk out</p>
						<h2 className="mt-5 text-[34px] font-bold leading-[1.15] text-ink sm:text-[40px]">
							The safer way to move between USDC and fiat.
						</h2>
						<p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-2">
							No fake receipts, no chargebacks, no chasing a seller who stopped replying. The rules live in the
							escrow, so neither side has to trust the other.
						</p>
						<a href="#how-it-works" className="btn-primary mt-8 h-11 px-5">
							See how it works
							<ArrowRight size={15} />
						</a>
					</motion.div>
				</div>
			</section>

			<HowItWorks />
		</div>
	);
}
