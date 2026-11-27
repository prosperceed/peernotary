"use client";

import { motion } from "framer-motion";
import { Menu, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { arcChain } from "@/lib/web3/arcConfig";
import type { DashboardTab, NavItem } from "./types";

interface DashboardSidebarProps {
	navItems: NavItem[];
	activeTab: DashboardTab;
	setActiveTab: (tab: DashboardTab) => void;
	loadingData: boolean;
	onSync: () => void;
	username: string | null;
	address?: string;
	showDossier: boolean;
	setShowDossier: (show: boolean) => void;
	mobileMenuOpen: boolean;
	setMobileMenuOpen: (open: boolean) => void;
}

export function DashboardSidebar({
	navItems,
	activeTab,
	setActiveTab,
	loadingData,
	onSync,
	username,
	address,
	showDossier,
	setShowDossier,
	mobileMenuOpen,
	setMobileMenuOpen,
}: DashboardSidebarProps) {
	const initials = username ? username.slice(0, 2) : address ? address.slice(2, 4) : "me";
	const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";

	return (
		<>
			{/* Desktop rail: icons on md, icons + labels on lg */}
			<aside className="sticky top-24 hidden h-[calc(100vh-7.5rem)] shrink-0 flex-col justify-between rounded-card border border-line bg-surface/60 p-2.5 shadow-card backdrop-blur-xl md:flex lg:w-56">
				<nav className="flex flex-col gap-1">
					<div className="hidden px-3 pb-2 pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4 lg:block">
						Workspace
					</div>
					{navItems.map((item) => {
						const active = activeTab === item.id;
						return (
							<button
								key={item.id}
								onClick={() => setActiveTab(item.id)}
								title={item.label}
								className={cn(
									"relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm transition-colors lg:justify-start",
									active ? "text-ink" : "text-ink-3 hover:bg-subtle hover:text-ink",
								)}
							>
								{active && (
									<motion.span
										layoutId="dash-active"
										className="absolute inset-0 rounded-xl border border-accent/30 bg-gradient-to-r from-accent/25 to-accent/5"
										transition={{ type: "spring", stiffness: 420, damping: 34 }}
									/>
								)}
								<span className={cn("relative", active && "text-accent-ink")}>{item.icon}</span>
								<span className="relative hidden lg:inline">{item.label}</span>
								{item.count !== undefined && item.count > 0 && (
									<span
										className={cn(
											"relative ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center font-mono text-[11px] lg:inline",
											active ? "bg-accent text-white" : "bg-subtle text-ink-3",
										)}
									>
										{item.count}
									</span>
								)}
								{item.count !== undefined && item.count > 0 && (
									<span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent lg:hidden" />
								)}
							</button>
						);
					})}
				</nav>

				<div className="space-y-2">
					<button
						onClick={onSync}
						disabled={loadingData}
						title="Sync on-chain state"
						className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl px-3 text-xs text-ink-3 transition-colors hover:bg-subtle hover:text-ink lg:justify-start"
					>
						<RefreshCw size={15} className={cn(loadingData && "animate-spin text-accent-ink")} />
						<span className="hidden lg:inline">{loadingData ? "Syncing…" : "Sync with chain"}</span>
					</button>
					<button
						onClick={() => setShowDossier(!showDossier)}
						title="Merchant dossier"
						className={cn(
							"flex w-full items-center justify-center gap-3 rounded-xl border p-2 text-left transition-colors lg:justify-start",
							showDossier ? "border-accent/30 bg-accent/10" : "border-line bg-subtle/60 hover:bg-subtle",
						)}
					>
						<span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2fb177] to-accent text-xs font-semibold uppercase text-white">
							{initials}
							<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-mint" />
						</span>
						<span className="hidden min-w-0 lg:block">
							<span className="block truncate text-sm text-ink">{username ? `@${username}` : shortAddr}</span>
							<span className="block truncate text-[11px] text-ink-3">{arcChain.name}</span>
						</span>
					</button>
				</div>
			</aside>

			{/* Mobile header bar */}
			<div className="flex items-center justify-between md:hidden">
				<h1 className="text-lg font-semibold text-ink">Dashboard</h1>
				<button
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					className="btn-secondary h-9 w-9 rounded-full px-0"
					aria-label="Toggle navigation"
				>
					{mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
				</button>
			</div>

			{/* Mobile tab grid */}
			{mobileMenuOpen && (
				<motion.div
					initial={{ opacity: 0, y: -6 }}
					animate={{ opacity: 1, y: 0 }}
					className="grid grid-cols-2 gap-2 md:hidden"
				>
					{navItems.map((item) => (
						<button
							key={item.id}
							onClick={() => {
								setActiveTab(item.id);
								setMobileMenuOpen(false);
							}}
							className={cn(
								"flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium",
								activeTab === item.id
									? "border-accent/30 bg-accent/15 text-ink"
									: "border-line bg-subtle/60 text-ink-2",
							)}
						>
							{item.icon}
							<span>{item.label}</span>
							{item.count !== undefined && item.count > 0 && (
								<span className="ml-auto rounded-md bg-white/10 px-1.5 font-mono text-[11px]">{item.count}</span>
							)}
						</button>
					))}
				</motion.div>
			)}
		</>
	);
}
