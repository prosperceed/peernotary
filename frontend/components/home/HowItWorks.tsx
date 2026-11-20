"use client";

import { motion } from "framer-motion";
import SectionHeader from "@/components/ui/SectionHeader";
import {
	IconIntegrate,
	IconVerify,
	IconSettle,
} from "@/components/icons/StepIcons";

const STEPS = [
	{
		icon: <IconIntegrate />,
		title: "Integrate the API",
		description:
			"Drop in our SDK or call the REST API directly. Generate your API key from the developer dashboard and start accepting P2P trade requests in minutes.",
	},
	{
		icon: <IconVerify />,
		title: "Verify Fiat Payment",
		description:
			"The oracle confirms fiat receipt through Open Banking webhooks or a ZK web proof withtout screenshots, manual checks, or fraud vectors.",
	},
	{
		icon: <IconSettle />,
		title: "Auto-Release Escrow",
		description:
			"Once proof is verified on-chain, USDC is released instantly to the seller. Disputes route to on-chain arbitration with cryptographic evidence.",
	},
];

function DashedConnector({ index }: { index: number }) {
	return (
		<svg
			className="hidden lg:block w-24 xl:w-32 shrink-0 overflow-visible"
			height="24"
			viewBox="0 0 96 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
		>
			<motion.path
				d="M4 20 Q 48 4 92 20"
				stroke="#22c972"
				strokeWidth="1.5"
				strokeDasharray="5 4"
				strokeLinecap="round"
				opacity="0.5"
				fill="none"
				initial={{ pathLength: 0, opacity: 0 }}
				whileInView={{ pathLength: 1, opacity: 0.5 }}
				viewport={{ once: true }}
				transition={{ duration: 0.9, delay: 0.3 + index * 0.2 }}
			/>
			<motion.circle
				cx="92"
				cy="20"
				r="3"
				fill="#22c972"
				initial={{ scale: 0, opacity: 0 }}
				whileInView={{ scale: 1, opacity: 0.7 }}
				viewport={{ once: true }}
				transition={{ duration: 0.4, delay: 0.8 + index * 0.2 }}
			/>
		</svg>
	);
}

function StepCard({
	icon,
	title,
	description,
	index,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	index: number;
}) {
	return (
		<motion.div
			className="group relative flex flex-col items-center text-center w-full lg:w-72 xl:w-80 px-6 pt-8 pb-7 rounded-2xl transition-colors duration-300 hover:bg-white/60"
			initial={{ opacity: 0, y: 32 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{
				duration: 0.6,
				delay: index * 0.18,
				ease: [0.16, 1, 0.3, 1],
			}}
			whileHover={{ y: -6, transition: { duration: 0.25 } }}
		>
			<div className="relative mb-6">
				<motion.div
					className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center transition-all duration-300 group-hover:border-solid group-hover:shadow-lg group-hover:shadow-green-primary/10"
					style={{
						borderColor: "rgba(34,201,114,0.4)",
						background: "rgba(240,247,243,0.7)",
					}}
					whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
					transition={{ duration: 0.4 }}
				>
					{icon}
				</motion.div>
				<motion.span
					className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm"
					style={{
						background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
					}}
					initial={{ scale: 0 }}
					whileInView={{ scale: 1 }}
					viewport={{ once: true }}
					transition={{
						type: "spring",
						stiffness: 500,
						delay: 0.3 + index * 0.15,
					}}
				>
					{index + 1}
				</motion.span>
			</div>
			<h3 className="text-base font-bold text-[#0d2b1e] mb-2 tracking-tight group-hover:text-[#1a9e5c] transition-colors duration-200">
				{title}
			</h3>
			<p className="text-[13px] text-[#3d6b55] leading-relaxed">
				{description}
			</p>
		</motion.div>
	);
}

export default function HowItWorks() {
	return (
		<section className="relative px-4 py-24 overflow-hidden">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background:
						"radial-gradient(ellipse at 50% 0%, rgba(34,201,114,0.07) 0%, transparent 60%)",
				}}
				aria-hidden
			/>

			<div className="max-w-5xl mx-auto relative">
				<SectionHeader
					tag="[how it works]"
					heading="Settlement in three steps"
					subtext="Fully automated, cryptographically verified, zero human intervention, from trade initiation to USDC release."
				/>

				<div className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-6 lg:gap-0">
					{STEPS.map((step, index) => (
						<div
							key={step.title}
							className="flex flex-col lg:flex-row items-center w-full lg:w-auto"
						>
							<StepCard
								icon={step.icon}
								title={step.title}
								description={step.description}
								index={index}
							/>
							{index < STEPS.length - 1 && <DashedConnector index={index} />}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
