"use client";

import { TrendingUp, Users, Clock } from "lucide-react";
import { motion } from "framer-motion";
import AnimatedCounter from "@/components/ui/AnimatedCounter";

function MetricPill({
	icon,
	label,
	value,
	index,
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	index: number;
}) {
	return (
		<motion.div
			className="flex flex-col sm:flex-row items-center gap-3 px-6 py-5 border-b sm:border-b-0 sm:border-r border-[#d1e8dc] last:border-0 transition-colors duration-200 hover:bg-[#f9fcfb]"
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.5, delay: 0.15 + index * 0.15, ease: [0.16, 1, 0.3, 1] }}
			whileHover={{ scale: 1.02 }}
		>
			<motion.div
				className="w-10 h-10 rounded-xl bg-[#f0f7f3] flex items-center justify-center shrink-0"
				whileHover={{ rotate: 10, scale: 1.1 }}
				transition={{ type: "spring", stiffness: 400 }}
			>
				{icon}
			</motion.div>
			<div className="text-center sm:text-left">
				<div className="text-xl font-bold font-mono text-[#0d2b1e] leading-none">{value}</div>
				<div className="text-[11px] text-[#7aaa92] mt-0.5">{label}</div>
			</div>
		</motion.div>
	);
}

export default function MetricsBanner() {
	return (
		<section className="px-4 pb-24 max-w-5xl mx-auto">
			<motion.div
				className="rounded-2xl border border-[#d1e8dc] bg-white overflow-hidden shadow-sm"
				initial={{ opacity: 0, y: 28 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, margin: "-40px" }}
				transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
			>
				<div className="flex items-center justify-between px-6 py-3 border-b border-[#d1e8dc] bg-[#fcfefd]">
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
						index={0}
					/>
					<MetricPill
						icon={<Clock size={18} className="text-[#1a9e5c]" />}
						label="Avg. Release Time"
						value="4.8s"
						index={1}
					/>
					<MetricPill
						icon={<Users size={18} className="text-[#1a9e5c]" />}
						label="Active Integration Partners"
						value={<><AnimatedCounter target={34} /> Fintechs</>}
						index={2}
					/>
				</div>
			</motion.div>
		</section>
	);
}
