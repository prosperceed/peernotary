"use client";

import Link from "next/link";
import { Shield, ArrowRight, Code2, Webhook, Key, BarChart3, Lock, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import SectionHeader from "@/components/ui/SectionHeader";

const NODES_LEFT = [
	{ icon: <Key size={18} className="text-green-primary" />, label: "API Key Auth" },
	{ icon: <Webhook size={18} className="text-green-primary" />, label: "Webhook Events" },
	{ icon: <Code2 size={18} className="text-green-primary" />, label: "SDK Integration" },
];

const NODES_RIGHT = [
	{ icon: <Lock size={18} className="text-green-primary" />, label: "Escrow Lock" },
	{ icon: <CheckCircle2 size={18} className="text-green-primary" />, label: "Auto-Release" },
	{ icon: <BarChart3 size={18} className="text-green-primary" />, label: "Analytics" },
];

function WorkflowNode({
	icon,
	label,
	side,
	index,
}: {
	icon: React.ReactNode;
	label: string;
	side: "left" | "right";
	index: number;
}) {
	return (
		<motion.div
			className={cn(
				"flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-[#d1e8dc] shadow-sm w-full sm:w-44 cursor-default",
				side === "right" && "flex-row-reverse",
			)}
			initial={{ opacity: 0, x: side === "left" ? -24 : 24 }}
			whileInView={{ opacity: 1, x: 0 }}
			viewport={{ once: true, margin: "-30px" }}
			transition={{ duration: 0.5, delay: 0.15 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
			whileHover={{
				scale: 1.04,
				boxShadow: "0 10px 20px -5px rgba(26, 158, 92, 0.15)",
				borderColor: "rgba(34, 201, 114, 0.5)",
				transition: { duration: 0.2 },
			}}
		>
			<div className="w-8 h-8 rounded-lg bg-[#f0f7f3] flex items-center justify-center shrink-0">
				{icon}
			</div>
			<span className="text-xs font-semibold text-[#3d6b55]">{label}</span>
		</motion.div>
	);
}

function ConnectorLines({ side }: { side: "left" | "right" }) {
	return (
		<div className={cn("hidden lg:flex flex-col gap-3", side === "left" ? "items-end mr-4" : "items-start ml-4")}>
			{[0, 1, 2].map((i) => (
				<motion.div
					key={i}
					className="h-px w-16 xl:w-24 overflow-hidden relative"
					style={{
						background:
							side === "left"
								? "linear-gradient(90deg, transparent, rgba(26,158,92,0.35))"
								: "linear-gradient(90deg, rgba(26,158,92,0.35), transparent)",
					}}
					initial={{ scaleX: 0 }}
					whileInView={{ scaleX: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
				>
					{/* Data flow particle on lines */}
					<motion.div
						className="absolute top-0 bottom-0 w-6"
						style={{
							background:
								side === "left"
									? "linear-gradient(90deg, transparent, #22c972, transparent)"
									: "linear-gradient(90deg, transparent, #22c972, transparent)",
						}}
						animate={{
							x: side === "left" ? [-20, 100] : [100, -20],
						}}
						transition={{
							duration: 2.2,
							repeat: Infinity,
							ease: "easeInOut",
							delay: i * 0.4,
						}}
					/>
				</motion.div>
			))}
		</div>
	);
}

function EscrowCore() {
	return (
		<motion.div
			className="relative flex flex-col items-center justify-center w-40 h-40 sm:w-44 sm:h-44 rounded-2xl border-2 bg-white shadow-xl shadow-green-primary/10 z-10 cursor-pointer"
			style={{ borderColor: "rgba(26,158,92,0.25)" }}
			initial={{ opacity: 0, scale: 0.85 }}
			whileInView={{ opacity: 1, scale: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
			whileHover={{
				scale: 1.05,
				boxShadow: "0 20px 35px -10px rgba(26, 158, 92, 0.25)",
				borderColor: "rgba(34, 201, 114, 0.6)",
			}}
		>
			{/* Subtle breathing glow ring around core */}
			<motion.div
				className="absolute -inset-2 rounded-3xl border border-green-500/20 -z-10"
				animate={{
					scale: [1, 1.06, 1],
					opacity: [0.3, 0.8, 0.3],
				}}
				transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
			/>

			<motion.div
				className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
				style={{ background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)" }}
				animate={{ y: [0, -3, 0] }}
				transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
			>
				<Shield size={26} className="text-white" strokeWidth={1.8} />
			</motion.div>
			<span className="text-xs font-bold text-[#0d2b1e]">Arc Escrow</span>
			<span className="text-[10px] text-[#7aaa92] mt-0.5">Smart Contract</span>
		</motion.div>
	);
}

export default function ApiWorkflow() {
	return (
		<section className="relative px-4 py-24 overflow-hidden">
			<div
				className="absolute top-0 left-0 w-72 h-72 rounded-full pointer-events-none"
				style={{ background: "radial-gradient(ellipse at top left, rgba(34,201,114,0.12) 0%, transparent 70%)" }}
				aria-hidden
			/>
			<div
				className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
				style={{ background: "radial-gradient(ellipse at top right, rgba(34,201,114,0.08) 0%, transparent 70%)" }}
				aria-hidden
			/>

			<div className="max-w-5xl mx-auto">
				<SectionHeader
					tag="[api workflow]"
					heading="One-click escrow automation"
					subtext="Integrate Arc P2P escrow into any fintech app with a single API call. Automate fiat verification, fund locking, and settlement effortlessly."
				/>

				<div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-4">
					<div className="flex flex-col gap-3 w-full lg:w-auto lg:items-end">
						{NODES_LEFT.map((node, index) => (
							<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="left" index={index} />
						))}
					</div>

					<div className="flex flex-row lg:flex-col items-center gap-0 shrink-0">
						<ConnectorLines side="left" />
						<EscrowCore />
						<ConnectorLines side="right" />
					</div>

					<div className="flex flex-col gap-3 w-full lg:w-auto lg:items-start">
						{NODES_RIGHT.map((node, index) => (
							<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="right" index={index} />
						))}
					</div>
				</div>

				<motion.div
					className="mt-12 text-center"
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.5 }}
				>
					<Link
						href="/docs"
						className="group inline-flex items-center gap-1.5 text-sm text-[#1a9e5c] hover:text-[#22c972] font-medium transition-colors duration-150"
					>
						Read Documentation
						<motion.span
							className="inline-block"
							animate={{ x: [0, 3, 0] }}
							transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
						>
							<ArrowRight size={13} className="shrink-0" />
						</motion.span>
					</Link>
				</motion.div>
			</div>
		</section>
	);
}
