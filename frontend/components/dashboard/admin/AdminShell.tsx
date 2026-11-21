"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, ChevronRight, CircleUserRound, LayoutDashboard, Network, Search, ShieldAlert, Users, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";

const navigation = [
	{ href: "/dev", label: "Overview", icon: LayoutDashboard },
	{ href: "/dev/users", label: "Users & access", icon: Users },
	{ href: "/dev/operations", label: "Operations", icon: Activity },
	{ href: "/dev/diagnostics", label: "Escrow & TLSN", icon: Network },
	{ href: "/dev/audit", label: "Audit trail", icon: ShieldAlert },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const { address } = useAccount();
	const [username, setUsername] = useState<string | null>(null);
	const identity = username || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Administrator");
	const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());

	useEffect(() => {
		if (!address) return;
		void fetch("/api/user/username", { headers: { "x-wallet-address": address }, cache: "no-store" })
			.then((response) => response.ok ? response.json() as Promise<{ username?: string | null }> : null)
			.then((user) => setUsername(user?.username || null))
			.catch(() => setUsername(null));
	}, [address]);
	return (
		<div className="min-h-screen bg-[#f5f9f7] text-[#0d2b1e]">
			<div className="mx-auto flex min-h-screen max-w-[1600px]">
				<aside className="hidden w-64 shrink-0 border-r border-[#dcece3] bg-white px-5 py-7 lg:flex lg:flex-col">
					<div className="flex items-center gap-3 px-2">
						<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0d2b1e] text-sm font-bold text-white">PN</div>
						<div><p className="text-sm font-bold tracking-tight">PeerNotary</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7aaa92]">Developer control</p></div>
					</div>
					<nav className="mt-12 space-y-1.5">
						<p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9bbbaa]">Workspace</p>
						{navigation.map(({ href, label, icon: Icon }) => {
							const active = href === "/dev" ? pathname === href : pathname.startsWith(href);
							return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition", active ? "bg-[#0d2b1e] text-white shadow-[0_10px_24px_rgba(13,43,30,0.15)]" : "text-[#527663] hover:bg-[#f0f7f3] hover:text-[#0d2b1e]")}><Icon size={17} /><span>{label}</span>{active && <ChevronRight className="ml-auto" size={14} />}</Link>;
			})}
					</nav>
					<div className="mt-auto rounded-2xl bg-[#f0f7f3] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#1a9e5c]"><span className="net-dot h-2 w-2 rounded-full bg-[#1a9e5c]" />Systems nominal</div><p className="mt-2 text-xs leading-5 text-[#6f9a83]">Control access is restricted to configured administrator wallets.</p></div>
				</aside>
				<main className="min-w-0 flex-1 px-4 py-5 sm:px-7 lg:px-10 lg:py-7">
					<div className="mb-8 flex items-center justify-between gap-4 lg:hidden"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0d2b1e] text-[10px] font-bold text-white">PN</div><span className="text-sm font-bold">Control center</span></div><CircleUserRound size={18} className="text-[#7aaa92]" /></div>
					<div className="mx-auto max-w-7xl">
						<header className="mb-8 hidden items-center justify-between gap-5 lg:flex">
							<div><p className="text-[13px] font-medium text-[#527663]">Hi {identity},</p><h1 className="mt-1 text-[24px] font-bold tracking-tight text-[#0d2b1e]">Welcome back!</h1></div>
							<div className="flex items-center gap-3"><div className="flex h-10 items-center gap-2 rounded-xl border border-[#d1e8dc] bg-white px-3 text-xs text-[#527663]"><CalendarDays size={15} className="text-[#1a9e5c]" /><span>{today}</span></div><div className="flex h-10 w-56 items-center gap-2 rounded-xl border border-[#d1e8dc] bg-white px-3 text-xs text-[#9bbbaa]"><Search size={15} /><span>Type to search</span></div><button aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#d1e8dc] bg-white text-[#527663] hover:bg-[#f0f7f3]"><Bell size={16} /><span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#1a9e5c]" /></button><div className="flex items-center gap-2 border-l border-[#dcece3] pl-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d4f0e3] text-xs font-bold text-[#1a9e5c]">{address ? address.slice(2, 4).toUpperCase() : "AD"}</div><div className="hidden xl:block"><p className="text-xs font-semibold text-[#0d2b1e]">{identity}</p><p className="text-[10px] text-[#7aaa92]">Super administrator</p></div></div></div>
						</header>
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}
