"use client";

import type { DashboardStats } from "./types";

interface DashboardKpiCardsProps {
	stats: DashboardStats;
	activeEscrowsCount: number;
	onReroute: () => void;
}

export function DashboardKpiCards({
	stats,
	activeEscrowsCount,
	onReroute,
}: DashboardKpiCardsProps) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			{/* Card 1: Balance Hero Card */}
			<div className="rounded-[26px] bg-gradient-to-br from-[#1a9e5c] via-[#15854c] to-[#0d2b1e] text-white p-5 shadow-sm flex flex-col justify-between min-h-[148px] relative overflow-hidden">
				<div className="flex items-center justify-between text-xs">
					<span className="font-medium text-white/85">Balance</span>
					<span className="text-[10px] font-mono uppercase tracking-wider text-white/70">
						Arc Testnet
					</span>
				</div>

				<div className="my-2">
					<div className="text-xl sm:text-2xl font-bold font-mono tracking-tight">
						{stats.walletUsdc.toLocaleString("en-US", {
							minimumFractionDigits: 1,
							maximumFractionDigits: 2,
						})}{" "}
						<span className="text-sm font-normal text-white/80">USDC</span>
					</div>
				</div>

				<div className="rounded-full bg-black/25 backdrop-blur-sm border border-white/10 px-3.5 py-1.5 flex items-center justify-between text-[11px]">
					<div className="flex items-center gap-1.5">
						<div className="w-4 h-4 rounded-full bg-white text-[#1a9e5c] flex items-center justify-center text-[10px] font-bold">
							✓
						</div>
						<span className="text-white/90 font-mono">
							≈ ₦{stats.walletNgn.toLocaleString("en-NG")}
						</span>
					</div>
					<span className="text-white/75">Liquid ready</span>
				</div>
			</div>

			{/* Card 2: Settled Volume Card */}
			<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px]">
				<div className="text-xs font-medium text-[#7aaa92]">Settled Volume</div>
				<div className="my-2">
					<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
						₦{stats.totalVolumeNgn.toLocaleString("en-NG")}
					</div>
				</div>
				<div className="flex items-center gap-1.5 text-[11px] font-mono">
					<span className="px-2.5 py-0.5 rounded-full bg-[#f4f7f5] text-[#3d6b55]">
						{stats.completedCount} Orders
					</span>
					<span className="px-2.5 py-0.5 rounded-full bg-[#f4f7f5] text-[#3d6b55]">
						${stats.totalVolumeUsdc.toFixed(0)}
					</span>
					<span className="px-2.5 py-0.5 rounded-full bg-[#1a9e5c] text-white font-medium">
						100% SLA
					</span>
				</div>
			</div>

			{/* Card 3: Escrow Utilization Card */}
			<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px]">
				<div className="flex items-center justify-between text-xs">
					<span className="font-medium text-[#7aaa92]">
						Escrow Utilization
					</span>
					<span className="text-[11px] font-mono text-[#1a9e5c]">
						{activeEscrowsCount} Active
					</span>
				</div>
				<div className="my-1">
					<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
						{activeEscrowsCount > 0 ? "42.5%" : "0.0%"}{" "}
						<span className="text-xs font-normal text-[#7aaa92]">Utilized</span>
					</div>
				</div>
				<div>
					<div className="flex h-2 w-full rounded-full overflow-hidden bg-[#eef4f0] gap-1 my-1">
						<div
							className="h-full bg-[#1a9e5c] rounded-full"
							style={{ width: "45%" }}
						/>
						<div
							className="h-full bg-[#0d2b1e] rounded-full"
							style={{ width: "30%" }}
						/>
						<div
							className="h-full bg-[#4dd68c] rounded-full"
							style={{ width: "25%" }}
						/>
					</div>
					<div className="flex items-center justify-between text-[10px] text-[#7aaa92] pt-0.5">
						<span>GTBank (60%)</span>
						<span>OPay (40%)</span>
						<button
							onClick={onReroute}
							className="font-semibold text-[#1a9e5c] hover:underline"
						>
							Reroute
						</button>
					</div>
				</div>
			</div>

			{/* Card 4: Avg Release SLA Card */}
			<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px] relative overflow-hidden">
				<div className="text-xs font-medium text-[#7aaa92]">
					Avg Release SLA
				</div>
				<div className="my-1">
					<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
						4.1s
					</div>
					<div className="mt-1 w-fit rounded-full bg-[#1a9e5c] text-white text-[10px] font-semibold px-2 py-0.5">
						Top 1%
					</div>
				</div>

				<div className="absolute right-3 bottom-2 pointer-events-none">
					<svg viewBox="0 0 100 55" className="w-20 h-12">
						<path
							d="M 10 50 A 40 40 0 0 1 90 50"
							fill="none"
							stroke="#e2f0e8"
							strokeWidth="8"
							strokeLinecap="round"
						/>
						<path
							d="M 10 50 A 40 40 0 0 1 76 22"
							fill="none"
							stroke="#1a9e5c"
							strokeWidth="8"
							strokeLinecap="round"
						/>
						<line
							x1="50"
							y1="50"
							x2="78"
							y2="20"
							stroke="#1a9e5c"
							strokeWidth="3.5"
							strokeLinecap="round"
						/>
						<circle cx="50" cy="50" r="4.5" fill="#0d2b1e" />
					</svg>
				</div>
			</div>
		</div>
	);
}
