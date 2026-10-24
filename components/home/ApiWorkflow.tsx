import Link from "next/link";
import { Shield, ArrowRight, Code2, Webhook, Key, BarChart3, Lock, CheckCircle2 } from "lucide-react";
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

function WorkflowNode({ icon, label, side }: { icon: React.ReactNode; label: string; side: "left" | "right" }) {
	return (
		<div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-[#d1e8dc] shadow-sm w-full sm:w-44", side === "right" && "flex-row-reverse")}>
			<div className="w-8 h-8 rounded-lg bg-[#f0f7f3] flex items-center justify-center shrink-0">
				{icon}
			</div>
			<span className="text-xs font-semibold text-[#3d6b55]">{label}</span>
		</div>
	);
}

function ConnectorLines({ side }: { side: "left" | "right" }) {
	return (
		<div className={cn("hidden lg:flex flex-col gap-3", side === "left" ? "items-end mr-4" : "items-start ml-4")}>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					className="h-px w-16 xl:w-24"
					style={{
						background: side === "left"
							? "linear-gradient(90deg, transparent, rgba(26,158,92,0.35))"
							: "linear-gradient(90deg, rgba(26,158,92,0.35), transparent)",
					}}
				/>
			))}
		</div>
	);
}

function EscrowCore() {
	return (
		<div
			className="flex flex-col items-center justify-center w-40 h-40 sm:w-44 sm:h-44 rounded-2xl border-2 bg-white shadow-xl shadow-green-primary/10 z-10"
			style={{ borderColor: "rgba(26,158,92,0.25)" }}
		>
			<div
				className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
				style={{ background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)" }}
			>
				<Shield size={26} className="text-white" strokeWidth={1.8} />
			</div>
			<span className="text-xs font-bold text-[#0d2b1e]">Arc Escrow</span>
			<span className="text-[10px] text-[#7aaa92] mt-0.5">Smart Contract</span>
		</div>
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
						{NODES_LEFT.map((node) => (
							<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="left" />
						))}
					</div>

					<div className="flex flex-row lg:flex-col items-center gap-0 shrink-0">
						<ConnectorLines side="left" />
						<EscrowCore />
						<ConnectorLines side="right" />
					</div>

					<div className="flex flex-col gap-3 w-full lg:w-auto lg:items-start">
						{NODES_RIGHT.map((node) => (
							<WorkflowNode key={node.label} icon={node.icon} label={node.label} side="right" />
						))}
					</div>
				</div>

				<div className="mt-12 text-center">
					<Link
						href="/docs"
						className="inline-flex items-center gap-1.5 text-sm text-[#1a9e5c] hover:text-[#22c972] font-medium transition-colors duration-150"
					>
						Read Documentation
						<ArrowRight size={13} className="shrink-0" />
					</Link>
				</div>
			</div>
		</section>
	);
}
