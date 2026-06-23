"use client";

import { useState } from "react";
import { Shield, Zap, Lock } from "lucide-react";
import GlobalNav from "@/components/shared/GlobalNav";
import Footer from "@/components/shared/Footer";
import Homepage from "@/components/Homepage";
import DevDashboard from "@/components/dashboard/DevDashboard";
import TradingWidget from "@/components/trading/TradingWidget";
import type { View } from "@/types";

export default function HomePage() {
	const [currentView, setCurrentView] = useState<View>("home");

	return (
		<div className="min-h-screen flex flex-col bg-[#080C14]">
			{/* ── Global sticky navbar ───────────────────────────────────────────── */}
			<GlobalNav currentView={currentView} setCurrentView={setCurrentView} />

			<main className="flex-1">
				{/* ── HOME ─────────────────────────────────────────────────────────── */}
				{currentView === "home" && <Homepage setCurrentView={setCurrentView} />}

				{/* ── P2P TRADING PORTAL ───────────────────────────────────────────── */}
				{currentView === "trade" && (
					<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
						<div className="mb-6 text-center">
							<h1 className="text-xl font-bold text-white">
								P2P Trading Portal
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								Buy USDC with Naira · Secured by Arc Network smart contracts
							</p>
						</div>

						<div className="flex flex-col items-center">
							<div className="w-full max-w-md">
								{/* Widget card */}
								<div className="rounded-2xl border border-slate-700/50 bg-[#0D1322]/80 backdrop-blur-md p-6 shadow-2xl shadow-violet-500/5">
									<TradingWidget />
								</div>

								{/* Trust signals */}
								<div className="mt-4 grid grid-cols-3 gap-3">
									{[
										{
											icon: <Lock size={16} className="text-violet-400" />,
											label: "End-to-End Encrypted",
										},
										{
											icon: <Zap size={16} className="text-emerald-400" />,
											label: "Arc Network Secured",
										},
										{
											icon: <Shield size={16} className="text-cyan-400" />,
											label: "Anti-Fraud Engine",
										},
									].map(({ icon, label }) => (
										<div
											key={label}
											className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center"
										>
											{icon}
											<span className="text-[10px] text-slate-500 leading-tight">
												{label}
											</span>
										</div>
									))}
								</div>

								{/* Seller info strip */}
								<div className="mt-4 flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/30 border border-slate-800/50 text-xs">
									<div className="flex items-center gap-2 text-slate-400">
										<div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-[10px] font-bold text-violet-300">
											O
										</div>
										<span>OluwaseunAd_Arc</span>
										<span className="text-slate-600">·</span>
										<span className="text-emerald-400">
											99.1% completion rate
										</span>
									</div>
									<div className="text-slate-500 font-mono">4,821 trades</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* ── DEVELOPER PORTAL ────────────────────────────────────────────── */}
				{currentView === "dev" && (
					<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
						<div className="mb-6">
							<h1 className="text-xl font-bold text-white">
								Developer Dashboard
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								Monitor your Arc P2P integration · API status, escrow pools, and
								live transaction feed
							</p>
						</div>
						<DevDashboard />
					</div>
				)}
			</main>

			<Footer />
		</div>
	);
}
