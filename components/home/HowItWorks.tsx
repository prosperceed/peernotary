import SectionHeader from "@/components/ui/SectionHeader";
import { IconIntegrate, IconVerify, IconSettle } from "@/components/icons/StepIcons";

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
			"The oracle confirms fiat receipt through Open Banking webhooks or a ZK web proof — no screenshots, no manual checks, no fraud vectors.",
	},
	{
		icon: <IconSettle />,
		title: "Auto-Release Escrow",
		description:
			"Once proof is verified on-chain, USDC is released instantly to the seller. Disputes route to on-chain arbitration with cryptographic evidence.",
	},
];

function DashedConnector() {
	return (
		<svg
			className="hidden lg:block w-24 xl:w-32 shrink-0"
			height="24"
			viewBox="0 0 96 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
		>
			<path
				d="M4 20 Q 48 4 92 20"
				stroke="#22c972"
				strokeWidth="1.5"
				strokeDasharray="5 4"
				strokeLinecap="round"
				opacity="0.45"
				fill="none"
			/>
			<circle cx="92" cy="20" r="2.5" fill="#22c972" opacity="0.5" />
		</svg>
	);
}

function StepCard({ icon, title, description, index }: { icon: React.ReactNode; title: string; description: string; index: number }) {
	return (
		<div className="group relative flex flex-col items-center text-center w-full lg:w-72 xl:w-80 px-6 pt-8 pb-7">
			<div className="relative mb-6">
				<div
					className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center transition-colors duration-300 group-hover:border-solid"
					style={{ borderColor: "rgba(34,201,114,0.4)", background: "rgba(240,247,243,0.7)" }}
				>
					{icon}
				</div>
				<span
					className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
					style={{ background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)" }}
				>
					{index + 1}
				</span>
			</div>
			<h3 className="text-base font-bold text-[#0d2b1e] mb-2 tracking-tight">{title}</h3>
			<p className="text-[13px] text-[#3d6b55] leading-relaxed">{description}</p>
		</div>
	);
}

export default function HowItWorks() {
	return (
		<section className="relative px-4 py-24 overflow-hidden">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(34,201,114,0.07) 0%, transparent 60%)" }}
				aria-hidden
			/>

			<div className="max-w-5xl mx-auto relative">
				<SectionHeader
					tag="[how it works]"
					heading="Settlement in three steps"
					subtext="From trade initiation to USDC release — fully automated, cryptographically verified, zero human intervention required."
				/>

				<div className="flex flex-col lg:flex-row items-start lg:items-center justify-center gap-6 lg:gap-0">
					{STEPS.map((step, index) => (
						<>
							<StepCard key={step.title} icon={step.icon} title={step.title} description={step.description} index={index} />
							{index < STEPS.length - 1 && <DashedConnector key={`connector-${index}`} />}
						</>
					))}
				</div>
			</div>
		</section>
	);
}
