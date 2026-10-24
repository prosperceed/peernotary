"use client";

import React from "react";
import { motion } from "framer-motion";

interface FloatChipProps {
	children: React.ReactNode;
	style?: React.CSSProperties;
	delay?: number;
}

export default function FloatChip({ children, style, delay = 0 }: FloatChipProps) {
	return (
		<motion.div
			className="absolute flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/95 backdrop-blur-md border border-[#d1e8dc] shadow-lg shadow-green-primary/10 select-none cursor-pointer z-20"
			style={style}
			initial={{ opacity: 0, scale: 0.75, y: 15 }}
			animate={{
				opacity: 1,
				scale: 1,
				y: [0, -10, 0],
			}}
			transition={{
				opacity: { duration: 0.8, delay },
				scale: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] },
				y: {
					duration: 4.5,
					repeat: Infinity,
					repeatType: "mirror",
					ease: "easeInOut",
					delay,
				},
			}}
			whileHover={{
				scale: 1.12,
				boxShadow: "0 20px 30px -10px rgba(26, 158, 92, 0.28)",
				transition: { type: "spring", stiffness: 400, damping: 17 },
			}}
			whileTap={{ scale: 0.95 }}
		>
			{children}
		</motion.div>
	);
}
