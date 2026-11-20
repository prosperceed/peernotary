"use client";

import { motion } from "framer-motion";

interface SectionHeaderProps {
	tag: string;
	heading: string;
	subtext: string;
}

export default function SectionHeader({ tag, heading, subtext }: SectionHeaderProps) {
	return (
		<motion.div
			className="text-center mb-16"
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
		>
			<motion.span
				className="inline-block px-3 py-1 rounded-full border border-[#d1e8dc] bg-[#f0f7f3] text-[11px] font-mono text-[#1a9e5c] tracking-widest mb-4 shadow-sm"
				initial={{ scale: 0.9, opacity: 0 }}
				whileInView={{ scale: 1, opacity: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.5, delay: 0.1 }}
			>
				{tag}
			</motion.span>
			<h2 className="text-3xl sm:text-4xl font-black text-[#0d2b1e] tracking-tight mb-3">
				{heading}
			</h2>
			<p className="text-[#3d6b55] max-w-md mx-auto text-sm leading-relaxed">
				{subtext}
			</p>
		</motion.div>
	);
}
