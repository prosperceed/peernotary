"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { BadgeColor, TradeStep } from "@/types";

// ─── BADGE ────────────────────────────────────────────────────────────────────
const badgeStyles: Record<BadgeColor, string> = {
	violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
	green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
	amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
	red: "bg-red-500/15 text-red-300 border-red-500/30",
	blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
	cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
	slate: "bg-slate-700/50 text-slate-400 border-slate-600/50",
};
const dotStyles: Record<BadgeColor, string> = {
	violet: "bg-violet-400",
	green: "bg-emerald-400",
	amber: "bg-amber-400",
	red: "bg-red-400",
	blue: "bg-blue-400",
	cyan: "bg-cyan-400",
	slate: "bg-slate-400",
};

interface BadgeProps {
	label: string;
	color?: BadgeColor;
	pulse?: boolean;
	className?: string;
}

export function Badge({
	label,
	color = "violet",
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
	accent = "#060809",
	trend,
}: MetricCardProps) {
	return (
		<div
			className="relative rounded-2xl border border-slate-700/50 bg-[var(--bg)] backdrop-blur-md p-5 overflow-hidden group transition-all duration-300 hover:border-violet-500/40 hover:shadow-lg"
			style={{ ["--accent" as string]: accent }}
		>
			<div
				className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
				style={{
					background: `radial-gradient(ellipse at 0% 0%, ${accent}12 0%, transparent 60%)`,
				}}
			/>
			<div className="flex items-start justify-between mb-3">
				<div
					className="w-9 h-9 rounded-xl flex items-center justify-center"
					style={{ background: `${accent}20` }}
				>
					{icon}
				</div>
				{trend !== undefined && (
					<span
						className={cn(
							"text-xs font-mono px-2 py-0.5 rounded-full",
							trend > 0
								? "bg-emerald-500/15 text-emerald-400"
								: "bg-red-500/15 text-red-400",
						)}
					>
						{trend > 0 ? "+" : ""}
						{trend}%
					</span>
				)}
			</div>
			<div className="text-2xl font-bold text-white font-mono tracking-tight">
				{value}
			</div>
			<div className="text-xs text-slate-400 mt-1">{label}</div>
			{sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
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
		<div className="flex items-center gap-1.5 mb-5">
			{steps.map((label, i) => {
				const done = i < current;
				const active = i === current;
				return (
					<React.Fragment key={i}>
						<div
							className={cn(
								"flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border-2 transition-all duration-300 flex-shrink-0",
								done
									? "border-emerald-500 bg-emerald-500 text-white"
									: active
									? "border-secondary bg-b-500/20 text-violet-300"
									: "border-slate-600 bg-slate-800 text-slate-500",
							)}
						>
							{done ? "✓" : i + 1}
						</div>
						<span
							className={cn(
								"text-[10px] whitespace-nowrap hidden sm:inline",
								done
									? "text-emerald-400"
									: active
									? "text-violet-300"
									: "text-slate-500",
							)}
						>
							{label}
						</span>
						{i < steps.length - 1 && (
							<div
								className={cn(
									"h-px flex-1 min-w-[8px] transition-all duration-500",
									done ? "bg-emerald-500/50" : "bg-slate-700",
								)}
							/>
						)}
					</React.Fragment>
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
	color = "#7C3AED",
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
					<stop offset="0%" stopColor={color} stopOpacity="0.35" />
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
		progress > 0.5 ? "#7C3AED" : progress > 0.25 ? "#F59E0B" : "#EF4444";
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
					stroke="#1E293B"
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
					fill="white"
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
					fill="#64748B"
					fontSize="9"
				>
					remaining
				</text>
			</svg>
		</div>
	);
}
