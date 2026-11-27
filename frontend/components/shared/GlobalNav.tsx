"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
	Wallet,
	ChevronDown,
	Copy,
	Check,
	LogOut,
	AlertTriangle,
	LayoutDashboard,
	Menu,
	X,
	Loader2,
	PenLine,
	ArrowUpRight,
} from "lucide-react";
import {
	useAccount,
	useConnect,
	useDisconnect,
	useSignMessage,
	useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { IS_TESTNET } from "@/lib/env/network";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import {
	arcChain,
	ARCSCAN_ADDR,
	switchToArc,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";
import {
	getSupabaseWalletSession,
	supabaseWalletSignin,
	supabaseWalletSignOut,
} from "@/lib/supabase/client";
import type { View } from "@/types";

function RateBadge() {
	const { rate, rateData } = useMonierateRate();
	if (!rate) return null;
	return (
		<div className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-ink-3 xl:flex">
			<span className="font-mono tabular text-ink-2">
				₦{rate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			</span>
			<span>/ USDC</span>
			{rateData?.change24hText && <span className="font-mono">{rateData.change24hText}</span>}
		</div>
	);
}

/** Tracks the md breakpoint so only one WalletButton is mounted (header on desktop, menu on mobile). */
function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 768px)");
		const sync = () => setIsDesktop(mq.matches);
		sync();
		mq.addEventListener("change", sync);
		return () => mq.removeEventListener("change", sync);
	}, []);
	return isDesktop;
}

function WalletButton({
	onAuthChange,
	inMenu = false,
}: {
	onAuthChange?: (authenticated: boolean) => void;
	/** Full-width layout for the mobile menu; the account panel shows inline. */
	inMenu?: boolean;
}) {
	const [mounted, setMounted] = useState(false);
	const { address, chainId, isConnected } = useAccount();
	const { connectAsync, connectors } = useConnect();
	const { disconnect } = useDisconnect();
	const { signMessageAsync } = useSignMessage();
	const { switchChainAsync } = useSwitchChain();
	const [authenticated, setAuthenticated] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const updateAuthState = (next: boolean) => {
		setAuthenticated(next);
		onAuthChange?.(next);
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("peernotary-auth-change", {
					detail: { authenticated: next },
				}),
			);
		}
	};
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const previousAddress = useRef<string | undefined>(undefined);

	// ── Close dropdown on outside click ──────────────────────────────────────
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const invalidateSession = async () => {
		setAuthenticated(false);
		onAuthChange?.(false);
		setOpen(false);
		await supabaseWalletSignOut();
	};

	// ── Sync auth state with wallet connection ────────────────────────────────
	useEffect(() => {
		const checkSession = () => {
			if (!isConnected || !address) {
				if (previousAddress.current) void invalidateSession();
				previousAddress.current = address?.toLowerCase();
				return;
			}

			const normalizedAddress = address.toLowerCase();
			const changed =
				previousAddress.current &&
				previousAddress.current !== normalizedAddress;
			previousAddress.current = normalizedAddress;
			if (changed) {
				void invalidateSession();
				return;
			}

			void getSupabaseWalletSession(normalizedAddress).then((state) => {
				setAuthenticated(state.authenticated);
				onAuthChange?.(state.authenticated);
			});
		};

		checkSession();

		const onExternalAuth = (e: Event) => {
			const custom = e as CustomEvent<{ authenticated?: boolean }>;
			if (typeof custom.detail?.authenticated === "boolean") {
				setAuthenticated(custom.detail.authenticated);
				onAuthChange?.(custom.detail.authenticated);
			} else {
				checkSession();
			}
		};

		window.addEventListener("peernotary-auth-change", onExternalAuth);
		return () =>
			window.removeEventListener("peernotary-auth-change", onExternalAuth);
	}, [address, isConnected, onAuthChange]);

	const handleWrongChainSwitch = async () => {
		setBusy(true);
		setError(undefined);
		try {
			await switchToArc(switchChainAsync);
			if (address) {
				await authenticate(address);
			}
		} catch (caught) {
			setError(
				formatUserFriendlyWalletError(
					caught,
					`Could not switch to ${arcChain.name}. Please switch networks in your wallet.`,
				),
			);
		} finally {
			setBusy(false);
		}
	};

	const authenticate = async (walletAddress: `0x${string}`) => {
		if (chainId && chainId !== arcChain.id) {
			setError(`Switch to ${arcChain.name} before signing in.`);
			return;
		}
		setBusy(true);
		setError(undefined);
		try {
			const state = await supabaseWalletSignin({
				address: walletAddress,
				wagmiSignAsync: signMessageAsync,
			});
			setAuthenticated(state.authenticated);
			onAuthChange?.(state.authenticated);
		} catch (caught) {
			setAuthenticated(false);
			onAuthChange?.(false);
			setError(
				formatUserFriendlyWalletError(
					caught,
					"Sign-in could not be completed. Please try again.",
				),
			);
		} finally {
			setBusy(false);
		}
	};

	const handleConnect = async () => {
		setError(undefined);
		try {
			const targetConnector = connectors[0] ?? injected();
			const result = await connectAsync({ connector: targetConnector });
			const connectedAddress = result.accounts[0];
			if (connectedAddress) await authenticate(connectedAddress);
		} catch (caught) {
			setError(
				formatUserFriendlyWalletError(
					caught,
					"Could not connect to your wallet. Please make sure your wallet extension is unlocked.",
				),
			);
		}
	};

	const handleCopy = () => {
		if (!address) return;
		navigator.clipboard.writeText(address).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	// ── Truncate helper ───────────────────────────────────────────────────────
	const truncate = (addr: string) =>
		`${addr.slice(0, 6)}…${addr.slice(-4)}`;

	const errorLine = error ? (
		<p className={cn("flex items-center gap-1 text-xs leading-tight text-amber-700", inMenu ? "text-left" : "max-w-[220px] text-right")}>
			<AlertTriangle size={12} className="shrink-0" />
			{error}
		</p>
	) : null;

	// ── STATE 1: Not connected ────────────────────────────────────────────────
	if (!mounted || !isConnected || !address) {
		return (
			<div className={cn("flex flex-col gap-1.5", !inMenu && "items-end")}>
				<button
					onClick={() => void handleConnect()}
					disabled={busy}
					className={cn("btn-primary rounded-full px-4", inMenu ? "h-10 w-full" : "h-9")}
				>
					{busy ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} strokeWidth={1.75} />}
					{busy ? "Connecting…" : "Connect wallet"}
				</button>
				{errorLine}
			</div>
		);
	}

	// ── STATE 2: Connected but not authenticated (includes wrong-chain) ───────
	if (!authenticated) {
		const isWrongChain = chainId !== arcChain.id;
		return (
			<div className={cn("flex gap-2", inMenu ? "flex-col" : "items-center")}>
				<span className={cn("font-mono text-xs text-ink-3", inMenu ? "px-1" : "hidden sm:inline")}>{truncate(address)}</span>
				<div className={cn("flex flex-col gap-1", !inMenu && "items-end")}>
					{isWrongChain ? (
						<button
							onClick={() => void handleWrongChainSwitch()}
							disabled={busy}
							className={cn("btn h-9 rounded-full border border-amber-300 bg-amber-50 px-3.5 text-amber-800 hover:bg-amber-100", inMenu && "h-10 w-full")}
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} strokeWidth={1.75} />}
							{busy ? "Switching…" : "Switch to Arc"}
						</button>
					) : (
						<button
							onClick={() => void authenticate(address)}
							disabled={busy}
							className={cn("btn-primary rounded-full px-4", inMenu ? "h-10 w-full" : "h-9")}
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} strokeWidth={1.75} />}
							{busy ? "Check wallet…" : "Sign in"}
						</button>
					)}
					{errorLine}
				</div>
			</div>
		);
	}

	// ── STATE 3: Fully connected & authenticated ──────────────────────────────
	const accountPanel = (
		<>
					<div className="border-b border-line px-4 py-3">
						<div className="label">Signed in</div>
						<div className="mt-1 break-all font-mono text-xs text-ink">{address}</div>
						<div className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
							<span className="h-1.5 w-1.5 rounded-full bg-accent" />
							{arcChain.name} · {arcChain.id}
						</div>
					</div>
					<div className="p-1">
						<Link
							href="/dashboard"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink hover:bg-subtle"
						>
							<LayoutDashboard size={15} strokeWidth={1.75} className="text-ink-3" />
							Dashboard
						</Link>
						<a
							href={ARCSCAN_ADDR(address)}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink hover:bg-subtle"
						>
							<ArrowUpRight size={15} strokeWidth={1.75} className="text-ink-3" />
							View on ArcScan
						</a>
						<button
							onClick={handleCopy}
							className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink hover:bg-subtle"
						>
							{copied ? (
								<Check size={15} strokeWidth={1.75} className="text-accent" />
							) : (
								<Copy size={15} strokeWidth={1.75} className="text-ink-3" />
							)}
							{copied ? "Copied" : "Copy address"}
						</button>
						<div className="my-1 h-px bg-line" />
						<button
							onClick={() => {
								void invalidateSession();
								disconnect();
							}}
							className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
						>
							<LogOut size={15} strokeWidth={1.75} />
							Disconnect
						</button>
					</div>
		</>
	);

	if (inMenu) {
		return <div className="overflow-hidden rounded-xl border border-line bg-white">{accountPanel}</div>;
	}

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn("btn-secondary h-9 gap-2 rounded-full px-3", open && "bg-subtle")}
				aria-haspopup="true"
				aria-expanded={open}
			>
				<span className="h-2 w-2 rounded-full bg-accent" aria-label={arcChain.name} />
				<span className="font-mono text-xs text-ink">{truncate(address)}</span>
				<ChevronDown size={14} className={cn("text-ink-3 transition-transform", open && "rotate-180")} />
			</button>

			{open && (
				<div className="dropdown-enter absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-white bg-white/95 shadow-pop backdrop-blur-xl">
					{accountPanel}
				</div>
			)}
		</div>
	);
}

function MobileNavButton({
	currentView,
	navLinks,
	walletSlot,
}: {
	currentView: View | null;
	navLinks: { label: string; view: View; source: string }[];
	walletSlot?: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const pathname = usePathname();

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	return (
		<div className="relative md:hidden" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				className="btn-secondary h-9 w-9 rounded-full px-0"
				aria-haspopup="true"
				aria-expanded={open}
				aria-label="Toggle navigation menu"
			>
				{open ? <X size={16} /> : <Menu size={16} />}
			</button>
			{/* Kept mounted while closed so the wallet's session sync keeps running. */}
			<div
				className={cn(
					"absolute right-0 top-full z-50 mt-3 w-[min(18rem,calc(100vw-1.5rem))] rounded-card border border-white bg-white/95 p-1.5 shadow-pop backdrop-blur-xl",
					open ? "dropdown-enter" : "hidden",
				)}
			>
					{navLinks.map(({ label, view, source }) => (
						<Link
							key={view}
							href={source}
							onClick={() => setOpen(false)}
							className={cn(
								"block rounded-lg px-3 py-2.5 text-sm",
								currentView === view ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:bg-subtle",
							)}
						>
							{label}
						</Link>
					))}
					{walletSlot && <div className="mt-1.5 border-t border-line px-1.5 pb-1.5 pt-3">{walletSlot}</div>}
			</div>
		</div>
	);
}

function NavLink({ label, active, source }: { label: string; active: boolean; source: string }) {
	return (
		<Link
			href={source}
			aria-current={active ? "page" : undefined}
			className={cn(
				"relative rounded-full px-3.5 py-1.5 text-sm transition-colors",
				active ? "text-ink" : "text-ink-3 hover:text-ink",
			)}
		>
			{active && (
				<motion.span
					layoutId="nav-active"
					className="absolute inset-0 rounded-full bg-white shadow-card"
					transition={{ type: "spring", stiffness: 420, damping: 34 }}
				/>
			)}
			<span className="relative">{label}</span>
		</Link>
	);
}

export default function GlobalNav() {
	const pathname = usePathname();
	const [, setIsAuthed] = useState(false);
	const isDesktop = useIsDesktop();

	const getViewFromPathname = (path: string): View | null => {
		if (path.startsWith("/dashboard")) return "dashboard";
		if (path.startsWith("/trade") || path.startsWith("/bank-checkout")) return "trade";
		if (path.startsWith("/dev")) return "dev";
		return path === "/" ? "home" : null;
	};

	const currentView = getViewFromPathname(pathname);

	const navLinks: { label: string; view: View; source: string }[] = [
		{ label: "Home", view: "home", source: "/" },
		{ label: "Trade", view: "trade", source: "/trade" },
		{ label: "Dashboard", view: "dashboard", source: "/dashboard" },
	];

	return (
		<header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
			<div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/60 gap-3 pl-4 pr-2.5 shadow-card backdrop-blur-xl sm:pl-5">
				<div className="flex min-w-0 items-center gap-3 sm:gap-5">
					<Link href="/" className="font-display text-[16px] font-semibold tracking-tight text-ink">
						Peer<span className="text-accent">Notary</span>
					</Link>
					{IS_TESTNET && (
						<span
							title={`${arcChain.name} · Flutterwave test mode. No real funds move.`}
							className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
						>
							<span className="relative flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
								<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
							</span>
							Testnet
						</span>
					)}
				</div>
				<nav className="hidden items-center gap-1 rounded-full p-1 md:flex">
					{navLinks.map(({ label, view, source }) => (
						<NavLink key={view} source={source} label={label} active={currentView === view} />
					))}
				</nav>
				<div className="flex items-center gap-3">
					<RateBadge />
					<MobileNavButton
						currentView={currentView}
						navLinks={navLinks}
						walletSlot={isDesktop === false ? <WalletButton inMenu onAuthChange={setIsAuthed} /> : null}
					/>
					{isDesktop !== false && (
						<div className="hidden md:block">
							<WalletButton onAuthChange={setIsAuthed} />
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
