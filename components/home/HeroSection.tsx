"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import FloatChip from "@/components/ui/FloatChip";
import USDCIcon from "@/components/icons/USDCIcon";

function HeroPathsBackground() {
	return (
		<div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex items-center justify-center" aria-hidden>
			<div
				className="absolute -top-24 -right-24 w-[480px] h-[320px] rounded-full blur-3xl opacity-40"
				style={{ background: "radial-gradient(ellipse at center, rgba(34,201,114,0.22) 0%, transparent 70%)" }}
			/>
			<div
				className="absolute -bottom-24 -left-24 w-[480px] h-[320px] rounded-full blur-3xl opacity-40"
				style={{ background: "radial-gradient(ellipse at center, rgba(34,201,114,0.22) 0%, transparent 70%)" }}
			/>

			<svg
				className="w-full max-w-[1360px] h-auto px-2"
				viewBox="0 0 1360 560"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<defs>
					<linearGradient id="leftLineStrong" x1="120" y1="0" x2="416" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0" />
						<stop offset="28%" stopColor="#1a9e5c" stopOpacity="0.22" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.38" />
					</linearGradient>
					<linearGradient id="leftLineFaint" x1="120" y1="0" x2="416" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0" />
						<stop offset="35%" stopColor="#1a9e5c" stopOpacity="0.09" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.16" />
					</linearGradient>
					<linearGradient id="rightLineStrong" x1="1240" y1="0" x2="944" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0" />
						<stop offset="28%" stopColor="#1a9e5c" stopOpacity="0.22" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.38" />
					</linearGradient>
					<linearGradient id="rightLineFaint" x1="1240" y1="0" x2="944" y2="0" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0" />
						<stop offset="35%" stopColor="#1a9e5c" stopOpacity="0.09" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.16" />
					</linearGradient>
					<linearGradient id="leftBracket" x1="416" y1="186" x2="452" y2="374" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0.32" />
						<stop offset="50%" stopColor="#1a9e5c" stopOpacity="0.42" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.10" />
					</linearGradient>
					<linearGradient id="rightBracket" x1="944" y1="186" x2="908" y2="374" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#1a9e5c" stopOpacity="0.32" />
						<stop offset="50%" stopColor="#1a9e5c" stopOpacity="0.42" />
						<stop offset="100%" stopColor="#1a9e5c" stopOpacity="0.10" />
					</linearGradient>
				</defs>

				<path
					d="M 454 186 L 444 186 Q 416 186 416 214 L 416 346 Q 416 374 444 374 L 454 374"
					stroke="url(#leftBracket)"
					strokeWidth="1.35"
					strokeLinecap="round"
					fill="none"
				/>
				<path
					d="M 906 186 L 916 186 Q 944 186 944 214 L 944 346 Q 944 374 916 374 L 906 374"
					stroke="url(#rightBracket)"
					strokeWidth="1.35"
					strokeLinecap="round"
					fill="none"
				/>

				<path
					d="M 140 95 L 258 213 Q 279 234 308 234 L 416 234"
					stroke="url(#leftLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 122 110 L 252 240 Q 272 260 300 260 L 416 260"
					stroke="url(#leftLineFaint)"
					strokeWidth="1.1"
					fill="none"
				/>
				<path
					d="M 190 218 L 238 266 Q 254 282 276 282 L 416 282"
					stroke="url(#leftLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 190 346 L 238 298 Q 254 282 276 282 L 416 282"
					stroke="url(#leftLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 122 450 L 252 320 Q 272 300 300 300 L 416 300"
					stroke="url(#leftLineFaint)"
					strokeWidth="1.1"
					fill="none"
				/>
				<path
					d="M 140 465 L 258 347 Q 279 326 308 326 L 416 326"
					stroke="url(#leftLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>

				<path
					d="M 1220 95 L 1102 213 Q 1081 234 1052 234 L 944 234"
					stroke="url(#rightLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 1238 110 L 1108 240 Q 1088 260 1060 260 L 944 260"
					stroke="url(#rightLineFaint)"
					strokeWidth="1.1"
					fill="none"
				/>
				<path
					d="M 1170 218 L 1122 266 Q 1106 282 1084 282 L 944 282"
					stroke="url(#rightLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 1170 346 L 1122 298 Q 1106 282 1084 282 L 944 282"
					stroke="url(#rightLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
				<path
					d="M 1238 450 L 1108 320 Q 1088 300 1060 300 L 944 300"
					stroke="url(#rightLineFaint)"
					strokeWidth="1.1"
					fill="none"
				/>
				<path
					d="M 1220 465 L 1102 347 Q 1081 326 1052 326 L 944 326"
					stroke="url(#rightLineStrong)"
					strokeWidth="1.25"
					fill="none"
				/>
			</svg>
		</div>
	);
}

export default function HeroSection() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setVisible(true), 80);
		return () => clearTimeout(t);
	}, []);

	return (
		<section className="relative min-h-[88vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
			<HeroPathsBackground />

			<FloatChip style={{ left: "6vw", bottom: "22%" }} delay="0s">
				<Shield size={26} className="text-[#1a9e5c]" strokeWidth={1.8} />
			</FloatChip>

			<FloatChip style={{ right: "8vw", top: "18%" }} delay="1.6s">
				<USDCIcon size={28} />
			</FloatChip>

			<div
				className={cn(
					"relative z-10 w-full max-w-[460px] mx-auto flex flex-col items-center transition-all duration-700",
					visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
				)}
			>
				<div className="py-6 px-4 flex flex-col items-center">
					<span className="inline-block px-3.5 py-1 rounded-md bg-[#e8f5ee] text-xs font-medium text-[#1a9e5c] tracking-wide mb-5">
						{`{automations}`}
					</span>

					<h1 className="text-3xl sm:text-4xl font-bold text-[#0d2b1e] leading-snug tracking-tight mb-4">
						Automated{" "}
						<span style={{ color: "#1a9e5c" }}>P2P Escrow</span>
					</h1>

					<p className="text-xs sm:text-[13.5px] text-[#3d6b55] leading-relaxed max-w-[390px] mx-auto">
						Eliminate receipt fraud and settle crypto-to-fiat trades with open banking oracles and zero-knowledge proofs on Arc Chain.
					</p>
				</div>

				<div className="mt-8 flex items-center justify-center">
					<Link
						href="/trade"
						className="inline-flex items-center gap-2.5 px-7 py-3 rounded-xl font-semibold text-xs sm:text-sm text-white transition-all duration-200 shadow-lg shadow-green-primary/20 hover:shadow-xl hover:shadow-green-primary/25 active:scale-[0.97]"
						style={{ background: "linear-gradient(180deg, #22c972 0%, #1a9e5c 100%)" }}
					>
						Launch App
						<ArrowRight size={15} className="shrink-0" />
					</Link>
				</div>
			</div>

			<div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-30">
				<span className="text-[10px] text-[#7aaa92] tracking-widest uppercase">scroll</span>
				<div className="w-px h-8 bg-gradient-to-b from-[#22c972] to-transparent" />
			</div>
		</section>
	);
}
