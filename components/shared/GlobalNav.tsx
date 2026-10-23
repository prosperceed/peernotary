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

function WalletButton() {
	const { address, chainId, isConnected } = useAccount();
	const { connectAsync } = useConnect();
	const { disconnect } = useDisconnect();
	const { signMessageAsync } = useSignMessage();
	const { switchChainAsync } = useSwitchChain();
	const [authenticated, setAuthenticated] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const previousAddress = useRef<string | undefined>(undefined);

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
		setOpen(false);
		await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
	};

	useEffect(() => {
		if (!isConnected || !address) {
			if (previousAddress.current) void invalidateSession();
			previousAddress.current = address?.toLowerCase();
			return;
		}

		const normalizedAddress = address.toLowerCase();
		const changed =
			previousAddress.current && previousAddress.current !== normalizedAddress;
		previousAddress.current = normalizedAddress;
		if (changed) {
			void invalidateSession();
			return;
		}

		void fetch("/api/auth/session")
			.then((response) => response.json())
			.then(
				(session: {
					authenticated?: boolean;
					user?: { walletAddress?: string };
				}) => {
					setAuthenticated(
						Boolean(
							session.authenticated &&
								session.user?.walletAddress?.toLowerCase() ===
									normalizedAddress,
						),
					);
				},
			)
			.catch(() => setAuthenticated(false));
	}, [address, isConnected]);

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
				throw new Error("Could notauthenticate wallet.");
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
			setAuthenticated(true);
		} catch (caught) {
			setAuthenticated(false);
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

	if (!isConnected || !address) {
		return (
			<button
				onClick={() => handleConnect()}
				className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border b hover:bg-secondary/5 hover:text-white text-secondary text-sm font-semibold transition-all duration-200  active:scale-[.97]"
			>
				<Wallet size={14} />
				{busy ? "Connecting…" : "Connect Wallet"}
			</button>
		);
	}

	if (!authenticated) {
		const isWrongChain = chainId !== arcTestnet.id;
		return (
			<div className="flex flex-col items-center gap-2">
				<div className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-950/60 px-3 py-2">
					<span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
					<span className="font-mono text-[11px] text-slate-300">
						{address}
					</span>
				</div>
				<div className="flex items-center gap-2">
					{error && (
						<span className="hidden lg:inline text-[10px] text-amber-300 max-w-48 text-right">
							{error}
						</span>
					)}
					{isWrongChain ? (
						<button
							onClick={() => void handleWrongChainSwitch()}
							disabled={busy}
							className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm font-semibold transition-all duration-200 hover:bg-amber-500/20 active:scale-[.97]"
						>
							<AlertTriangle size={14} />
							{busy ? "Switching…" : "Switch to Arc Testnet"}
						</button>
					) : (
						<button
							onClick={() => void authenticate(address)}
							disabled={busy}
							className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-secondary text-sm font-semibold transition-all duration-200 disabled:opacity-50"
						>
							<Wallet size={14} />
							{busy ? "Verifying…" : "Sign In"}
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[#d1e8dc] bg-[#f0f7f3] hover:bg-[#e6f5ee] transition-all duration-200"
			>
				<span className="w-2 h-2 rounded-full bg-[#22c972] animate-pulse" />
				<span className="text-sm font-mono text-[#3d6b55]">
					{address.slice(0, 8)}…{address.slice(-6)}
				</span>
				<ChevronDown
					size={13}
					className={cn(
						"text-[#7aaa92] transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[#d1e8dc] bg-white shadow-xl shadow-green-primary/10 overflow-hidden z-50">
					<div className="p-3 border-b border-[#d1e8dc]">
						<div className="text-[10px] text-[#7aaa92] mb-1">
							Connected wallet
						</div>
						<div className="font-mono text-xs text-[#3d6b55] truncate">
							{address}
						</div>
						<div className="flex items-center gap-1.5 mt-1">
							<span className="w-1.5 h-1.5 rounded-full bg-[#22c972]" />
							<span className="text-[10px] text-[#1a9e5c]">Arc Testnet</span>
						</div>
					</div>
					<div className="p-2 space-y-0.5">
						<button
							onClick={handleCopy}
							className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-[#3d6b55] hover:bg-[#f0f7f3] transition-all"
						>
							{copied ? (
								<Check size={13} className="text-[#22c972]" />
							) : (
								<Copy size={13} className="text-[#7aaa92]" />
							)}
							{copied ? "Copied!" : "Copy address"}
						</button>
						<button
							onClick={() => {
								void invalidateSession();
								disconnect();
							}}
							className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-red-500 hover:bg-red-50 transition-all"
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

	const getViewFromPathname = (path: string): View => {
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
					<WalletButton />
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
