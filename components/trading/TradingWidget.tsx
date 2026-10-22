"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
	Zap,
	Shield,
	CheckCircle,
	AlertTriangle,
	Lock,
	Fingerprint,
	Eye,
	Database,
	ArrowRight,
	Send,
	ChevronRight,
	Check,
} from "lucide-react";
import { Badge, StepBar, CountdownRing } from "@/components/shared";
import { cn, RATE, calcUsdc } from "@/lib/utils";
import type { TradeStep, VerifyMode, ChatMessage } from "@/types";

// ─── ZK PROOF PANEL ───────────────────────────────────────────────────────────
function ZKProofPanel({ onComplete }: { onComplete: () => void }) {
	const [stage, setStage] = useState(0);
	const stages = [
		"Initializing TLS session…",
		"Generating ZK witness…",
		"Proving HMAC signature…",
		"Submitting to Arc Oracle…",
		"✓ Proof verified on-chain",
	];

	useEffect(() => {
		if (stage >= stages.length - 1) {
			setTimeout(onComplete, 700);
			return;
		}
		const t = setTimeout(
			() => setStage((s) => s + 1),
			stage === 0 ? 700 : 1150,
		);
		return () => clearTimeout(t);
	}, [stage, onComplete, stages.length]);

	return (
		<div className="relative bg-[#f0f7f3] rounded-xl p-4 border border-[#d1e8dc] font-mono text-xs overflow-hidden">
			<div className="text-[#1a9e5c] mb-3 font-semibold">
				▸ TLSNotary / Reclaim Protocol — ZK Proof Generator
			</div>
			<div className="space-y-2">
				{stages.map((s, i) => {
					if (i > stage) return null;
					const isActive = i === stage && stage < stages.length - 1;
					const isVerified =
						i === stages.length - 1 && stage === stages.length - 1;
					return (
						<div
							key={i}
							className={cn(
								"flex items-center gap-2 transition-all",
								isActive
									? "text-amber-600"
									: isVerified
									? "text-[#1a9e5c]"
									: "text-[#7aaa92]",
							)}
						>
							<span>{i < stage ? "✓" : isActive ? "⟳" : "✓"}</span>
							<span className={isActive ? "animate-pulse" : ""}>{s}</span>
						</div>
					);
				})}
			</div>
			{stage === stages.length - 1 && (
				<div className="mt-3 p-2.5 rounded-lg bg-[#d4f0e3] border border-[#22c972]/40 text-[#1a9e5c]">
					Proof ID: <span className="font-bold">0x7fa3c8…d901e2</span> ·
					Arc Block #4,129,841
				</div>
			)}
		</div>
	);
}

// ─── CHAT WINDOW ──────────────────────────────────────────────────────────────
function ChatWindow({ onDispute }: { onDispute: () => void }) {
	const [input, setInput] = useState("");
	const [msgs, setMsgs] = useState<ChatMessage[]>([
		{
			from: "system",
			text: "Escrow channel opened. Both parties are connected.",
			time: "14:02",
		},
		{
			from: "buyer",
			text: "I've completed the ₦500,000 transfer to your GTBank account ending ****7812.",
			time: "14:05",
		},
		{
			from: "seller",
			text: "Checking my account now — please hold.",
			time: "14:06",
		},
		{
			from: "seller",
			text: "I can see the credit. Releasing USDC now.",
			time: "14:09",
		},
		{
			from: "system",
			text: "⚠️ Cryptographic proof of payment received and verified by Arc Oracle. Dispute window: 15 mins.",
			time: "14:09",
		},
	]);
	const [disputed, setDisputed] = useState(false);
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [msgs]);

	const send = () => {
		if (!input.trim()) return;
		const now = new Date().toLocaleTimeString("en-NG", {
			hour: "2-digit",
			minute: "2-digit",
		});
		setMsgs((m) => [...m, { from: "buyer", text: input, time: now }]);
		setInput("");
	};

	const handleDispute = () => {
		setDisputed(true);
		const now = new Date().toLocaleTimeString("en-NG", {
			hour: "2-digit",
			minute: "2-digit",
		});
		setMsgs((m) => [
			...m,
			{
				from: "system",
				text: "🚨 DISPUTE TRIGGERED. Arc arbitration protocol initiated. Slashing penalties now in effect.",
				time: now,
				danger: true,
			},
		]);
		onDispute();
	};

	return (
		<div className="flex flex-col gap-3 step-content">
			<div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto chat-scroll pr-1">
				{msgs.map((m, i) => (
					<div
						key={i}
						className={cn(
							"flex",
							m.from === "buyer"
								? "justify-end"
								: m.from === "system"
								? "justify-center"
								: "justify-start",
						)}
					>
						{m.from === "system" ? (
							<div
								className={cn(
									"text-[10px] px-3 py-2 rounded-xl max-w-[90%] text-center leading-relaxed",
									m.danger
										? "bg-red-50 text-red-600 border border-red-200"
										: "bg-[#f0f7f3] text-[#7aaa92] border border-[#d1e8dc]",
								)}
							>
								{m.text}
								<div className="text-[#7aaa92]/60 text-[9px] mt-0.5">{m.time}</div>
							</div>
						) : (
							<div
								className={cn(
									"flex flex-col gap-1 max-w-[75%]",
									m.from === "buyer" ? "items-end" : "items-start",
								)}
							>
								<span className="text-[10px] text-[#7aaa92] px-1">
									{m.from === "buyer" ? "You (Buyer)" : "Seller · OluwaseunAd"}
								</span>
								<div
									className={cn(
										"px-3 py-2 rounded-2xl text-xs leading-relaxed",
										m.from === "buyer"
											? "text-white rounded-br-sm"
											: "bg-[#f0f7f3] text-[#3d6b55] border border-[#d1e8dc] rounded-bl-sm",
									)}
									style={
										m.from === "buyer"
											? {
													background:
														"linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
											  }
											: undefined
									}
								>
									{m.text}
								</div>
								<span className="text-[9px] text-[#7aaa92] px-1">{m.time}</span>
							</div>
						)}
					</div>
				))}
				<div ref={endRef} />
			</div>

			<div className="flex gap-2">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && send()}
					placeholder="Send a message…"
					className="flex-1 bg-white border border-[#d1e8dc] rounded-xl px-3 py-2 text-xs text-[#0d2b1e] placeholder-[#7aaa92] focus:outline-none focus:border-[#22c972] focus:ring-1 focus:ring-[#22c972]/20 transition-all"
				/>
				<button
					onClick={send}
					className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 text-white"
					style={{
						background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
					}}
				>
					<Send size={13} />
				</button>
			</div>

			{!disputed ? (
				<button
					onClick={handleDispute}
					className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-all flex items-center justify-center gap-2 group"
				>
					<AlertTriangle size={12} className="group-hover:animate-pulse" />
					Trigger Dispute / Raise Arbitration
				</button>
			) : (
				<div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 leading-relaxed">
					<div className="font-semibold mb-1.5 flex items-center gap-1.5">
						<AlertTriangle size={12} /> Arbitration Active
					</div>
					<div className="text-red-500">
						Slashing penalty:{" "}
						<span className="font-mono font-bold">50 USDC</span>{" "}
						locked from the accused party. An Arc DAO arbitrator will review
						within 2 hours. Filing false disputes incurs a permanent reputation
						slash.
					</div>
				</div>
			)}
		</div>
	);
}

// ─── TRADING WIDGET (Main Export) ─────────────────────────────────────────────
interface TradingWidgetProps {
	embedded?: boolean;
}

export default function TradingWidget({
	embedded = false,
}: TradingWidgetProps) {
	const [step, setStep] = useState<TradeStep>(0);
	const [verifyMode, setVerifyMode] = useState<VerifyMode>(null);
	const [zkDone, setZkDone] = useState(false);
	const [bankLinked, setBankLinked] = useState(false);
	const [disputeActive, setDisputeActive] = useState(false);
	const [ngnInput, setNgnInput] = useState("500,000");
	const [countdown, setCountdown] = useState(285);

	const rawNgn = parseFloat(ngnInput.replace(/,/g, "")) || 0;
	const usdcAmount = (rawNgn / RATE).toFixed(2);
	const platformFee = ((rawNgn * 0.005) / RATE).toFixed(4);

	useEffect(() => {
		if (step !== 2) return;
		const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
		return () => clearInterval(t);
	}, [step]);

	const steps = [
		"Create Order",
		"Verify Payment",
		"Escrow Lock",
		"Chat & Dispute",
	] as const;
	const canProceedStep1 = zkDone || bankLinked;

	const handleZkComplete = useCallback(() => setZkDone(true), []);

	return (
		<div className={cn("flex flex-col mx-auto", embedded ? "" : "")}>
			{/* Widget Header */}
			<div className="flex items-center justify-between mb-5">
				<div>
					<div className="flex items-center gap-2 mb-0.5">
						<span className="text-sm font-semibold text-[#0d2b1e]">
							PeerNotary Escrow
						</span>
					</div>
					<div className="text-[10px] text-[#7aaa92]">
						Powered by Arc Network · Gas in USDC
					</div>
				</div>
				<Badge label="Live Network" color="green" pulse />
			</div>

			<StepBar current={step} steps={[...steps]} />

			{/* ── STEP 0: Order Creation ── */}
			{step === 0 && (
				<div className="step-content space-y-4">
					<div>
						<label className="block text-xs text-[#7aaa92] mb-1.5">
							You Send (NGN)
						</label>
						<div className="relative">
							<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3d6b55] text-sm font-mono">
								₦
							</span>
							<input
								value={ngnInput}
								onChange={(e) => setNgnInput(e.target.value)}
								className="w-full bg-white border border-[#d1e8dc] rounded-xl pl-7 pr-20 py-3 text-[#0d2b1e] font-mono text-xl focus:outline-none focus:border-[#22c972] focus:ring-1 focus:ring-[#22c972]/20 transition-all"
							/>
							<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7aaa92] text-xs bg-[#f0f7f3] border border-[#d1e8dc] px-2 py-1 rounded-lg">
								NGN
							</span>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<div className="flex-1 h-px bg-[#d1e8dc]" />
						<div className="text-xs text-[#7aaa92] font-mono whitespace-nowrap">
							1 USDC = ₦{RATE.toLocaleString()}
						</div>
						<div className="flex-1 h-px bg-[#d1e8dc]" />
					</div>

					<div>
						<label className="block text-xs text-[#7aaa92] mb-1.5">
							You Receive (USDC)
						</label>
						<div className="w-full bg-[#f0f7f3] border border-[#d1e8dc] rounded-xl px-4 py-3 flex justify-between items-center">
							<span className="text-[#1a9e5c] font-mono text-xl font-bold">
								{parseFloat(usdcAmount).toLocaleString("en-US", {
									minimumFractionDigits: 2,
								})}
							</span>
							<span className="text-sm text-[#7aaa92]">USDC</span>
						</div>
					</div>

					<div className="p-3 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-start gap-2">
						<Zap size={12} className="text-[#1a9e5c] mt-0.5 shrink-0" />
						<div className="text-xs text-[#3d6b55] leading-relaxed">
							<span className="text-[#0d2b1e] font-medium">
								Gas paid in USDC via Arc Network.
							</span>{" "}
							No ETH or native tokens needed. Platform fee:{" "}
							<span className="font-mono text-[#0d2b1e] font-semibold">0.5%</span> ({platformFee}{" "}
							USDC).
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2 text-xs">
						{[
							["Seller", "OluwaseunAd_Arc"],
							["Escrow Type", "Smart Contract"],
							["Network", "Arc Mainnet"],
							["Settlement", "~2 minutes"],
						].map(([k, v]) => (
							<div key={k} className="bg-[#f5f9f7] border border-[#d1e8dc] rounded-xl p-2.5">
								<div className="text-[#7aaa92]">{k}</div>
								<div className="text-[#3d6b55] font-mono mt-0.5">{v}</div>
							</div>
						))}
					</div>

					<button
						onClick={() => setStep(1)}
						className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] hover:shadow-lg hover:shadow-green-primary/20"
						style={{
							background:
								"linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
						}}
					>
						Create Escrow Order <ArrowRight size={15} />
					</button>
				</div>
			)}

			{/* ── STEP 1: Verification ── */}
			{step === 1 && (
				<div className="step-content space-y-4">
					<div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
						<Eye size={12} className="text-amber-500 mt-0.5 shrink-0" />
						<div className="text-xs text-amber-700 leading-relaxed">
							<span className="font-semibold">
								Visual receipts are deprecated.
							</span>{" "}
							Screenshot-based proofs are rejected to prevent fraud via doctored
							images. Choose a cryptographic verification method.
						</div>
					</div>

					<div>
						<p className="text-xs text-[#7aaa92] mb-2">
							Select Verification Method
						</p>
						<div className="grid grid-cols-2 gap-3">
							<button
								onClick={() => setVerifyMode("bank")}
								className={cn(
									"p-4 rounded-xl border text-left transition-all",
									verifyMode === "bank"
										? "border-[#22c972] bg-[#d4f0e3]"
										: "border-[#d1e8dc] bg-white hover:border-[#22c972]/40 hover:bg-[#f0f7f3]",
								)}
							>
								<Database
									size={18}
									className={
										verifyMode === "bank"
											? "text-[#1a9e5c]"
											: "text-[#7aaa92]"
									}
								/>
								<div className="text-xs font-semibold text-[#0d2b1e] mt-2">
									Open Banking
								</div>
								<div className="text-[10px] text-[#7aaa92] mt-0.5">
									Fincra / Mono oracle
								</div>
							</button>
							<button
								onClick={() => {
									setVerifyMode("zk");
									setZkDone(false);
								}}
								className={cn(
									"p-4 rounded-xl border text-left transition-all",
									verifyMode === "zk"
										? "border-purple-300 bg-purple-50"
										: "border-[#d1e8dc] bg-white hover:border-purple-200 hover:bg-purple-50/50",
								)}
							>
								<Fingerprint
									size={18}
									className={
										verifyMode === "zk" ? "text-purple-500" : "text-[#7aaa92]"
									}
								/>
								<div className="text-xs font-semibold text-[#0d2b1e] mt-2">
									ZK Web-Proof
								</div>
								<div className="text-[10px] text-[#7aaa92] mt-0.5">
									TLSNotary / Reclaim
								</div>
							</button>
						</div>
					</div>

					{verifyMode === "bank" && !bankLinked && (
						<div className="space-y-2">
							<p className="text-xs text-[#7aaa92]">
								Connect your bank to auto-verify this transfer via open banking
								oracle.
							</p>
							{["OPay", "GTBank", "Access Bank", "Kuda"].map((b) => (
								<button
									key={b}
									onClick={() => {
										if (b === "OPay") setBankLinked(true);
									}}
									className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-[#d1e8dc] hover:border-[#22c972]/40 hover:bg-[#f0f7f3] transition-all text-sm text-[#3d6b55]"
								>
									<span>{b}</span>
									<ChevronRight size={14} className="text-[#7aaa92]" />
								</button>
							))}
						</div>
					)}

					{verifyMode === "bank" && bankLinked && (
						<div className="p-3 rounded-xl bg-[#d4f0e3] border border-[#22c972]/40 flex items-center gap-3">
							<CheckCircle size={18} className="text-[#1a9e5c] shrink-0" />
							<div>
								<div className="text-sm text-[#1a9e5c] font-semibold">
									Bank Account Linked: OPay (****1234)
								</div>
								<div className="text-[10px] text-[#3d6b55] mt-0.5">
									Transaction of ₦500,000 auto-confirmed via Mono oracle at
									14:09 WAT
								</div>
							</div>
						</div>
					)}

					{verifyMode === "zk" && !zkDone && (
						<ZKProofPanel onComplete={handleZkComplete} />
					)}
					{verifyMode === "zk" && zkDone && (
						<div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-3">
							<Fingerprint size={18} className="text-purple-500 shrink-0" />
							<div>
								<div className="text-sm text-purple-600 font-semibold">
									ZK Proof Verified On-Chain
								</div>
								<div className="text-[10px] text-purple-500 mt-0.5 font-mono">
									Arc Block #4,129,841 · Proof: 0x7fa3c8…d901e2
								</div>
							</div>
						</div>
					)}

					<div className="flex gap-2">
						<button
							onClick={() => setStep(0)}
							className="flex-1 py-2.5 rounded-xl border border-[#d1e8dc] text-[#7aaa92] text-xs hover:bg-[#f0f7f3] transition-all"
						>
							← Back
						</button>
						<button
							onClick={() => canProceedStep1 && setStep(2)}
							disabled={!canProceedStep1}
							className={cn(
								"flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all text-white",
								canProceedStep1
									? "hover:shadow-lg hover:shadow-green-primary/20"
									: "opacity-40 cursor-not-allowed",
							)}
							style={
								canProceedStep1
									? {
											background:
												"linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
									  }
									: { background: "#d1e8dc" }
							}
						>
							Submit Proof →
						</button>
					</div>
				</div>
			)}

			{/* ── STEP 2: Escrow Lock ── */}
			{step === 2 && (
				<div className="step-content space-y-4">
					<CountdownRing seconds={countdown} total={300} />
					<p className="text-center text-[10px] text-[#7aaa92] -mt-2">
						Seller must release USDC within this window
					</p>

					<div className="space-y-2">
						{[
							{
								label: "Seller USDC Locked",
								value: `${usdcAmount} USDC`,
								color: "green" as const,
								icon: <Lock size={11} className="text-[#1a9e5c]" />,
							},
							{
								label: "Buyer Collateral Deposited (Anti-Fraud Lock)",
								value: "25 USDC",
								color: "amber" as const,
								icon: <Shield size={11} className="text-amber-500" />,
							},
							{
								label: "Arc Escrow Status",
								value: "Secured",
								color: "purple" as const,
								icon: <CheckCircle size={11} className="text-purple-500" />,
							},
							{
								label: "Payment Verification",
								value: bankLinked
									? "OPay Oracle Confirmed"
									: "ZK Proof On-Chain",
								color: "green" as const,
								icon: <Check size={11} className="text-[#1a9e5c]" />,
							},
						].map(({ label, value, color, icon }) => (
							<div
								key={label}
								className={cn(
									"flex items-center justify-between p-3 rounded-xl border text-xs",
									color === "green"
										? "bg-[#f0f7f3] border-[#d1e8dc]"
										: color === "amber"
										? "bg-amber-50 border-amber-200"
										: "bg-purple-50 border-purple-200",
								)}
							>
								<div
									className={cn(
										"flex items-center gap-1.5",
										color === "green"
											? "text-[#3d6b55]"
											: color === "amber"
											? "text-amber-600"
											: "text-purple-600",
									)}
								>
									{icon} {label}
								</div>
								<span
									className={cn(
										"font-mono font-semibold text-xs",
										color === "green"
											? "text-[#1a9e5c]"
											: color === "amber"
											? "text-amber-500"
											: "text-purple-500",
									)}
								>
									{value}
								</span>
							</div>
						))}
					</div>

					<div className="flex gap-2">
						<button
							onClick={() => setStep(1)}
							className="flex-1 py-2.5 rounded-xl border border-[#d1e8dc] text-[#7aaa92] text-xs hover:bg-[#f0f7f3] transition-all"
						>
							← Back
						</button>
						<button
							onClick={() => setStep(3)}
							className="flex-1 py-2.5 rounded-xl text-white text-xs font-semibold transition-all hover:shadow-lg hover:shadow-green-primary/20"
							style={{
								background:
									"linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
							}}
						>
							Open Chat Portal →
						</button>
					</div>
				</div>
			)}

			{/* ── STEP 3: Chat & Dispute ── */}
			{step === 3 && (
				<div className="step-content space-y-3">
					<div className="flex items-center justify-between">
						<div className="text-xs text-[#7aaa92]">Secure P2P Channel</div>
						<Badge
							label={disputeActive ? "Dispute Active" : "Escrow Held"}
							color={disputeActive ? "red" : "amber"}
							pulse={disputeActive}
						/>
					</div>
					<ChatWindow onDispute={() => setDisputeActive(true)} />
					{!disputeActive && (
						<button
							onClick={() => setStep(2)}
							className="w-full py-2 rounded-xl border border-[#d1e8dc] text-[#7aaa92] text-xs hover:bg-[#f0f7f3] transition-all"
						>
							← Back to Escrow
						</button>
					)}
				</div>
			)}
		</div>
	);
}
