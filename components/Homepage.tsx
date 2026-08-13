"use client";

import { useState, useEffect, useRef } from "react";
import {
	ArrowRight,
	Zap,
	Database,
	Fingerprint,
	Shield,
	TrendingUp,
	Users,
	Clock,
	ChevronRight,
	ExternalLink,
	Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { View } from "@/types";

// ─── ANIMATED COUNTER ────────────────────────────────────────────────────────
function AnimatedCounter({
	target,
	prefix = "",
	suffix = "",
	duration = 1800,
}: {
	target: number;
	prefix?: string;
	suffix?: string;
	duration?: number;
}) {
	const [value, setValue] = useState(0);
	const spanRef = useRef<HTMLSpanElement>(null);
	const started = useRef(false);

	useEffect(() => {
		const el = spanRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !started.current) {
					started.current = true;
					const start = performance.now();
					const tick = (now: number) => {
						const p = Math.min((now - start) / duration, 1);
						const eased = 1 - Math.pow(1 - p, 3);
						setValue(Math.round(eased * target));
						if (p < 1) requestAnimationFrame(tick);
					};
					requestAnimationFrame(tick);
				}
			},
			{ threshold: 0.5 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [target, duration]);

	return (
		<span ref={spanRef}>
			{prefix}
			{value.toLocaleString()}
			{suffix}
		</span>
	);
}


function HeroAmbient() {
	return (
		<div
			className="absolute inset-0 overflow-hidden pointer-events-none select-none"
			aria-hidden
		>
			{/* radial glow */}
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.18]"
				style={{
					background:
						"radial-gradient(ellipse, #b1552f 0%, #060809 30%, transparent 70%)",
				}}
			/>
			{/* grid */}
			<div
				className="absolute inset-0 opacity-[0.03]"
				style={{
					backgroundImage:
						"linear-gradient(rgba(124,58,237,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.6) 1px, transparent 1px)",
					backgroundSize: "48px 48px",
				}}
			/>
			{/* floating nodes */}
			{[
				{ top: "18%", left: "10%", delay: "0s", size: 3, color: "#b1552f" },
				{ top: "68%", left: "7%", delay: "0.8s", size: 2, color: "#10B981" },
				{ top: "30%", left: "88%", delay: "1.2s", size: 4, color: "#06B6D4" },
				{ top: "78%", left: "82%", delay: "0.4s", size: 2, color: "#375975" },
				{ top: "12%", left: "72%", delay: "1.6s", size: 3, color: "#df6035" },
			].map((n, i) => (
				<div
					key={i}
					className="absolute rounded-full animate-pulse"
					style={{
						top: n.top,
						left: n.left,
						width: n.size * 2,
						height: n.size * 2,
						background: n.color,
						boxShadow: `0 0 ${n.size * 4}px ${n.color}`,
						animationDelay: n.delay,
						opacity: 0.65,
					}}
				/>
			))}
		</div>
	);
}

// ─── FEATURE CARD ────────────────────────────────────────────────────────────
interface FeatureCardProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	accent: string;
	tag: string;
	extra?: React.ReactNode;
	className?: string;
}

function FeatureCard({
	icon,
	title,
	description,
	accent,
	tag,
	extra,
	className,
}: FeatureCardProps) {
	return (
		<div
			className={cn(
				"relative group rounded-2xl border border-slate-700/50 bg-[var(--bgCard)] backdrop-blur-md p-6 overflow-hidden transition-all duration-300 hover:shadow-xl",
				className,
			)}
		>
			{/* hover glow */}
			<div
				className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
				style={{
					background: `radial-gradient(ellipse at 0% 0%, ${accent}18 0%, transparent 65%)`,
				}}
			/>
			{/* top accent bar */}
			<div
				className="absolute top-0 left-0 h-0.5 rounded-full transition-all duration-300 w-14 group-hover:w-24"
				style={{ background: accent }}
			/>
			<div className="relative">
				<div className="flex items-start justify-between mb-4">
					<div
						className="w-11 h-11 rounded-xl flex items-center justify-center"
						style={{ background: `${accent}18` }}
					>
						{icon}
					</div>
					<span
						className="text-[10px] font-mono px-2 py-1 rounded-full border"
						style={{
							color: accent,
							borderColor: `${accent}40`,
							background: `${accent}10`,
						}}
					>
						{tag}
					</span>
				</div>
				<h3 className="text-base font-bold text-white mb-2 leading-snug">
					{title}
				</h3>
				<p className="text-sm text-slate-400 leading-relaxed">{description}</p>
				{extra && <div className="mt-4">{extra}</div>}
			</div>
		</div>
	);
}

// ─── METRIC PILL ─────────────────────────────────────────────────────────────
function MetricPill({
	icon,
	label,
	value,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	color: string;
}) {
	return (
		<div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 px-6 py-5 sm:py-5 border-b sm:border-b-0 sm:border-r border-slate-800/60 last:border-0">
			<div
				className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--bgCard)]"
				// style={{ background: `${color}18` }}
			>
				{icon}
			</div>
			<div className="text-center sm:text-left">
				<div className="text-xl font-bold font-mono text-white leading-none">
					{value}
				</div>
				<div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
			</div>
		</div>
	);
}

// ─── HOMEPAGE ─────────────────────────────────────────────────────────────────
export default function Homepage({
	setCurrentView,
}: {
	setCurrentView: (v: View) => void;
}) {
	const [heroVisible, setHeroVisible] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setHeroVisible(true), 80);
		return () => clearTimeout(t);
	}, []);

	return (
		<div className="min-h-screen bg-bg">
			{/* ── HERO*/}
			<section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
				<HeroAmbient />

				<div
					className={cn(
						"relative z-10 max-w-4xl mx-auto transition-all duration-700",
						heroVisible
							? "opacity-100 translate-y-0"
							: "opacity-0 translate-y-6",
					)}
				>
					{/* <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/8 mb-8">
						<span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
						<span className="text-xs text-violet-300 font-medium">
							Now live on Arc Mainnet · Zero visual-receipt fraud
						</span>
					</div> */}

					{/* Headline */}
					<h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-black text-white leading-[1.07] tracking-tight mb-6">
						The Automated{" "}
						<span className="relative inline-block text-secondary">
							P2P Escrow System
						</span>{" "}
						<br className="hidden sm:block" />
						for African Fintech.
					</h1>

					<p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto mb-10">
						Eliminate fake-receipt fraud completely. Secure crypto-to-fiat flows
						using{" "}
						<span className="text-slate-200 font-medium">
							automated open banking oracles
						</span>{" "}
						and{" "}
						<span className="text-slate-200 font-medium">
							zero-knowledge web proofs
						</span>{" "}
						on Arc Chain.
					</p>

					<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
						<button
							onClick={() => setCurrentView("trade")}
							className="group flex items-center gap-2.5 px-7 py-3.5 background-secondary/20 border border-secondary text-primary font-bold text-sm transition-all duration-200 hover:shadow-2xl  active:scale-[0.97]"
							// style={{
							// 	background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
							// }}
						>
							Launch P2P App
							<ArrowRight
								size={15}
								className="group-hover:translate-x-0.5 transition-transform duration-150"
							/>
						</button>
						<button
							onClick={() => setCurrentView("dev")}
							className="group flex items-center gap-2.5 px-7 py-3.5 rounded-2xl border border-primary hover:border-primary/50 bg-primary/15 hover:bg-primary/40 text-slate-300 hover:text-white font-bold text-sm transition-all duration-200 active:scale-[0.97]"
						>
							Read Dev Docs
							<ExternalLink
								size={14}
								className="opacity-50 group-hover:opacity-100 transition-opacity duration-150"
							/>
						</button>
					</div>

					{/* Trust signals */}
					<div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
						{[
							"Non-custodial escrow",
							"On-chain arbitration",
							"USDC gas · no ETH needed",
							"Open banking verified",
						].map((item) => (
							<div
								key={item}
								className="flex items-center gap-1.5 text-[11px] text-slate-500"
							>
								{/* <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
									<path
										d="M2 5L4 7L8 3"
										stroke="#10B981"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg> */}
								{item}
							</div>
						))}
					</div>
				</div>

				{/* Scroll hint */}
				<div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-25">
					<span className="text-[10px] text-slate-500 tracking-widest uppercase">
						scroll
					</span>
					<div className="w-px h-8 bg-gradient-to-b from-slate-500 to-transparent" />
				</div>
			</section>

			{/* ── FEATURES BENTO GRID ──────────────────────────────────────────────── */}
			<section className="px-4 py-20 max-w-7xl mx-auto">
				<div className="text-center mb-12">
					<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700/60 bg-slate-800/40 mb-4">
						<span className="text-[10px] text-slate-400 font-mono tracking-widest">
							CORE INFRASTRUCTURE
						</span>
					</div>
					<h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
						Built on cryptographic truth.
					</h2>
					<p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
						Every fiat settlement is verified automatically. no screenshots, no
						manual review, no room for fake receipts.
					</p>
				</div>

				{/* Row 1: 3 equal cards */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<FeatureCard
						icon={<Zap size={20} className="text-secondary" />}
						title="Native Arc USDC Gas"
						description="No volatile utility tokens. Every transaction fee is settled in USDC at micro-cent scale — predictable costs for every order, regardless of network congestion."
						accent="#df6035"
						tag="Gas Layer"
					/>
					<FeatureCard
						icon={<Database size={20} className="text-emerald-400" />}
						title="Automated Open Banking Oracles"
						description="Live webhooks from Mono, Fincra, and Paystack connect directly to Nigerian bank rails. Fiat credit is confirmed in seconds by the bank itself — zero manual screenshots accepted."
						accent="#10B981"
						tag="Oracle"
					/>
					<FeatureCard
						icon={<Fingerprint size={20} className="text-cyan-400" />}
						title="TLSNotary ZK-Proofs"
						description="Cryptographic validation flows directly from bank servers via TLS session proofs. The blockchain verifies the HMAC signature — not a JPEG. Forged receipts are structurally impossible."
						accent="#06B6D4"
						tag="ZK Layer"
					/>
				</div>

				{/* Row 2: 2 wider cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
					<FeatureCard
						icon={<Shield size={20} className="text-amber-400" />}
						title="Slashing & Collateral Locks"
						description="Both parties post collateral before any order is matched. False dispute filings trigger a 50 USDC slash from the accuser — permanently recorded on-chain. Bad actors self-select out."
						accent="#F59E0B"
						tag="Anti-Fraud"
					/>
					<FeatureCard
						icon={<Activity size={20} className="text-blue-400" />}
						title="One-Line Fintech Integration"
						description="Drop the Arc P2P widget into any web or mobile app in under 10 minutes. Full webhook support, typed SDK, and a live dev dashboard included out of the box."
						accent="#3B82F6"
						tag="SDK"
						extra={
							<div className="bg-[#080C14] rounded-xl p-3 font-mono text-[10px] text-slate-500 border border-slate-800/60">
								<span className="text-secondary">npm install</span>{" "}
								<span className="text-slate-300">@arc-network/p2p-widget</span>
							</div>
						}
					/>
				</div>
			</section>

			{/* ── LIVE METRICS BANNER ───────────────────────────────────────────────── */}
			<section className="px-4 pb-20 max-w-7xl mx-auto">
				<div
					className="rounded-2xl border border-white/15 overflow-hidden"
					style={{
						background:
							"linear-gradient(135deg, var(--bg) 0%, #0D1322 50%, rgba(6,182,212,0.05) 100%)",
					}}
				>
					{/* Header row */}
					<div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60">
						<div className="flex items-center gap-2">
							<span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
							<span className="text-[11px] font-mono text-primary tracking-widest">
								LIVE NETWORK METRICS
							</span>
						</div>
						<span className="text-[10px] text-slate-600 font-mono hidden sm:block">
							Arc Mainnet · refreshes every 5s
						</span>
					</div>

					{/* Metrics */}
					<div className="grid grid-cols-1 sm:grid-cols-3">
						<MetricPill
							icon={<TrendingUp size={18} className="text-primary" />}
							label="Total Value Locked"
							value={
								<span className="text-primaryText">
									$<AnimatedCounter target={4200000} />
								</span>
							}
							color="#7C3AED"
						/>
						<MetricPill
							icon={<Clock size={18} className="text-primary" />}
							label="Avg. Release Time"
							value={<span className="text-primaryText">4.8s</span>}
							color="#10B981"
						/>
						<MetricPill
							icon={<Users size={18} className="text-primary" />}
							label="Active Integration Partners"
							value={
								<span className="text-primaryText">
									<AnimatedCounter target={34} /> Fintechs
								</span>
							}
							color="#06B6D4"
						/>
					</div>
				</div>
			</section>

			{/* ── BOTTOM CTA ───────────────────────────────────────────────────────── */}
			<section className="px-4 pb-24 max-w-3xl mx-auto text-center">
				<h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
					Ready to eliminate P2P fraud?
				</h2>
				<p className="text-slate-500 text-sm mb-8 leading-relaxed">
					Go live in minutes. No KYC overhead, no custodial risk, no
					fake-receipt exploits.
				</p>
				<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
					<button
						onClick={() => setCurrentView("trade")}
						className="group flex items-center gap-2 px-8 py-3.5 bg-secondary rounded-2xl text-primaryText font-bold text-sm"
					>
						Start Trading Now
					</button>
					<button
						onClick={() => setCurrentView("dev")}
						className="flex items-center gap-2 px-8 py-3.5 rounded-2xl border border-bg/20 hover:border-secondary text-slate-400 hover:text-slate-200 font-bold text-sm transition-all duration-200 active:scale-[0.97]"
					>
						Explore the SDK
					</button>
				</div>
			</section>
		</div>
	);
}
