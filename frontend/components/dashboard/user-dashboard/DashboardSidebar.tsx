"use client";

import { Menu, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
	return (
		<>
			{/* Left Slim Vertical Icon Dock (Desktop) */}
			<aside className="hidden md:flex flex-col justify-between items-center py-2 shrink-0 border-r border-[#e8f0eb] pr-5">
				<div className="flex flex-col items-center gap-7">
					<nav className="flex flex-col items-center gap-3">
						{navItems.map((item) => {
							const active = activeTab === item.id;
							return (
								<button
									key={item.id}
									onClick={() => setActiveTab(item.id)}
									title={item.label}
									className={cn(
										"w-11 h-11 rounded-full flex items-center justify-center transition-all relative",
										active
											? "bg-[#0d2b1e] text-white shadow-md scale-105"
											: "text-[#7aaa92] hover:text-[#0d2b1e] hover:bg-[#f0f7f3]",
									)}
								>
									{item.icon}
									{item.count !== undefined && item.count > 0 && (
										<span
											className={cn(
												"absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center",
												active
													? "bg-[#1a9e5c] text-white"
													: "bg-[#0d2b1e] text-white",
											)}
										>
											{item.count}
										</span>
									)}
								</button>
							);
						})}
					</nav>
				</div>

				{/* State Sync & User Avatar */}
				<div className="flex flex-col items-center gap-4 pt-4">
					<button
						onClick={onSync}
						disabled={loadingData}
						title="Sync on-chain state"
						className="w-8 h-8 rounded-full flex items-center justify-center text-[#1a9e5c] hover:bg-[#f0f7f3] transition-colors"
					>
						<RefreshCw
							size={14}
							className={
								loadingData ? "animate-spin text-[#1a9e5c]" : "text-[#1a9e5c]"
							}
						/>
					</button>

					<div
						className="relative cursor-pointer group"
						onClick={() => setShowDossier(!showDossier)}
						title="Toggle Merchant Dossier"
					>
						<div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0d2b1e] to-[#1a9e5c] text-white font-semibold text-xs flex items-center justify-center border-2 border-white shadow-sm uppercase">
							{username
								? username.slice(0, 2)
								: address
									? address.slice(2, 4)
									: "ME"}
						</div>
						<div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#1a9e5c] border-2 border-white" />
					</div>
				</div>
			</aside>

			{/* Mobile Header Bar */}
			<div className="md:hidden flex items-center justify-between pb-3 border-b border-[#e8f0eb]">
				<h1 className="text-base font-bold text-[#0d2b1e]">
					Secure, Automated P2P
				</h1>

				<button
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					className="p-2 rounded-full border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3]"
					aria-label="Toggle navigation"
				>
					{mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
				</button>
			</div>

			{/* Mobile Navigation Drawer */}
			{mobileMenuOpen && (
				<div className="md:hidden pb-3 border-b border-[#e8f0eb] grid grid-cols-2 gap-2">
					{navItems.map((item) => (
						<button
							key={item.id}
							onClick={() => {
								setActiveTab(item.id);
								setMobileMenuOpen(false);
							}}
							className={cn(
								"flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
								activeTab === item.id
									? "bg-[#0d2b1e] text-white"
									: "bg-[#f4f7f5] text-[#3d6b55]",
							)}
						>
							{item.icon}
							<span>{item.label}</span>
							{item.count !== undefined && item.count > 0 && (
								<span className="ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/20">
									{item.count}
								</span>
							)}
						</button>
					))}
				</div>
			)}
		</>
	);
}
