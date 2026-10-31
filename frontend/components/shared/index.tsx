"use client";

import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeColor, TradeStep } from "@/types";

// ─── BADGE ────────────────────────────────────────────────────────────────────
const badgeStyles: Record<BadgeColor, string> = {
	violet: "bg-purple-50 text-purple-600 border-purple-200",
	green:  "bg-[#f0f7f3] text-[#1a9e5c] border-[#d1e8dc]",
	amber:  "bg-amber-50 text-amber-600 border-amber-200",
	red:    "bg-red-50 text-red-500 border-red-200",
	blue:   "bg-blue-50 text-blue-600 border-blue-200",
	cyan:   "bg-cyan-50 text-cyan-600 border-cyan-200",
	slate:  "bg-[#f5f9f7] text-[#7aaa92] border-[#d1e8dc]",
};
const dotStyles: Record<BadgeColor, string> = {
	violet: "bg-purple-500",
	green:  "bg-[#22c972]",
	amber:  "bg-amber-400",
	red:    "bg-red-400",
	blue:   "bg-blue-400",
	cyan:   "bg-cyan-400",
	slate:  "bg-[#7aaa92]",
};

interface BadgeProps {
	label: string;
	color?: BadgeColor;
	pulse?: boolean;
	className?: string;
}

export function Badge({
	label,
	color = "green",
	pulse = false,
	className,
}: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
				badgeStyles[color],
				className,
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full flex-shrink-0",
					dotStyles[color],
					pulse && "animate-pulse",
				)}
			/>
			{label}
		</span>
	);
}

// ─── METRIC CARD ──────────────────────────────────────────────────────────────
interface MetricCardProps {
	label: string;
	value: string;
	sub?: string;
	icon: React.ReactNode;
	accent?: string;
	trend?: number;
}

export function MetricCard({
	label,
	value,
	sub,
	icon,
	accent = "#1a9e5c",
	trend,
}: MetricCardProps) {
	return (
		<div
			className="relative rounded-lg border border-[#d1e8dc] bg-white p-4 overflow-hidden transition-colors"
			style={{ ["--accent" as string]: accent }}
		>
			<div className="flex items-start justify-between mb-2.5">
				<div
					className="w-8 h-8 rounded-lg flex items-center justify-center"
					style={{ background: `${accent}15` }}
				>
					{icon}
				</div>
				{trend !== undefined && (
					<span
						className={cn(
							"text-[11px] font-mono px-2 py-0.5 rounded",
							trend > 0
								? "bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]"
								: "bg-red-50 text-red-500 border border-red-200",
						)}
					>
						{trend > 0 ? "+" : ""}
						{trend}%
					</span>
				)}
			</div>
			<div className="text-lg font-semibold text-[#0d2b1e] font-mono tracking-tight">
				{value}
			</div>
			<div className="text-xs text-[#3d6b55] mt-1">{label}</div>
			{sub && <div className="text-[11px] text-[#7aaa92] mt-0.5">{sub}</div>}
		</div>
	);
}

// ─── STEP BAR ─────────────────────────────────────────────────────────────────
interface StepBarProps {
	current: TradeStep;
	steps: string[];
}

export function StepBar({ current, steps }: StepBarProps) {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
			{steps.map((label, i) => {
				const done = i < current;
				const active = i === current;
				return (
					<div
						key={label}
						className={cn(
							"flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors min-w-0",
							done
								? "border-[#1a9e5c]/40 bg-[#f0f7f3] text-[#0d2b1e]"
								: active
								? "border-[#1a9e5c] bg-[#1a9e5c] text-white"
								: "border-[#d1e8dc] bg-[#fbfdfc] text-[#7aaa92]",
						)}
					>
						<span
							className={cn(
								"w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-semibold shrink-0",
								done
									? "bg-[#1a9e5c] text-white"
									: active
									? "bg-white/20 text-white"
									: "bg-white border border-[#d1e8dc] text-[#7aaa92]",
							)}
						>
							{done ? "✓" : i + 1}
						</span>
						<span className="text-[11px] font-medium truncate">{label}</span>
					</div>
				);
			})}
		</div>
	);
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
interface SparkLineProps {
	data: number[];
	color?: string;
	height?: number;
}

export function SparkLine({
	data,
	color = "#1a9e5c",
	height = 60,
}: SparkLineProps) {
	const max = Math.max(...data);
	const min = Math.min(...data);
	const range = max - min || 1;
	const W = 300,
		H = height;

	const points = data.map((v, i) => {
		const x = (i / (data.length - 1)) * W;
		const y = H - ((v - min) / range) * (H - 12) - 6;
		return [x, y] as [number, number];
	});

	const polyline = points.map(([x, y]) => `${x},${y}`).join(" ");
	const area = `0,${H} ${polyline} ${W},${H}`;
	const gradId = `grad-${color.replace("#", "")}`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			style={{ height, display: "block" }}
		>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.25" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<polygon points={area} fill={`url(#${gradId})`} />
			<polyline
				points={polyline}
				fill="none"
				stroke={color}
				strokeWidth="2.5"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ─── COUNTDOWN RING ───────────────────────────────────────────────────────────
interface CountdownRingProps {
	seconds: number;
	total?: number;
}

export function CountdownRing({ seconds, total = 300 }: CountdownRingProps) {
	const r = 48,
		cx = 56,
		cy = 56;
	const circ = 2 * Math.PI * r;
	const progress = seconds / total;
	const offset = circ * (1 - progress);
	const color =
		progress > 0.5 ? "#1a9e5c" : progress > 0.25 ? "#F59E0B" : "#EF4444";
	const mins = Math.floor(seconds / 60);
	const secs = String(seconds % 60).padStart(2, "0");

	return (
		<div className="flex justify-center my-2">
			<svg width="112" height="112" viewBox="0 0 112 112">
				<circle
					cx={cx}
					cy={cy}
					r={r}
					fill="none"
					stroke="#d1e8dc"
					strokeWidth="8"
				/>
				<circle
					cx={cx}
					cy={cy}
					r={r}
					fill="none"
					stroke={color}
					strokeWidth="8"
					strokeDasharray={circ.toFixed(1)}
					strokeDashoffset={offset.toFixed(1)}
					strokeLinecap="round"
					transform={`rotate(-90 ${cx} ${cy})`}
					style={{
						transition: "stroke-dashoffset 1s linear, stroke 0.5s ease",
					}}
				/>
				<text
					x={cx}
					y={cy - 5}
					textAnchor="middle"
					fill="#0d2b1e"
					fontSize="17"
					fontWeight="700"
					fontFamily="monospace"
				>
					{mins}:{secs}
				</text>
					<text
						x={cx}
						y={cy + 13}
						textAnchor="middle"
						fill="#7aaa92"
						fontSize="9"
					>
						remaining
					</text>
				</svg>
			</div>
		);
}

// ─── SILEO CAPSULE TOAST ALERT ────────────────────────────────────────────────
export interface ToastAlertProps {
	type: "success" | "error" | "info" | "warning";
	message: string | null | undefined;
	title?: string;
	onClose: () => void;
	autoHideMs?: number;
}

export function ToastAlert({
	type,
	message,
	title,
	onClose,
	autoHideMs = 5000,
}: ToastAlertProps) {
	useEffect(() => {
		if (!message) return;
		const timer = window.setTimeout(() => {
			onClose();
		}, autoHideMs);
		return () => window.clearTimeout(timer);
	}, [message, autoHideMs, onClose]);

	const palette = {
		success: {
			border: "border-[#1a9e5c]/40",
			iconBg: "bg-[#f0f7f3] text-[#1a9e5c] border-[#d1e8dc]",
			Icon: CheckCircle2,
		},
		error: {
			border: "border-red-300",
			iconBg: "bg-red-50 text-red-600 border-red-200",
			Icon: AlertTriangle,
		},
		warning: {
			border: "border-amber-300",
			iconBg: "bg-amber-50 text-amber-700 border-amber-200",
			Icon: AlertTriangle,
		},
		info: {
			border: "border-[#d1e8dc]",
			iconBg: "bg-[#f0f7f3] text-[#1a9e5c] border-[#d1e8dc]",
			Icon: Info,
		},
	}[type];

	const IconComponent = palette.Icon;

	return (
		<AnimatePresence>
			{message && (
				<div className="fixed top-5 left-1/2 -translate-x-1/2 z-[150] w-auto max-w-[92vw] pointer-events-none flex justify-center">
					<motion.div
						key={message}
						initial={{ opacity: 0, y: -22, scale: 0.92 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -16, scale: 0.94 }}
						transition={{
							type: "spring",
							stiffness: 460,
							damping: 32,
							mass: 0.7,
						}}
						className={cn(
							"pointer-events-auto relative inline-flex items-center gap-2.5 rounded-full border bg-white/95 backdrop-blur-md shadow-lg shadow-[#0d2b1e]/10 py-1.5 px-3 sm:px-3.5",
							palette.border,
						)}
					>
						<div
							className={cn(
								"w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
								palette.iconBg,
							)}
						>
							<IconComponent size={12} strokeWidth={2.5} />
						</div>

						<div className="flex items-center gap-1.5 min-w-0 text-xs">
							{title && (
								<span className="font-semibold text-[#0d2b1e] shrink-0">
									{title}
								</span>
							)}
							{title && <span className="text-[#7aaa92] shrink-0">·</span>}
							<span className="text-[#0d2b1e] font-medium truncate max-w-[240px] sm:max-w-md">
								{message}
							</span>
						</div>

						<button
							type="button"
							onClick={onClose}
							aria-label="Dismiss notification"
							className="p-1 rounded-full text-[#7aaa92] hover:text-[#0d2b1e] hover:bg-[#f0f7f3] transition-colors shrink-0 -mr-1"
						>
							<X size={12} strokeWidth={2.5} />
						</button>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
