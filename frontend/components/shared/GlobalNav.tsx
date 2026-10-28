"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
	Zap,
	Wallet,
	ChevronDown,
	Copy,
	Check,
	LogOut,
	AlertTriangle,
	LayoutDashboard,
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
import { arcTestnet } from "@/lib/web3/arcConfig";
import type { View } from "@/types";

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
		<div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#d1e8dc] bg-[#f0f7f3]">
			<span className="w-1.5 h-1.5 rounded-full bg-[#22c972] animate-pulse shrink-0" />
			<span
				className={cn(
					"text-[11px] font-mono text-[#1a9e5c] whitespace-nowrap transition-opacity duration-300",
					fading ? "opacity-0" : "opacity-100",
				)}
			>
				{TICKER_ITEMS[index]}
			</span>
		</div>
	);
}

function WalletButton({
	onAuthChange,
}: {
	onAuthChange?: (authenticated: boolean) => void;
}) {
	const { address, chainId, isConnected } = useAccount();
	const { connectAsync } = useConnect();
	const { disconnect } = useDisconnect();
	const { signMessageAsync } = useSignMessage();
	const { switchChainAsync } = useSwitchChain();
	const [authenticated, setAuthenticated] = useState(false);

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
		updateAuthState(false);
		setOpen(false);
		await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
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

			void fetch("/api/auth/session", {
				headers: { "x-wallet-address": normalizedAddress },
			})
				.then((response) => response.json())
				.then(
					(session: {
						authenticated?: boolean;
						user?: { walletAddress?: string };
					}) => {
						const isAuth = Boolean(
							session.authenticated &&
								session.user?.walletAddress?.toLowerCase() ===
									normalizedAddress,
						);
						setAuthenticated(isAuth);
						onAuthChange?.(isAuth);
					},
				)
				.catch(() => {
					setAuthenticated(false);
					onAuthChange?.(false);
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
			await switchChainAsync({ chainId: arcTestnet.id });
			void invalidateSession();
			disconnect();
			setAuthenticated(false);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not switch to Arc Testnet.",
			);
		} finally {
			setBusy(false);
		}
	};

	const authenticate = async (walletAddress: `0x${string}`) => {
		if (chainId !== arcTestnet.id) {
			setError(`Switch to ${arcTestnet.name} before signing in.`);
			return;
		}
		setBusy(true);
		setError(undefined);
		try {
			const challengeResponse = await fetch("/api/auth/nonce", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address: walletAddress }),
			});
			if (!challengeResponse.ok)
				throw new Error("Could not authenticate wallet.");
			const challenge: { nonce: string; message: string } =
				await challengeResponse.json();
			const signature = await signMessageAsync({ message: challenge.message });
			const verifyResponse = await fetch("/api/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					address: walletAddress,
					nonce: challenge.nonce,
					signature,
				}),
			});
			if (!verifyResponse.ok)
				throw new Error("Authentication was rejected by the server.");
			updateAuthState(true);
		} catch (caught) {
			updateAuthState(false);
			setError(
				caught instanceof Error && caught.message.includes("rejected")
					? "Signature request cancelled."
					: caught instanceof Error
					? caught.message
					: "Authentication failed.",
			);
		} finally {
			setBusy(false);
		}
	};

	const handleConnect = async () => {
		setError(undefined);
		try {
			const result = await connectAsync({ connector: injected() });
			const connectedAddress = result.accounts[0];
			if (connectedAddress) await authenticate(connectedAddress);
		} catch (caught) {
			setError(
				caught instanceof Error &&
					caught.message.toLowerCase().includes("reject")
					? "Wallet connection cancelled."
					: "Could not connect wallet.",
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

	// ── STATE 1: Not connected ────────────────────────────────────────────────
	if (!isConnected || !address) {
		return (
			<div className="flex flex-col items-end gap-1">
				<button
					onClick={() => void handleConnect()}
					disabled={busy}
					className={cn(
						"group relative flex items-center gap-2 px-4 py-2 rounded-xl",
						"bg-white border border-[#d1e8dc] text-[#1a9e5c] text-sm font-semibold",
						"shadow-sm shadow-[#22c972]/5",
						"transition-all duration-200",
						"hover:bg-[#f0f7f3] hover:border-[#1a9e5c]/50 hover:shadow-md hover:shadow-[#22c972]/15 hover:-translate-y-px",
						"active:scale-[0.97] active:translate-y-0",
						"disabled:opacity-60 disabled:pointer-events-none",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c972]/40",
					)}
				>
					{/* Left icon with subtle bg ring on hover */}
					<span
						className={cn(
							"flex items-center justify-center w-5 h-5 rounded-lg shrink-0",
							"bg-[#f0f7f3] border border-[#d1e8dc]",
							"group-hover:bg-[#e6f5ee] group-hover:border-[#1a9e5c]/30",
							"transition-all duration-200",
						)}
					>
						{busy ? (
							<span className="w-3 h-3 rounded-full border-2 border-[#22c972] border-t-transparent animate-spin" />
						) : (
							<Wallet size={11} className="text-[#1a9e5c]" />
						)}
					</span>

					<span className="leading-none">
						{busy ? "Connecting…" : "Connect Wallet"}
					</span>

					{/* Subtle right arrow that appears on hover */}
					<ChevronDown
						size={13}
						className="text-[#7aaa92] -rotate-90 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
					/>
				</button>

				{/* Inline error message */}
				{error && (
					<p className="flex items-center gap-1 text-[10px] text-amber-600 max-w-[180px] text-right leading-tight">
						<AlertTriangle size={9} className="shrink-0" />
						{error}
					</p>
				)}
			</div>
		);
	}

	// ── STATE 2: Connected but not authenticated (includes wrong-chain) ───────
	if (!authenticated) {
		const isWrongChain = chainId !== arcTestnet.id;
		return (
			<div className="flex items-center gap-2">
				{/* Address pill */}
				<div
					className={cn(
						"hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl",
						"border bg-white text-[11px] font-mono",
						isWrongChain
							? "border-amber-200 text-amber-700 bg-amber-50"
							: "border-[#d1e8dc] text-[#3d6b55]",
					)}
				>
					<span
						className={cn(
							"w-1.5 h-1.5 rounded-full shrink-0 animate-pulse",
							isWrongChain ? "bg-amber-400" : "bg-[#22c972]",
						)}
					/>
					{truncate(address)}
				</div>

				{/* Action button */}
				<div className="flex flex-col items-end gap-1">
					{isWrongChain ? (
						<button
							onClick={() => void handleWrongChainSwitch()}
							disabled={busy}
							className={cn(
								"flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
								"border border-amber-300 bg-amber-50 text-amber-700",
								"transition-all duration-200",
								"hover:bg-amber-100 hover:border-amber-400 hover:shadow-sm hover:shadow-amber-200/50 hover:-translate-y-px",
								"active:scale-[0.97] active:translate-y-0",
								"disabled:opacity-60 disabled:pointer-events-none",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50",
							)}
						>
							<AlertTriangle size={12} className="shrink-0" />
							{busy ? "Switching…" : "Wrong Network"}
						</button>
					) : (
						<button
							onClick={() => void authenticate(address)}
							disabled={busy}
							className={cn(
								"group flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
								"border border-[#d1e8dc] bg-white text-[#1a9e5c]",
								"transition-all duration-200",
								"hover:bg-[#f0f7f3] hover:border-[#1a9e5c]/40 hover:shadow-sm hover:shadow-[#22c972]/10 hover:-translate-y-px",
								"active:scale-[0.97] active:translate-y-0",
								"disabled:opacity-60 disabled:pointer-events-none",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c972]/40",
							)}
						>
							{busy ? (
								<span className="w-3 h-3 rounded-full border-2 border-[#22c972] border-t-transparent animate-spin" />
							) : (
								<Wallet size={12} className="shrink-0" />
							)}
							{busy ? "Verifying…" : "Sign In"}
						</button>
					)}

					{error && (
						<p className="flex items-center gap-1 text-[10px] text-amber-600 max-w-[180px] text-right leading-tight">
							<AlertTriangle size={9} className="shrink-0" />
							{error}
						</p>
					)}
				</div>
			</div>
		);
	}

	// ── STATE 3: Fully connected & authenticated ──────────────────────────────
	return (
		<div className="relative" ref={ref}>
			{/* Trigger button */}
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"group flex items-center gap-2 px-3 py-2 rounded-xl",
					"border border-[#d1e8dc] bg-white",
					"shadow-sm shadow-[#22c972]/5",
					"transition-all duration-200",
					"hover:bg-[#f0f7f3] hover:border-[#1a9e5c]/40 hover:shadow-md hover:shadow-[#22c972]/15 hover:-translate-y-px",
					"active:scale-[0.97] active:translate-y-0",
					open && "bg-[#f0f7f3] border-[#1a9e5c]/40 shadow-md shadow-[#22c972]/10",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c972]/40",
				)}
				aria-haspopup="true"
				aria-expanded={open}
			>
				{/* Avatar dot */}
				<span className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc] group-hover:border-[#1a9e5c]/30 transition-all duration-200 shrink-0">
					<span className="text-[10px] font-bold text-[#1a9e5c]">
						{address.slice(2, 4).toUpperCase()}
					</span>
					{/* Online dot */}
					<span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22c972] border border-white" />
				</span>

				{/* Address */}
				<span className="hidden sm:inline text-xs font-mono text-[#3d6b55] leading-none">
					{truncate(address)}
				</span>

				{/* Chevron */}
				<ChevronDown
					size={12}
					className={cn(
						"text-[#7aaa92] transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>

			{/* Dropdown panel */}
			{open && (
				<div
					className={cn(
						"absolute right-0 top-full mt-2 z-50",
						"w-60 rounded-2xl overflow-hidden",
						"bg-white border border-[#d1e8dc]",
						"shadow-xl shadow-[#22c972]/8",
						"dropdown-enter",
					)}
				>
					{/* Header */}
					<div className="px-4 py-3 border-b border-[#d1e8dc] bg-[#f8fcfa]">
						<div className="flex items-center gap-2.5 mb-2">
							{/* Avatar */}
							<div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a9e5c] to-[#22c972] flex items-center justify-center shrink-0">
								<span className="text-[11px] font-bold text-white">
									{address.slice(2, 4).toUpperCase()}
								</span>
								<span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c972] border-2 border-white" />
							</div>
							<div className="min-w-0">
								<div className="text-[11px] font-semibold text-[#0d2b1e] leading-none mb-0.5">
									Connected
								</div>
								<div className="font-mono text-[10px] text-[#7aaa92] truncate">
									{address}
								</div>
							</div>
						</div>

						{/* Network badge */}
						<div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc]">
							<span className="w-1.5 h-1.5 rounded-full bg-[#22c972] animate-pulse shrink-0" />
							<span className="text-[10px] text-[#1a9e5c] font-medium">
								Arc Testnet
							</span>
							<span className="ml-auto text-[9px] font-mono text-[#7aaa92]">
								#{arcTestnet.id}
							</span>
						</div>
					</div>

					{/* Actions */}
					<div className="p-2 space-y-0.5">
						<Link
							href="/dashboard"
							onClick={() => setOpen(false)}
							className={cn(
								"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
								"text-xs text-[#0d2b1e] font-semibold",
								"transition-all duration-150",
								"hover:bg-[#f0f7f3] hover:text-[#1a9e5c]",
								"active:scale-[0.98]",
							)}
						>
							<LayoutDashboard size={13} className="text-[#1a9e5c] shrink-0" />
							<span>User Dashboard</span>
						</Link>

						<button
							onClick={handleCopy}
							className={cn(
								"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
								"text-xs text-[#3d6b55] font-medium",
								"transition-all duration-150",
								"hover:bg-[#f0f7f3] hover:text-[#1a9e5c]",
								"active:scale-[0.98]",
							)}
						>
							{copied ? (
								<Check size={13} className="text-[#22c972] shrink-0" />
							) : (
								<Copy size={13} className="text-[#7aaa92] shrink-0" />
							)}
							<span>{copied ? "Address copied!" : "Copy address"}</span>
						</button>

						<div className="h-px bg-[#d1e8dc] mx-2 my-0.5" />

						<button
							onClick={() => {
								void invalidateSession();
								disconnect();
							}}
							className={cn(
								"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
								"text-xs text-red-500 font-medium",
								"transition-all duration-150",
								"hover:bg-red-50 hover:text-red-600",
								"active:scale-[0.98]",
							)}
						>
							<LogOut size={13} className="shrink-0" />
							<span>Disconnect wallet</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function NavLink({
	label,
	active,
	source,
}: {
	label: string;
	active: boolean;
	source: string;
}) {
	return (
		<Link
			href={source}
			className={cn(
				"relative px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200",
				active
					? "text-[#1a9e5c] bg-[#f0f7f3] border border-[#d1e8dc]"
					: "text-[#3d6b55] hover:text-[#1a9e5c] hover:bg-[#f0f7f3]",
			)}
		>
			{label}
		</Link>
	);
}

export default function GlobalNav() {
	const pathname = usePathname();
	const [scrolled, setScrolled] = useState(false);
	const [isAuthed, setIsAuthed] = useState(false);

	const getViewFromPathname = (path: string): View => {
		if (path.includes("/dashboard")) return "dashboard";
		if (path.includes("/trade")) return "trade";
		if (path.includes("/dev")) return "dev";
		return "home";
	};

	const currentView = getViewFromPathname(pathname);

	useEffect(() => {
		const handler = () => setScrolled(window.scrollY > 10);
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	const navLinks: { label: string; view: View; source: string }[] = [
		{ label: "Home", view: "home", source: "/" },
		{ label: "Trading Portal", view: "trade", source: "/trade" },
		...(isAuthed
			? [{ label: "Dashboard", view: "dashboard" as const, source: "/dashboard" }]
			: []),
		{ label: "Developer Portal", view: "dev", source: "/dev" },
	];

	return (
		<header
			className={cn(
				"sticky top-0 z-50 bg-[#f5f9f7] transition-all duration-300",
				scrolled
					? "border-b border-[#d1e8dc] shadow-sm shadow-green-primary/5"
					: "border-b border-[#d1e8dc]",
			)}
			style={{
				backdropFilter: "blur(20px)",
				WebkitBackdropFilter: "blur(20px)",
			}}
		>
			{/* Main row */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
				{/* Left: Brand + Ticker */}
				<div className="flex items-center gap-3 shrink-0">
					<Link href="/" className="flex items-center gap-2 group">
						<span className="font-bold text-[#1a9e5c] text-base tracking-tight">
							PeerNotary
						</span>
					</Link>
					<LiveTicker />
				</div>

				{/* Center: Nav links */}
				<nav className="hidden md:flex items-center gap-1">
					{navLinks.map(({ label, view, source }) => (
						<NavLink
							key={view}
							source={source}
							label={label}
							active={currentView === view}
						/>
					))}
				</nav>

				{/* Right: Wallet */}
				<div className="shrink-0">
					<WalletButton onAuthChange={setIsAuthed} />
				</div>
			</div>

			{/* Mobile nav row */}
			<div className="md:hidden flex items-center gap-1 px-4 pb-2.5 border-t border-[#d1e8dc] pt-2">
				{navLinks.map(({ label, view, source }) => (
					<Link
						key={view}
						href={source}
						className={cn(
							"flex-1 py-1.5 rounded-lg text-[11px] font-medium text-center transition-all",
							currentView === view
								? "bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]"
								: "text-[#7aaa92] hover:text-[#3d6b55]",
						)}
					>
						{view === "trade"
							? "P2P Trade"
							: view === "dev"
							? "Dev Portal"
							: label}
					</Link>
				))}
			</div>
		</header>
	);
}
