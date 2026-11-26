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
		<div className="hidden lg:flex items-center gap-2 text-xs text-ink-3">
			<span className="font-mono tabular text-ink-2">
				₦{rate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			</span>
			<span>/ USDC</span>
			{rateData?.change24hText && <span className="font-mono">{rateData.change24hText}</span>}
		</div>
	);
}

function WalletButton({
	onAuthChange,
}: {
	onAuthChange?: (authenticated: boolean) => void;
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
		<p className="flex max-w-[220px] items-center gap-1 text-right text-xs leading-tight text-amber-700">
			<AlertTriangle size={12} className="shrink-0" />
			{error}
		</p>
	) : null;

	// ── STATE 1: Not connected ────────────────────────────────────────────────
	if (!mounted || !isConnected || !address) {
		return (
			<div className="flex flex-col items-end gap-1">
				<button onClick={() => void handleConnect()} disabled={busy} className="btn-primary h-9 px-3.5">
					{busy ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} strokeWidth={1.75} />}
					<span className="hidden sm:inline">{busy ? "Connecting…" : "Connect wallet"}</span>
					<span className="sm:hidden">{busy ? "…" : "Connect"}</span>
				</button>
				{errorLine}
			</div>
		);
	}

	// ── STATE 2: Connected but not authenticated (includes wrong-chain) ───────
	if (!authenticated) {
		const isWrongChain = chainId !== arcChain.id;
		return (
			<div className="flex items-center gap-2">
				<span className="hidden font-mono text-xs text-ink-3 sm:inline">{truncate(address)}</span>
				<div className="flex flex-col items-end gap-1">
					{isWrongChain ? (
						<button
							onClick={() => void handleWrongChainSwitch()}
							disabled={busy}
							className="btn h-9 border border-amber-300 bg-amber-50 px-3.5 text-amber-800 hover:bg-amber-100"
						>
							{busy ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} strokeWidth={1.75} />}
							{busy ? "Switching…" : "Switch to Arc"}
						</button>
					) : (
						<button onClick={() => void authenticate(address)} disabled={busy} className="btn-primary h-9 px-3.5">
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
	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn("btn-secondary h-9 gap-2 px-2.5", open && "bg-subtle")}
				aria-haspopup="true"
				aria-expanded={open}
			>
				<span className="h-2 w-2 rounded-full bg-accent" aria-label={arcChain.name} />
				<span className="font-mono text-xs text-ink">{truncate(address)}</span>
				<ChevronDown size={14} className={cn("text-ink-3 transition-transform", open && "rotate-180")} />
			</button>

			{open && (
				<div className="dropdown-enter absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
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
				</div>
			)}
		</div>
	);
}

function MobileNavButton({
	currentView,
	navLinks,
}: {
	currentView: View | null;
	navLinks: { label: string; view: View; source: string }[];
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
				className="btn-secondary h-9 w-9 px-0"
				aria-haspopup="true"
				aria-expanded={open}
				aria-label="Toggle navigation menu"
			>
				{open ? <X size={16} /> : <Menu size={16} />}
			</button>
			{open && (
				<div className="dropdown-enter absolute right-0 top-full z-50 mt-2 w-48 rounded-card border border-line bg-surface p-1 shadow-pop">
					{navLinks.map(({ label, view, source }) => (
						<Link
							key={view}
							href={source}
							onClick={() => setOpen(false)}
							className={cn(
								"block rounded-md px-3 py-2 text-sm",
								currentView === view ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:bg-subtle",
							)}
						>
							{label}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

function NavLink({ label, active, source }: { label: string; active: boolean; source: string }) {
	return (
		<Link
			href={source}
			aria-current={active ? "page" : undefined}
			className={cn(
				"rounded-md px-3 py-1.5 text-sm transition-colors",
				active ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:text-ink",
			)}
		>
			{label}
		</Link>
	);
}

export default function GlobalNav() {
	const pathname = usePathname();
	const [isAuthed, setIsAuthed] = useState(false);

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
		<header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur">
			<div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
				<div className="flex items-center gap-6">
					<Link href="/" className="flex items-center gap-2">
						<span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">
							PN
						</span>
						<span className="text-[15px] font-semibold tracking-tight text-ink">PeerNotary</span>
					</Link>
					{IS_TESTNET && (
						<span
							title={`${arcChain.name} · Flutterwave test mode. No real funds move.`}
							className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
						>
							Testnet
						</span>
					)}
					<nav className="hidden items-center gap-1 md:flex">
						{navLinks.map(({ label, view, source }) => (
							<NavLink key={view} source={source} label={label} active={currentView === view} />
						))}
					</nav>
				</div>
				<div className="flex items-center gap-4">
					<RateBadge />
					<MobileNavButton currentView={currentView} navLinks={navLinks} />
					<WalletButton onAuthChange={setIsAuthed} />
				</div>
			</div>
		</header>
	);
}
