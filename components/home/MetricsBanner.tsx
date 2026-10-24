import { TrendingUp, Users, Clock } from "lucide-react";
import AnimatedCounter from "@/components/ui/AnimatedCounter";

function MetricPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col sm:flex-row items-center gap-3 px-6 py-5 border-b sm:border-b-0 sm:border-r border-[#d1e8dc] last:border-0">
			<div className="w-10 h-10 rounded-xl bg-[#f0f7f3] flex items-center justify-center shrink-0">
				{icon}
			</div>
			<div className="text-center sm:text-left">
				<div className="text-xl font-bold font-mono text-[#0d2b1e] leading-none">{value}</div>
				<div className="text-[11px] text-[#7aaa92] mt-0.5">{label}</div>
			</div>
		</div>
	);
}

export default function MetricsBanner() {
	return (
		<section className="px-4 pb-24 max-w-5xl mx-auto">
			<div className="rounded-2xl border border-[#d1e8dc] bg-white overflow-hidden shadow-sm">
				<div className="flex items-center justify-between px-6 py-3 border-b border-[#d1e8dc]">
					<div className="flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-[#22c972] net-dot" />
						<span className="text-[11px] font-mono text-[#1a9e5c] tracking-widest">LIVE NETWORK METRICS</span>
					</div>
					<span className="text-[10px] text-[#7aaa92] font-mono hidden sm:block">
						Arc Mainnet · refreshes every 5s
					</span>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3">
					<MetricPill
						icon={<TrendingUp size={18} className="text-[#1a9e5c]" />}
						label="Total Value Locked"
						value={<>$<AnimatedCounter target={4200000} /></>}
					/>
					<MetricPill
						icon={<Clock size={18} className="text-[#1a9e5c]" />}
						label="Avg. Release Time"
						value="4.8s"
					/>
					<MetricPill
						icon={<Users size={18} className="text-[#1a9e5c]" />}
						label="Active Integration Partners"
						value={<><AnimatedCounter target={34} /> Fintechs</>}
					/>
				</div>
			</div>
		</section>
	);
}
