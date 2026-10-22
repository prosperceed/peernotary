import TradingWidget from "@/components/trading/TradingWidget";
import { Lock, Shield, Zap } from "lucide-react";

export default function TradePage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
				<div className="mb-6 text-center">
					<h1 className="text-xl font-bold text-[#0d2b1e]">P2P Trading Portal</h1>
					<p className="text-sm text-[#7aaa92] mt-1">
						Buy USDC with Naira · Secured by Arc Network smart contracts
					</p>
				</div>

				<div className="flex flex-col items-center">
					<div className="w-full max-w-md">
						{/* Widget card */}
						<div className="rounded-2xl border border-[#d1e8dc] bg-white shadow-lg shadow-green-primary/5 p-6">
							<TradingWidget />
						</div>

						{/* Trust signals */}
						<div className="mt-4 grid grid-cols-3 gap-3">
							{[
								{
									icon: <Lock size={16} className="text-[#1a9e5c]" />,
									label: "End-to-End Encrypted",
								},
								{
									icon: <Zap size={16} className="text-[#1a9e5c]" />,
									label: "Arc Network Secured",
								},
								{
									icon: <Shield size={16} className="text-[#1a9e5c]" />,
									label: "Anti-Fraud Engine",
								},
							].map(({ icon, label }) => (
								<div
									key={label}
									className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-[#d1e8dc] text-center"
								>
									{icon}
									<span className="text-[10px] text-[#7aaa92] leading-tight">
										{label}
									</span>
								</div>
							))}
						</div>

						{/* Seller info strip */}
						<div className="mt-4 flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-[#d1e8dc] text-xs">
							<div className="flex items-center gap-2 text-[#3d6b55]">
								<div className="w-6 h-6 rounded-full bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center text-[10px] font-bold text-[#1a9e5c]">
									O
								</div>
								<span>OluwaseunAd_Arc</span>
								<span className="text-[#d1e8dc]">·</span>
								<span className="text-[#1a9e5c]">99.1% completion rate</span>
							</div>
							<div className="text-[#7aaa92] font-mono">4,821 trades</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
