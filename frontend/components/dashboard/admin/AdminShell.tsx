"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ChevronRight, CircleUserRound, LayoutDashboard, Network, Search, ShieldAlert, Users, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";

const navigation = [
	{ href: "/dev", label: "Overview", keywords: "dashboard liquidity treasury network activity", icon: LayoutDashboard },
	{ href: "/dev/users", label: "Users & access", keywords: "wallets identity permissions accounts", icon: Users },
	{ href: "/dev/operations", label: "Operations", keywords: "transactions settlement escrow payments", icon: Activity },
	{ href: "/dev/diagnostics", label: "Escrow & TLSN", keywords: "health checks verifier tlsn dependencies", icon: Network },
	{ href: "/dev/audit", label: "Audit trail", keywords: "governance decisions history events", icon: ShieldAlert },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const { address } = useAccount();
	const [search, setSearch] = useState("");
	const [username, setUsername] = useState<string | null>(null);
	const identity = username || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Administrator");
	const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
	const searchResults = navigation.filter(({ label, keywords }) => `${label} ${keywords}`.toLowerCase().includes(search.trim().toLowerCase()));
	const goToSearchResult = (href: string) => {
		setSearch("");
		router.push(href);
	};

	useEffect(() => {
		if (!address) return;
		void fetch("/api/user/username", { headers: { "x-wallet-address": address }, cache: "no-store" })
			.then((response) => response.ok ? response.json() as Promise<{ username?: string | null }> : null)
			.then((user) => setUsername(user?.username || null))
			.catch(() => setUsername(null));
	}, [address]);
	return (
		<div className="min-h-screen text-ink">
			<div className="mx-auto flex min-h-screen max-w-[1600px]">
				<aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white px-4 py-7 lg:flex lg:flex-col">
					<div className="px-3">
						<p className="font-display text-[15px] font-bold text-ink">PeerNotary</p>
						<p className="mt-0.5 text-xs text-ink-3">Admin console</p>
					</div>
					<nav className="mt-10 space-y-0.5">
						<p className="kicker mb-3 px-3 text-ink-4">Workspace</p>
						{navigation.map(({ href, label, icon: Icon }) => {
							const active = href === "/dev" ? pathname === href : pathname.startsWith(href);
							return <Link key={href} href={href} className={cn("relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors", active ? "font-medium text-accent" : "text-ink-2 hover:bg-subtle hover:text-ink")}>{active && <motion.span layoutId="admin-active" className="absolute inset-0 rounded-lg bg-accent-soft before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}<Icon size={17} className={cn("relative", active ? "text-accent" : "text-ink-3")} /><span className="relative">{label}</span></Link>;
			})}
					</nav>
					<div className="mt-auto rounded-lg border border-line bg-subtle/60 p-4"><p className="text-xs leading-5 text-ink-3">Only configured administrator wallets can open this console.</p><Link href="/dev/diagnostics" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Check system health<ChevronRight size={12} /></Link></div>
				</aside>
				<main className="relative min-w-0 flex-1 overflow-hidden px-4 py-5 sm:px-7 lg:px-10 lg:py-7">
					<div className="mb-8 flex items-center justify-between gap-4 lg:hidden"><div className="flex items-center gap-2"><span className="text-sm font-semibold">Admin console</span></div><CircleUserRound size={18} className="text-ink-3" /></div>
					<div className="relative z-10 mx-auto max-w-7xl">
						<header className="mb-8 hidden items-center justify-between gap-5 lg:flex">
							<div><p className="text-[13px] text-ink-3">Signed in as {identity}</p><h1 className="mt-1 text-2xl font-bold text-ink">Admin console</h1></div>
							<div className="flex items-center gap-3"><div className="flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs text-ink-2"><CalendarDays size={15} className="text-ink-3" /><span>{today}</span></div><div className="relative"><div className="flex h-10 w-56 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs text-ink-2 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10"><Search size={15} className="shrink-0 text-ink-4" /><input aria-label="Search dashboard" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchResults[0]) goToSearchResult(searchResults[0].href); if (event.key === "Escape") setSearch(""); }} placeholder="Search dashboard" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-4" /></div>{search.trim() && <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-lg border border-line bg-white p-1.5 shadow-pop">{searchResults.length > 0 ? searchResults.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setSearch("")} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-ink-2 hover:bg-subtle hover:text-ink"><Icon size={15} className="text-accent" />{label}<ChevronRight size={13} className="ml-auto text-ink-4" /></Link>) : <p className="px-3 py-2.5 text-xs text-ink-3">No dashboard section found.</p>}</div>}</div><div className="flex items-center gap-2 border-l border-line pl-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a2148] text-xs font-semibold text-white">{address ? address.slice(2, 4).toUpperCase() : "AD"}</div><div className="hidden xl:block"><p className="text-xs font-semibold text-ink">{identity}</p><p className="text-[11px] text-ink-3">Super administrator</p></div></div></div>
						</header>
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}
