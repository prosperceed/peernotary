"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
	AnimatePresence,
	motion,
	useInView,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
	type Variants,
} from "framer-motion";
import {
	ArrowRight,
	ArrowUpRight,
	BadgeCheck,
	Check,
	Copy,
	FileCheck2,
	Landmark,
	Lock,
	ScanLine,
	Send,
	ShieldCheck,
} from "lucide-react";
import HowItWorks from "@/components/home/HowItWorks";
import USDCIcon from "@/components/icons/USDCIcon";

/*
 * One worked example (250 USDC at ₦1,380), played as a live demo: the
 * receipt steps through the real escrow lifecycle and then starts over.
 */
const STEPS = [
	{ icon: Lock, title: "Seller deposit", meta: "Locked on Arc", value: "250.00 USDC", done: "Locked" },
	{ icon: Landmark, title: "Bank transfer", meta: "GTBank → seller", value: "₦345,000", done: "Received" },
	{ icon: FileCheck2, title: "Payment proof", meta: "TLSNotary · bank session", value: "1 of 1", done: "Verified" },
	{ icon: Send, title: "Release to buyer", meta: "After 1% fee", value: "247.50 USDC", done: "Released" },
];
const LAST = STEPS.length - 1;
const STEP_MS = 1900;
const HOLD_MS = 3400;

type Dot = "done" | "active" | "next";
const actionsFor = (step: number): { icon: typeof Lock; label: string; state: Dot }[] => [
	{ icon: Lock, label: "Locked", state: "done" },
	{ icon: BadgeCheck, label: "Proven", state: step >= 2 ? "done" : step === 1 ? "active" : "next" },
	{ icon: ArrowUpRight, label: step >= 3 ? "Released" : "Release", state: step >= 3 ? "done" : step === 2 ? "active" : "next" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

const heroStagger: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const fadeUp: Variants = {
	hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
	show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

/** Drives the demo: advances one step at a time, holds on the last, loops. Pauses off-screen. */
function useLifecycle(active: boolean) {
	const [step, setStep] = useState(0);
	useEffect(() => {
		if (!active) return;
		const t = window.setTimeout(() => setStep((s) => (s >= LAST ? 0 : s + 1)), step >= LAST ? HOLD_MS : STEP_MS);
		return () => window.clearTimeout(t);
	}, [step, active]);
	return step;
}

function Chip({
	show,
	className,
	floatDelay,
	children,
}: {
	show: boolean;
	className: string;
	floatDelay?: string;
	children: React.ReactNode;
}) {
	return (
		<AnimatePresence>
			{show && (
				<motion.div
					initial={{ opacity: 0, scale: 0.85, y: 10 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.9, y: -6 }}
					transition={{ type: "spring", stiffness: 320, damping: 22 }}
					className={className}
				>
					<div
						className="flex animate-float items-center gap-3 rounded-2xl border border-white/90 bg-white/80 py-2.5 pl-2.5 pr-4 shadow-pop backdrop-blur-xl"
						style={floatDelay ? { animationDelay: floatDelay } : undefined}
					>
						{children}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function EscrowReceipt() {
	const reduce = useReducedMotion();
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { amount: 0.3 });
	const live = useLifecycle(!reduce && inView);
	const step = reduce ? LAST : live;
	const released = step >= LAST;

	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), { stiffness: 120, damping: 18 });
	const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), { stiffness: 120, damping: 18 });
	const chipX = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), { stiffness: 90, damping: 20 });
	const chipY = useSpring(useTransform(py, [-0.5, 0.5], [-8, 8]), { stiffness: 90, damping: 20 });
	const chipXInv = useTransform(chipX, (v) => -v);
	const chipYInv = useTransform(chipY, (v) => -v);

	const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (reduce || !ref.current) return;
		const r = ref.current.getBoundingClientRect();
		px.set((e.clientX - r.left) / r.width - 0.5);
		py.set((e.clientY - r.top) / r.height - 0.5);
	};
	const onLeave = () => {
		px.set(0);
		py.set(0);
	};

	return (
		<motion.div
			ref={ref}
			onPointerMove={onMove}
			onPointerLeave={onLeave}
			className="relative mx-auto w-full max-w-[400px] [perspective:1200px]"
			initial={reduce ? false : { opacity: 0, y: 40, rotateX: 14 }}
			animate={{ opacity: 1, y: 0, rotateX: 0 }}
			transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
		>
			{/* Soft green bloom behind the card */}
			<div
				aria-hidden
				className="pointer-events-none absolute -inset-20 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(52_178_122/0.22),transparent)] blur-2xl"
			/>
			{/* Stacked sheets behind, like a pad of receipts */}
			<div className="absolute inset-x-6 -top-4 h-24 rounded-[26px] border border-white/70 bg-white/35 backdrop-blur" />
			<div className="absolute inset-x-3 -top-2 h-24 rounded-[26px] border border-white/80 bg-white/50 backdrop-blur" />

			<motion.div
				style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
				className="relative overflow-hidden rounded-[26px] border border-white/90 bg-white/70 shadow-pop backdrop-blur-xl"
			>
				{/* Window chrome */}
				<div className="flex items-center justify-between px-5 pt-4">
					<div className="flex gap-1.5">
						<span className="h-2 w-2 rounded-full bg-accent/25" />
						<span className="h-2 w-2 rounded-full bg-accent/25" />
						<span className="h-2 w-2 rounded-full bg-accent/25" />
					</div>
					<span className="inline-flex items-center gap-1.5 rounded-full border border-white bg-white/80 px-2.5 py-1 font-mono text-[11px] text-ink-3 shadow-card">
						Trade #12-1
						<Copy size={11} />
					</span>
					<ScanLine size={16} className="text-accent" />
				</div>

				{/* Balance */}
				<div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
					<span className="flex h-12 w-12 items-center justify-center rounded-full border border-white bg-white text-accent shadow-card">
						<USDCIcon size={24} />
					</span>
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={released ? "out" : "in"}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.35, ease: EASE }}
						>
							<div className="mt-3 text-xs text-ink-3">{released ? "Released to buyer" : "Held in escrow"}</div>
							<div className="mt-1 font-display text-[34px] font-semibold leading-none tracking-tight text-ink">
								{released ? "247.50" : "250.00"} <span className="text-lg font-medium text-ink-3">USDC</span>
							</div>
						</motion.div>
					</AnimatePresence>
					<div className="mt-3 inline-flex items-center gap-2 text-xs">
						<span className="font-mono text-ink-2">≈ ₦345,000</span>
						<span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-medium text-accent">₦1,380 locked</span>
					</div>

					<div className="mt-6 grid w-full grid-cols-3">
						{actionsFor(step).map(({ icon: Icon, label, state }, i) => (
							<div key={i} className="flex flex-col items-center gap-2">
								<span className="relative">
									{state === "active" && !reduce && (
										<motion.span
											aria-hidden
											className="absolute inset-0 rounded-full border border-accent"
											animate={{ scale: [1, 1.55], opacity: [0.7, 0] }}
											transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
										/>
									)}
									<motion.span
										layout
										animate={{ scale: state === "active" ? 1.06 : 1 }}
										transition={{ type: "spring", stiffness: 400, damping: 20 }}
										className={
											state === "active"
												? "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#18975f] to-accent text-white shadow-glow"
												: state === "done"
													? "flex h-12 w-12 items-center justify-center rounded-full border border-white bg-white text-accent shadow-card"
													: "flex h-12 w-12 items-center justify-center rounded-full border border-white bg-white/50 text-ink-4 shadow-card"
										}
									>
										{state === "done" ? <Check size={18} strokeWidth={2.25} /> : <Icon size={18} strokeWidth={1.9} />}
									</motion.span>
								</span>
								<span className={state === "next" ? "text-xs text-ink-4" : "text-xs text-ink-2"}>{label}</span>
							</div>
						))}
					</div>
				</div>

				{/* Tabs */}
				<div className="flex gap-5 border-b border-line px-5 text-xs">
					<span className="border-b-2 border-accent pb-2.5 font-medium text-ink">Steps</span>
					<span className="pb-2.5 text-ink-3">Proof</span>
					<span className="pb-2.5 text-ink-3">Receipt</span>
				</div>

				{/* Steps */}
				<ul className="relative space-y-2 p-3">
					{STEPS.map(({ icon: Icon, title, meta, value, done: doneLabel }, i) => {
						const done = step >= i;
						const waiting = step === i - 1;
						return (
							<motion.li
								key={title}
								className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-white bg-white/75 px-3 py-2.5 shadow-card"
								initial={reduce ? false : { opacity: 0, x: 24 }}
								animate={{ opacity: done || waiting ? 1 : 0.55, x: 0 }}
								transition={{ duration: 0.5, ease: EASE }}
							>
								<span
									className={
										done
											? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors duration-500"
											: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent transition-colors duration-500"
									}
								>
									<Icon size={16} strokeWidth={1.8} />
								</span>
								<div className="min-w-0 flex-1">
									<div className="text-sm text-ink">{title}</div>
									<div className="truncate font-mono text-[11px] text-ink-3">{meta}</div>
								</div>
								<div className="text-right">
									<div className="font-mono text-sm text-ink">{value}</div>
									<AnimatePresence mode="wait" initial={false}>
										<motion.span
											key={done ? "done" : waiting ? "wait" : "idle"}
											initial={{ opacity: 0, scale: 0.6 }}
											animate={{ opacity: 1, scale: 1 }}
											exit={{ opacity: 0, scale: 0.6 }}
											transition={{ type: "spring", stiffness: 500, damping: 20 }}
											className={
												done
													? "mt-0.5 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent"
													: "mt-0.5 inline-block rounded px-1.5 text-[11px] font-medium text-ink-4"
											}
										>
											{done && <Check size={10} strokeWidth={3} />}
											{done ? doneLabel : waiting ? "Waiting" : "—"}
										</motion.span>
									</AnimatePresence>
								</div>
								{waiting && !reduce && (
									<motion.span
										aria-hidden
										className="absolute bottom-0 left-0 h-[2px] w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent"
										animate={{ x: ["-100%", "260%"] }}
										transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
									/>
								)}
							</motion.li>
						);
					})}
				</ul>
			</motion.div>

			{/* Event chips appear as the demo reaches each milestone */}
			<motion.div style={{ x: chipXInv, y: chipYInv }} className="absolute -left-6 bottom-24 z-20 hidden sm:block xl:-left-20">
				<Chip show={step >= 1} className="" floatDelay="-3s">
					<span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
						<Landmark size={16} strokeWidth={1.9} />
					</span>
					<div>
						<div className="font-mono text-sm font-medium text-ink">₦345,000</div>
						<div className="text-[11px] text-ink-3">received by seller</div>
					</div>
				</Chip>
			</motion.div>
			<motion.div style={{ x: chipX, y: chipY }} className="absolute -right-6 top-[36%] z-20 hidden sm:block xl:-right-16">
				<Chip show={step >= 2} className="">
					<span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2fb177] to-[#0a5c39] text-white">
						<ShieldCheck size={17} strokeWidth={2} />
					</span>
					<div>
						<div className="text-sm font-medium text-ink">Payment proven</div>
						<div className="font-mono text-[11px] text-ink-3">from the bank session</div>
					</div>
				</Chip>
			</motion.div>
		</motion.div>
	);
}

const TRUST = [
	{ icon: Lock, label: "USDC locked before you pay" },
	{ icon: FileCheck2, label: "Bank payment proven, not screenshotted" },
	{ icon: BadgeCheck, label: "Released without the seller online" },
];

export default function Homepage() {
	const reduce = useReducedMotion();
	return (
		<div className="overflow-x-clip">
			{/* Hero */}
			<section className="relative">
				<div className="ledger-grid pointer-events-none absolute inset-0" />
				<div className="relative mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:pt-24">
					<motion.div className="relative" variants={heroStagger} initial={reduce ? false : "hidden"} animate="show">
						<motion.h1 variants={fadeUp} className="text-[40px] font-semibold leading-[1.08] sm:text-[50px] lg:text-[44px] xl:text-[54px]">
							<span className="text-[#3b4440]">Locked. Paid. Proven.</span>
							<br />
							<span className="text-gradient animate-shimmer bg-[length:200%_auto]">USDC ⇄ Naira, notarised.</span>
						</motion.h1>
						<motion.p variants={fadeUp} className="mt-6 max-w-[30rem] text-base leading-relaxed text-ink-2">
							PeerNotary holds the seller&apos;s <span className="font-medium text-accent">USDC in escrow on Arc</span> and
							releases it only when the buyer&apos;s bank payment is proven. No receipts to fake, nobody to chase.
						</motion.p>
						<motion.div variants={fadeUp} className="mt-9 flex flex-wrap gap-3">
							<Link href="/trade" className="btn-primary h-12 rounded-full px-6 shadow-glow">
								Start a trade
								<ArrowRight size={16} />
							</Link>
							<Link href="/dashboard" className="btn-secondary h-12 rounded-full px-6">
								Sell USDC
							</Link>
						</motion.div>

						<motion.div variants={fadeUp} className="mt-14 flex items-center gap-4">
							<div className="flex -space-x-2.5">
								{TRUST.map(({ icon: Icon, label }) => (
									<span
										key={label}
										title={label}
										className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-accent-soft text-accent shadow-card"
									>
										<Icon size={15} strokeWidth={1.9} />
									</span>
								))}
							</div>
							<p className="text-sm leading-snug text-ink-3">
								Locked before you pay, proven from the bank,
								<br className="hidden sm:block" /> released without the seller online.
							</p>
						</motion.div>

					</motion.div>

					<EscrowReceipt />
				</div>
			</section>

			<HowItWorks />

			{/* Closing call to action */}
			<section className="px-6 pb-24">
				<motion.div
					initial={reduce ? false : { opacity: 0, y: 30 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-80px" }}
					transition={{ duration: 0.8, ease: EASE }}
					className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[28px] border border-white/90 bg-gradient-to-br from-white/85 via-white/60 to-accent-soft/70 backdrop-blur-xl px-8 py-12 text-center shadow-card sm:flex-row sm:text-left">
					<div className="flex-1">
						<h2 className="text-2xl font-semibold text-ink">Your next trade, with a receipt.</h2>
						<p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-2">
							Connect a wallet to buy from funded offers, or lock USDC and post your own rate.
						</p>
					</div>
					<Link href="/trade" className="btn-primary h-11 shrink-0 rounded-full px-5">
						Open trading desk
						<ArrowRight size={16} />
					</Link>
				</motion.div>
			</section>
		</div>
	);
}
