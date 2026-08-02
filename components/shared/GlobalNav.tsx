"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Wallet, ChevronDown, Copy, Check, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { View } from "@/types";

// ─── PROPS ────────────────────────────────────────────────────────────────────
interface GlobalNavProps {
	currentView: View;
	setCurrentView: (v: View) => void;
}

// ─── LIVE TICKER ─────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
	"1 USDC = ₦1,630",
	"ARC/USDC +2.4%",
	"TVL: $4.2M",
	"Gas: 0.0031 USDC",
	"Active Escrows: 143",
	"Avg Release: 4.8s",
];

function LiveTicker() {
	const [index, setIndex] = useState(0);
	const [fading, setFading] = useState(false);

	useEffect(() => {
		const interval = setInterval(() => {
			setFading(true);
			setTimeout(() => {
				setIndex((i) => (i + 1) % TICKER_ITEMS.length);
				setFading(false);
			}, 300);
		}, 2800);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5">
			<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
			<span
				className={cn(
					"text-[11px] font-mono text-emerald-300 whitespace-nowrap transition-opacity duration-300",
					fading ? "opacity-0" : "opacity-100",
				)}
			>
				{TICKER_ITEMS[index]}
			</span>
		</div>
	);
}

// ─── WALLET BUTTON ────────────────────────────────────────────────────────────
const MOCK_ADDRESS = "0x7a3f...4b92";
const FULL_ADDRESS = "0x7a3f8d2c1e9b5f3a0d7c4e8b2a6f9c1e4b92";

function WalletButton() {
	const [connected, setConnected] = useState(false);
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const handleCopy = () => {
		navigator.clipboard.writeText(FULL_ADDRESS).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	if (!connected) {
		return (
			<button
				onClick={() => setConnected(true)}
				className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border b hover:bg-secondary/5 hover:text-white text-secondary text-sm font-semibold transition-all duration-200  active:scale-[.97]"
			>
				<Wallet size={14} />
				Connect Wallet
			</button>
		);
	}

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all duration-200"
			>
				<span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
				<span className="text-sm font-mono text-primaryText/80">
					{MOCK_ADDRESS}
				</span>
				<ChevronDown
					size={13}
					className={cn(
						"text-emerald-400/70 transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-700/60 bg-[var(--bg) backdrop-blur-xl shadow-2xl shadow-black/70 overflow-hidden z-50">
					<div className="p-3 border-b border-slate-800/60">
						<div className="text-[10px] text-slate-500 mb-1">
							Connected wallet
						</div>
						<div className="font-mono text-xs text-slate-300 truncate">
							{MOCK_ADDRESS}
						</div>
						<div className="flex items-center gap-1.5 mt-1">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
							<span className="text-[10px] text-emerald-400">Arc Testnet</span>
						</div>
					</div>
					<div className="p-2 space-y-0.5">
						<button
							onClick={handleCopy}
							className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-slate-300 hover:bg-slate-800/60 transition-all"
						>
							{copied ? (
								<Check size={13} className="text-emerald-400" />
							) : (
								<Copy size={13} className="text-slate-500" />
							)}
							{copied ? "Copied!" : "Copy address"}
						</button>
						<button
							onClick={() => {
								setConnected(false);
								setOpen(false);
							}}
							className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-red-400 hover:bg-red-500/5 transition-all"
						>
							<LogOut size={13} />
							Disconnect
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── NAV LINK ────────────────────────────────────────────────────────────────
function NavLink({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"relative px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200",
				active
					? "text-white"
					: "text-slate-400 hover:text-slate-200 hover:bg-secondary/10",
			)}
		>
			{active && (
				<span className="absolute inset-0 rounded-xl bg-secondary/15 border border-secondary/50" />
			)}
			<span className="relative">{label}</span>
		</button>
	);
}

// ─── GLOBAL NAV ───────────────────────────────────────────────────────────────
export default function GlobalNav({
	currentView,
	setCurrentView,
}: GlobalNavProps) {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const handler = () => setScrolled(window.scrollY > 10);
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	const navLinks: { label: string; view: View }[] = [
		{ label: "Home", view: "home" },
		{ label: "Trading Portal", view: "trade" },
		{ label: "Developer Portal", view: "dev" },
	];

	return (
		<header
			className={cn(
				"sticky top-0 z-50 transition-all duration-300",
				scrolled
					? "border-b border-bg/70 shadow-lg shadow-black/20"
					: "border-b border-secondary/30",
			)}
			style={{
				background: "#060809",
				backdropFilter: "blur(30px)",
				WebkitBackdropFilter: "blur(30px)",
			}}
		>
			{/* Main row */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
				{/* Left: Brand + Ticker */}
				<div className="flex items-center gap-3 shrink-0">
					<button
						onClick={() => setCurrentView("home")}
						className="flex items-center gap-2 group"
					>
						<div
							className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
							style={
								{
									// background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)",
								}
							}
						>
							<Zap size={15} className="text-white" strokeWidth={2.5} />
						</div>
						<span className="font-bold text-primary text-sm">PeerNotary</span>
					</button>
					<LiveTicker />
				</div>

				{/* Center: Nav links */}
				<nav className="hidden md:flex items-center gap-1">
					{navLinks.map(({ label, view }) => (
						<NavLink
							key={view}
							label={label}
							active={currentView === view}
							onClick={() => setCurrentView(view)}
						/>
					))}
				</nav>

				{/* Right: Wallet */}
				<div className="shrink-0">
					<WalletButton />
				</div>
			</div>

			{/* Mobile nav row */}
			<div className="md:hidden flex items-center gap-1 px-4 pb-2.5 border-t border-slate-800/40 pt-2">
				{navLinks.map(({ label, view }) => (
					<button
						key={view}
						onClick={() => setCurrentView(view)}
						className={cn(
							"flex-1 py-1.5 rounded-lg text-[11px] font-medium text-center transition-all",
							currentView === view
								? "bg-violet-500/20 text-violet-300 border border-violet-500/25"
								: "text-slate-500 hover:text-slate-300",
						)}
					>
						{view === "trade"
							? "P2P Trade"
							: view === "dev"
								? "Dev Portal"
								: label}
					</button>
				))}
			</div>
		</header>
	);
}
