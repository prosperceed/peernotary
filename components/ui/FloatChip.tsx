import React from "react";

interface FloatChipProps {
	children: React.ReactNode;
	style?: React.CSSProperties;
	delay?: string;
}

export default function FloatChip({ children, style, delay = "0s" }: FloatChipProps) {
	return (
		<div
			className="absolute flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-[#d1e8dc] shadow-lg shadow-green-primary/10"
			style={{ animation: `float-bob 4s ease-in-out ${delay} infinite`, ...style }}
		>
			{children}
		</div>
	);
}
