"use client";

import { useState, useEffect, useRef } from "react";
import {
	Shield,
	TrendingUp,
	Users,
	Clock,
	ArrowRight,
	Code2,
	Webhook,
	Key,
	BarChart3,
	Lock,
	CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

function USDCIcon({ size = 28 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle cx="16" cy="16" r="14" stroke="#1a9e5c" strokeWidth="2" fill="none" />
			<path d="M16 6v2M16 24v2" stroke="#1a9e5c" strokeWidth="2" strokeLinecap="round" />
			<path
				d="M20.5 11.5C20.5 9.57 18.43 8 16 8s-4.5 1.57-4.5 3.5c0 1.65 1.3 3.04 3.14 3.38l2.72.5C19.2 15.71 20.5 17.1 20.5 18.75 20.5 20.8 18.43 22 16 22s-4.5-1.2-4.5-3.25"
				stroke="#1a9e5c"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function OrbitalBackground() {
	return (
		<div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
				style={{
					width: "min(680px, 90vw)",
					height: "min(680px, 90vw)",
					background: "radial-gradient(ellipse at center, rgba(34,201,114,0.18) 0%, rgba(34,201,114,0.08) 35%, transparent 70%)",
				}}
			/>
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
				style={{ width: "min(300px, 45vw)", height: "min(300px, 45vw)", borderColor: "rgba(34,201,114,0.22)", background: "radial-gradient(ellipse at center, rgba(34,201,114,0.10) 0%, transparent 70%)" }}
			/>
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
				style={{ width: "min(430px, 62vw)", height: "min(430px, 62vw)", borderColor: "rgba(34,201,114,0.15)", background: "radial-gradient(ellipse at center, rgba(34,201,114,0.07) 0%, transparent 70%)" }}
			/>
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
				style={{ width: "min(570px, 80vw)", height: "min(570px, 80vw)", borderColor: "rgba(34,201,114,0.10)" }}
			/>
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
				style={{ width: "min(720px, 98vw)", height: "min(720px, 98vw)", borderColor: "rgba(34,201,114,0.06)" }}
			/>
		</div>
	);
}

interface FloatChipProps {
	children: React.ReactNode;
	style?: React.CSSProperties;
	delay?: string;
}
function FloatChip({ children, style, delay = "0s" }: FloatChipProps) {
	return (
		<div
			className="absolute flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-[#d1e8dc] shadow-lg shadow-green-primary/10"
			style={{ animationDelay: delay, animation: `float-bob 4s ease-in-out ${delay} infinite`, ...style }}
		>
			{children}
		</div>
	);
}

// ─── HOW IT WORKS — STEP ICONS ────────────────────────────────────────────────

function IconIntegrate() {
	return (
		/* design.dev-style: circuit/plug motif */
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="3" y="10" width="8" height="8" rx="2" stroke="#1a9e5c" strokeWidth="1.6" fill="none" />
			<rect x="17" y="10" width="8" height="8" rx="2" stroke="#1a9e5c" strokeWidth="1.6" fill="none" />
			<path d="M11 14h6" stroke="#1a9e5c" strokeWidth="1.6" strokeLinecap="round" />
			<path d="M7 10V7M7 18v3" stroke="#22c972" strokeWidth="1.6" strokeLinecap="round" />
			<path d="M21 10V7M21 18v3" stroke="#22c972" strokeWidth="1.6" strokeLinecap="round" />
		</svg>
	);
}

function IconVerify() {
	return (
		/* heroicon-inspired shield with inner checkmark */
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M14 3.5L4.5 7v7c0 5.25 4.2 9.1 9.5 10.5C19.3 23.1 23.5 19.25 23.5 14V7L14 3.5z"
				stroke="#1a9e5c"
				strokeWidth="1.6"
				fill="rgba(26,158,92,0.07)"
				strokeLinejoin="round"
			/>
			<path d="M10 14l2.5 2.5L18 11" stroke="#22c972" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function IconSettle() {
	return (
		/* design.dev-style: upward arrow with coin ring */
		<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="14" cy="15" r="8" stroke="#1a9e5c" strokeWidth="1.6" fill="none" />
			<path d="M14 19v-8M11 14l3-3 3 3" stroke="#22c972" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M11.5 22.5c0 1.1 1.12 2 2.5 2s2.5-.9 2.5-2" stroke="#1a9e5c" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
		</svg>
	);
}

const HOW_IT_WORKS_STEPS = [
	{
		number: "01",
		icon: <IconIntegrate />,
		title: "Integrate the API",
		description:
			"Drop in our SDK or call the REST API directly. Generate your API key from the developer dashboard and start accepting P2P trade requests in minutes.",
	},
	{
		number: "02",
		icon: <IconVerify />,
		title: "Verify Fiat Payment",
		description:
			"The oracle confirms fiat receipt through Open Banking webhooks or a ZK web proof — no screenshots, no manual checks, no fraud vectors.",
	},
	{
		number: "03",
		icon: <IconSettle />,
		title: "Auto-Release Escrow",
		description:
			"Once proof is verified on-chain, USDC is released instantly to the seller. Disputes route to on-chain arbitration with cryptographic evidence.",
	},
];

// ─── CONNECTOR LINE (dashed, curved SVG) ─────────────────────────────────────
function DashedConnector() {
	return (
		<svg
			className="hidden lg:block w-24 xl:w-32 shrink-0"
			height="24"
			viewBox="0 0 96 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
		>
			<path
				d="M4 20 Q 48 4 92 20"
				stroke="#22c972"
				strokeWidth="1.5"
				strokeDasharray="5 4"
				strokeLinecap="round"
				opacity="0.45"
				fill="none"
			/>
			<circle cx="92" cy="20" r="2.5" fill="#22c972" opacity="0.5" />
		</svg>
	);
}

// ─── API WORKFLOW ─────────────────────────────────────────────────────────────
const WORKFLOW_NODES_LEFT = [
	{ icon: <Key size={18} className="text-green-primary" />, label: "API Key Auth" },
	{ icon: <Webhook size={18} className="text-green-primary" />, label: "Webhook Events" },
	{ icon: <Code2 size={18} className="text-green-primary" />, label: "SDK Integration" },
];

const WORKFLOW_NODES_RIGHT = [
	{ icon: <Lock size={18} className="text-green-primary" />, label: "Escrow Lock" },
	{ icon: <CheckCircle2 size={18} className="text-green-primary" />, label: "Auto-Release" },
	{ icon: <BarChart3 size={18} className="text-green-primary" />, label: "Analytics" },
];

function WorkflowNode({ icon, label, side }: { icon: React.ReactNode; label: string; side: "left" | "right" }) {
	return (
		<div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-[#d1e8dc] shadow-sm w-full sm:w-44", side === "right" && "flex-row-reverse")}>
			<div className="w-8 h-8 rounded-lg bg-[#f0f7f3] flex items-center justify-center shrink-0">
				{icon}
			</div>
			<span className="text-xs font-semibold text-[#3d6b55]">{label}</span>
		</div>
	);
}

function MetricPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col sm:flex-row items-center gap-3 px-6 py-5 border-b sm:border-b-0 sm:border-r border-[#d1e8dc] last:border-0">
			<div className="w-10 h-10 rounded-xl bg-[#f0f7f3] flex items-center justify-center shrink-0">
				{icon}
			</div>
			<div className="text-center sm:text-left">
				<div className="text-xl font-bold font-mono text-[#0d2b1e] leading-none">{value}</div>
				<div className="text-[11px] text-[#7aaa92] mt-0.5">{label}</div>
			</div>
		</div>
	);
}

// ─── HOMEPAGE ─────────────────────────────────────────────────────────────────
export default function Homepage() {
	const [heroVisible, setHeroVisible] = useState(false);
	const router = useRouter();

	useEffect(() => {
		const t = setTimeout(() => setHeroVisible(true), 80);
		return () => clearTimeout(t);
	}, []);

	return (
		<div className="min-h-screen bg-[#f5f9f7]">

			{/* ── HERO ─────────────────────────────────────────────────────────── */}
			<section className="relative min-h-[88vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
				<OrbitalBackground />

				<FloatChip
					style={{ left: "calc(50% - min(260px, 36vw))", top: "50%", marginTop: "min(-28px, -4vw)" }}
					delay="0s"
				>
					<Shield size={26} className="text-[#1a9e5c]" strokeWidth={1.8} />
				</FloatChip>

				<FloatChip
					style={{ right: "calc(50% - min(280px, 38vw))", top: "50%", marginTop: "min(-28px, -4vw)" }}
					delay="1.6s"
				>
					<USDCIcon size={28} />
				</FloatChip>

				<div
					className={cn(
						"relative z-10 max-w-3xl mx-auto transition-all duration-700",
						heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
					)}
				>
					<h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black text-[#0d2b1e] leading-[1.08] tracking-tight mb-5">
						The Automated{" "}
						<span className="relative inline-block" style={{ color: "#1a9e5c" }}>
							P2P Escrow System
						</span>{" "}
						<br className="hidden sm:block" />
						for African Fintech.
					</h1>

					<p className="text-base sm:text-lg text-[#3d6b55] leading-relaxed max-w-2xl mx-auto mb-10">
						Eliminate fake-receipt fraud completely. Secure crypto-to-fiat flows using{" "}
						<span className="text-[#0d2b1e] font-semibold">automated open banking oracles</span>{" "}
						and{" "}
						<span className="text-[#0d2b1e] font-semibold">zero-knowledge web proofs</span>{" "}
						on Arc Chain.
					</p>

					{/* Trust signals only — no Launch App button */}
					<div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
						{["Non-custodial escrow", "On-chain arbitration", "USDC gas · no ETH needed", "Open banking verified"].map((item) => (
							<div key={item} className="flex items-center gap-1.5 text-[11px] text-[#7aaa92]">
								<span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c972]" />
								{item}
							</div>
						))}
					</div>
				</div>

				<div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-30">
					<span className="text-[10px] text-[#7aaa92] tracking-widest uppercase">scroll</span>
					<div className="w-px h-8 bg-gradient-to-b from-[#22c972] to-transparent" />
				</div>
			</section>

			{/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
			<section className="relative px-4 py-24 overflow-hidden">
				{/* Faint background texture */}
				<div
					className="absolute inset-0 pointer-events-none"
					style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,201,114,0.07) 0%, transparent 60%)" }}
					aria-hidden
				/>

				<div className="max-w-5xl mx-auto relative">
					{/* Section header — same pattern as api workflow */}
					<div className="text-center mb-16">
						<span className="inline-block px-3 py-1 rounded-full border border-[#d1e8dc] bg-[#f0f7f3] text-[11px] font-mono text-[#1a9e5c] tracking-widest mb-4">
							[how it works]
						</span>
						<h2 className="text-3xl sm:text-4xl font-black text-[#0d2b1e] tracking-tight mb-3">
							Settlement in three steps
						</h2>
						<p className="text-[#3d6b55] max-w-md mx-auto text-sm leading-relaxed">
							From trade initiation to USDC release — fully automated, cryptographically verified, zero human intervention required.
						</p>
					</div>

					{/* Steps row */}
					<div className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-6 lg:gap-0">
						{HOW_IT_WORKS_STEPS.map((step, index) => (
							<>
								{/* Step card */}
								<div
									key={step.number}
									className="group relative flex flex-col items-center text-center w-full lg:w-72 xl:w-80 px-6 pt-8 pb-7"
								>
									{/* Step number badge — top left of icon */}
									<div className="relative mb-6">
										<div
											className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center transition-colors duration-300 group-hover:border-solid"
											style={{ borderColor: "rgba(34,201,114,0.4)", background: "rgba(240,247,243,0.7)" }}
										>
											{step.icon}
										</div>
										{/* Number badge */}
										<span
											className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
											style={{ background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)" }}
										>
											{index + 1}
										</span>
									</div>

									<h3 className="text-base font-bold text-[#0d2b1e] mb-2 tracking-tight">
										{step.title}
									</h3>
									<p className="text-[13px] text-[#3d6b55] leading-relaxed">
										{step.description}
									</p>
								</div>

								{/* Dashed curved connector between steps */}
								{index < HOW_IT_WORKS_STEPS.length - 1 && (
									<DashedConnector key={`connector-${index}`} />
								)}
							</>
						))}
					</div>
				</div>
			</section>

			{/* ── API WORKFLOW SECTION ─────────────────────────────────────────── */}
			<section className="relative px-4 py-24 overflow-hidden">
				<div
					className="absolute top-0 left-0 w-72 h-72 rounded-full pointer-events-none"
					style={{ background: "radial-gradient(ellipse at top left, rgba(34,201,114,0.12) 0%, transparent 70%)" }}
				/>
				<div
					className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
					style={{ background: "radial-gradient(ellipse at top right, rgba(34,201,114,0.08) 0%, transparent 70%)" }}
				/>

				<div className="max-w-5xl mx-auto">
					<div className="text-center mb-16">
						<span className="inline-block px-3 py-1 rounded-full border border-[#d1e8dc] bg-[#f0f7f3] text-[11px] font-mono text-[#1a9e5c] tracking-widest mb-4">
							[api workflow]
						</span>
						<h2 className="text-3xl sm:text-4xl font-black text-[#0d2b1e] tracking-tight mb-3">
							One-click escrow automation
						</h2>
						<p className="text-[#3d6b55] max-w-md mx-auto text-sm leading-relaxed">
							Integrate Arc P2P escrow into any fintech app with a single API call. Automate fiat verification, fund locking, and settlement effortlessly.
						</p>
					</div>

					<div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-4">
						<div className="flex flex-col gap-3 w-full lg:w-auto lg:items-end">
							{WORKFLOW_NODES_LEFT.map((node) => (
								<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="left" />
							))}
						</div>

						<div className="flex flex-row lg:flex-col items-center gap-0 shrink-0">
							<div className="hidden lg:flex flex-col items-end gap-3 mr-4">
								{WORKFLOW_NODES_LEFT.map((_, i) => (
									<div
										key={i}
										className="h-px w-16 xl:w-24"
										style={{ background: "linear-gradient(90deg, transparent, rgba(26,158,92,0.35))" }}
									/>
								))}
							</div>

							<div
								className="flex flex-col items-center justify-center w-40 h-40 sm:w-44 sm:h-44 rounded-2xl border-2 bg-white shadow-xl shadow-green-primary/10 z-10"
								style={{ borderColor: "rgba(26,158,92,0.25)" }}
							>
								<div
									className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
									style={{ background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)" }}
								>
									<Shield size={26} className="text-white" strokeWidth={1.8} />
								</div>
								<span className="text-xs font-bold text-[#0d2b1e]">Arc Escrow</span>
								<span className="text-[10px] text-[#7aaa92] mt-0.5">Smart Contract</span>
							</div>

							<div className="hidden lg:flex flex-col items-start gap-3 ml-4">
								{WORKFLOW_NODES_RIGHT.map((_, i) => (
									<div
										key={i}
										className="h-px w-16 xl:w-24"
										style={{ background: "linear-gradient(90deg, rgba(26,158,92,0.35), transparent)" }}
									/>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-3 w-full lg:w-auto lg:items-start">
							{WORKFLOW_NODES_RIGHT.map((node) => (
								<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="right" />
							))}
						</div>
					</div>

					{/* Subtle docs link — not a CTA button */}
					<div className="mt-12 text-center">
						<Link
							href="/docs"
							className="inline-flex items-center gap-1.5 text-sm text-[#1a9e5c] hover:text-[#22c972] font-medium transition-colors duration-150"
						>
							Read Documentation
							<ArrowRight size={13} className="shrink-0" />
						</Link>
					</div>
				</div>
			</section>

			{/* ── LIVE METRICS BANNER ──────────────────────────────────────────── */}
			<section className="px-4 pb-24 max-w-5xl mx-auto">
				<div className="rounded-2xl border border-[#d1e8dc] bg-white overflow-hidden shadow-sm">
					<div className="flex items-center justify-between px-6 py-3 border-b border-[#d1e8dc]">
						<div className="flex items-center gap-2">
							<span className="w-2 h-2 rounded-full bg-[#22c972] net-dot" />
							<span className="text-[11px] font-mono text-[#1a9e5c] tracking-widest">LIVE NETWORK METRICS</span>
						</div>
						<span className="text-[10px] text-[#7aaa92] font-mono hidden sm:block">
							Arc Mainnet · refreshes every 5s
						</span>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3">
						<MetricPill
							icon={<TrendingUp size={18} className="text-[#1a9e5c]" />}
							label="Total Value Locked"
							value={<>$<AnimatedCounter target={4200000} /></>}
						/>
						<MetricPill
							icon={<Clock size={18} className="text-[#1a9e5c]" />}
							label="Avg. Release Time"
							value="4.8s"
						/>
						<MetricPill
							icon={<Users size={18} className="text-[#1a9e5c]" />}
							label="Active Integration Partners"
							value={<><AnimatedCounter target={34} /> Fintechs</>}
						/>
					</div>
				</div>
			</section>

		</div>
	);
}
