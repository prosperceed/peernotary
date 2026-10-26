"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
	Shield,
	Lock,
	CheckCircle2,
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Building2,
	Fingerprint,
	ExternalLink,
	Copy,
	Check,
	RefreshCw,
} from "lucide-react";
import { useAccount } from "wagmi";
import { Badge } from "@/components/shared";
import { ARCSCAN_ADDR, ARCSCAN_TX, ESCROW_ADDRESS } from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
import type {
	RustEvaluateEscrowReleaseResponse,
	RustExtractedPaymentEvidence,
	RustProofSummaryResponse,
} from "@/lib/tlsn/client";

interface ProofExecutionResult {
	verified: boolean;
	authorizedForRelease: boolean;
	sessionId: string;
	verificationId: string;
	tradeId: string;
	bankName: string;
	proofSummary: RustProofSummaryResponse;
	evidence: RustExtractedPaymentEvidence;
	escrowEvaluation: RustEvaluateEscrowReleaseResponse;
	oracleTransactionHash: string | null;
}

function BankCheckoutContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { address, isConnected } = useAccount();

	const tradeId = searchParams.get("tradeId") || "42";
	const initialSessionId = searchParams.get("sessionId") || "";
	const bankName = searchParams.get("bank") || "GTBank";
	const rawAmountNgn =
		searchParams.get("amountNgn")?.replace(/[^0-9]/g, "") || "500000";
	const initialRef =
		searchParams.get("ref") || `ARC-REF-${tradeId}-${Date.now().toString().slice(-6)}`;
	const returnTo = searchParams.get("returnTo") || "/trade";

	const numericNgn = parseInt(rawAmountNgn, 10) || 500000;
	const usdcEquivalent = (numericNgn / RATE).toFixed(2);

	const [authenticated, setAuthenticated] = useState<boolean | null>(null);
	const [sessionId, setSessionId] = useState(initialSessionId);
	const [paymentRef, setPaymentRef] = useState(initialRef);
	const [targetHostname, setTargetHostname] = useState(
		searchParams.get("host") || "api.gtbank.com",
	);
	const [notaryPubKey, setNotaryPubKey] = useState<string>("");
	const [initializingSession, setInitializingSession] = useState(false);

	const [processingPayment, setProcessingPayment] = useState(false);
	const [proofStage, setProofStage] = useState<number>(0);
	const [proofResult, setProofResult] = useState<ProofExecutionResult | null>(
		null,
	);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [copiedProof, setCopiedProof] = useState(false);

	const initVerificationSession = useCallback(async () => {
		setInitializingSession(true);
		setErrorMsg(null);
		try {
			const res = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "create_session",
					bankName,
					amountUnits: rawAmountNgn,
					currency: "NGN",
					paymentReference: paymentRef,
				}),
			});

			if (res.status === 401) {
				setAuthenticated(false);
				return;
			}
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(
					err.error ||
						"Could not initialize TLSNotary session on Rust verifier (port 7047).",
				);
			}

			const data = (await res.json()) as {
				sessionId: string;
				paymentReference: string;
				targetHostname: string;
				notaryPublicKeyHex?: string;
			};
			setAuthenticated(true);
			setSessionId(data.sessionId);
			setPaymentRef(data.paymentReference);
			setTargetHostname(data.targetHostname);
			if (data.notaryPublicKeyHex) setNotaryPubKey(data.notaryPublicKeyHex);
		} catch (err) {
			setErrorMsg(
				err instanceof Error
					? err.message
					: "Failed to connect to Rust TLSNotary service.",
			);
		} finally {
			setInitializingSession(false);
		}
	}, [bankName, paymentRef, rawAmountNgn, tradeId]);

	useEffect(() => {
		void fetch("/api/auth/session")
			.then((r) => r.json())
			.then((s: { authenticated?: boolean }) => {
				if (!s.authenticated) {
					setAuthenticated(false);
					return;
				}
				setAuthenticated(true);
				if (!initialSessionId) {
					void initVerificationSession();
				}
			})
			.catch(() => setAuthenticated(false));
	}, [initVerificationSession, initialSessionId]);

	const handleAuthorizePaymentAndProve = async (
		simulatedStatus: "completed" | "pending" = "completed",
	) => {
		setProcessingPayment(true);
		setErrorMsg(null);
		setProofResult(null);
		setProofStage(1);

		try {
			let activeSessionId = sessionId;
			if (!activeSessionId || simulatedStatus === "completed") {
				// Always ensure a fresh Pending session if previous attempt failed
				const createRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "create_session",
						bankName,
						amountUnits: rawAmountNgn,
						currency: "NGN",
						paymentReference: `ARC-REF-${tradeId}-${Date.now().toString().slice(-6)}`,
					}),
				});
				if (!createRes.ok) {
					const err = (await createRes.json().catch(() => ({}))) as {
						error?: string;
					};
					throw new Error(
						err.error || "Failed to initialize session on Rust verifier.",
					);
				}
				const created = (await createRes.json()) as {
					sessionId: string;
					paymentReference: string;
					targetHostname: string;
					notaryPublicKeyHex?: string;
				};
				activeSessionId = created.sessionId;
				setSessionId(created.sessionId);
				setPaymentRef(created.paymentReference);
				setTargetHostname(created.targetHostname);
				if (created.notaryPublicKeyHex) {
					setNotaryPubKey(created.notaryPublicKeyHex);
				}
			}

			setProofStage(2);

			const execRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "execute_proof",
					sessionId: activeSessionId,
					paymentStatus: simulatedStatus,
				}),
			});

			setProofStage(3);

			if (!execRes.ok) {
				const errBody = (await execRes.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(
					errBody.error ||
						`Rust verifier rejected proof (HTTP ${execRes.status})`,
				);
			}

			const result = (await execRes.json()) as ProofExecutionResult;
			setProofStage(4);
			setProofResult(result);

			// Sync completed status to user dashboard ledger
			await fetch("/api/user/dashboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "update_status",
					tradeId,
					status: "completed",
					proofId: result.proofSummary.on_chain_proof_id_bytes32,
					txHash:
						result.oracleTransactionHash ??
						result.proofSummary.on_chain_proof_id_bytes32,
				}),
			}).catch(() => {});
		} catch (err) {
			setErrorMsg(
				err instanceof Error
					? err.message
					: "Cryptographic verification failed.",
			);
		} finally {
			setProcessingPayment(false);
		}
	};

	const copyProofId = (val: string) => {
		navigator.clipboard.writeText(val).catch(() => {});
		setCopiedProof(true);
		setTimeout(() => setCopiedProof(false), 1500);
	};

	if (authenticated === false || !isConnected) {
		return (
			<div className="max-w-md mx-auto my-14 p-6 rounded-2xl bg-white border border-[#d1e8dc] text-center space-y-4">
				<div className="w-12 h-12 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center mx-auto">
					<Lock size={20} className="text-[#1a9e5c]" />
				</div>
				<h2 className="text-base font-bold text-[#0d2b1e]">
					Sign In Required for Bank Payment Redirect
				</h2>
				<p className="text-xs text-[#7aaa92]">
					Connect your wallet and sign in via the top navigation bar or
					dashboard before initiating a verified bank payment session.
				</p>
				<Link
					href="/dashboard"
					className="inline-flex items-center justify-center w-full py-2.5 rounded-xl bg-[#1a9e5c] text-white text-xs font-semibold"
				>
					Go to Sign-In Gate
				</Link>
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			{/* Top Bar */}
			<div className="flex items-center justify-between">
				<Link
					href={returnTo}
					className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3d6b55] hover:text-[#1a9e5c]"
				>
					<ArrowLeft size={14} />
					<span>Back to {returnTo === "/dashboard" ? "Dashboard" : "Trading Portal"}</span>
				</Link>
				<div className="flex items-center gap-2">
					<Badge label={`TLS Target: ${targetHostname}`} color="cyan" />
					<Badge label="Rust Verifier :7047" color="green" pulse />
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Left Column: Selected Bank Payment Gateway */}
				<div className="lg:col-span-6 rounded-2xl border border-[#d1e8dc] bg-white p-6 space-y-5">
					<div className="flex items-start justify-between border-b border-[#d1e8dc] pb-4">
						<div className="flex items-center gap-3">
							<div className="w-11 h-11 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center">
								<Building2 size={20} className="text-[#1a9e5c]" />
							</div>
							<div>
								<h1 className="text-base font-bold text-[#0d2b1e]">
									{bankName} Secure Web Checkout
								</h1>
								<p className="text-xs text-[#7aaa92]">
									TLSNotary MPC-TLS Session · Trade #{tradeId}
								</p>
							</div>
						</div>
						<Badge label="HTTPS 1.2 / X.509" color="green" />
					</div>

					{/* Transfer Amount Box */}
					<div className="p-4 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] space-y-1">
						<div className="text-[11px] text-[#3d6b55] font-medium">
							Exact Fiat Transfer Amount
						</div>
						<div className="flex items-baseline justify-between">
							<span className="text-2xl font-bold font-mono text-[#0d2b1e]">
								₦{numericNgn.toLocaleString("en-NG")}
							</span>
							<span className="text-xs font-mono text-[#1a9e5c] font-semibold">
								Releases {usdcEquivalent} USDC
							</span>
						</div>
					</div>

					{/* Bank Transfer Instructions */}
					<div className="space-y-2.5 text-xs">
						<div className="flex justify-between py-2 border-b border-[#d1e8dc]/60">
							<span className="text-[#7aaa92]">Receiving Institution</span>
							<span className="font-semibold text-[#0d2b1e]">{bankName}</span>
						</div>
						<div className="flex justify-between py-2 border-b border-[#d1e8dc]/60">
							<span className="text-[#7aaa92]">Escrow Beneficiary Account</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								0148920411 (OluwaseunAd_Arc)
							</span>
						</div>
						<div className="flex justify-between py-2 border-b border-[#d1e8dc]/60">
							<span className="text-[#7aaa92]">Payment Reference</span>
							<span className="font-mono font-semibold text-[#1a9e5c]">
								{paymentRef}
							</span>
						</div>
						<div className="flex justify-between py-2 border-b border-[#d1e8dc]/60">
							<span className="text-[#7aaa92]">Authenticated Buyer Wallet</span>
							<span className="font-mono text-[#0d2b1e]">
								{address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "Connected"}
							</span>
						</div>
						<div className="flex justify-between py-2">
							<span className="text-[#7aaa92]">Rust TLSN Session ID</span>
							<span className="font-mono text-[11px] text-[#3d6b55]">
								{initializingSession
									? "Initializing..."
									: sessionId
									? `${sessionId.slice(0, 18)}…`
									: "Ready on submit"}
							</span>
						</div>
					</div>

					{/* Action Buttons */}
					<div className="space-y-2.5 pt-2">
						<button
							onClick={() => void handleAuthorizePaymentAndProve("completed")}
							disabled={processingPayment || initializingSession}
							className="w-full py-3.5 rounded-xl text-white font-semibold text-xs transition-all hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-2"
							style={{
								background: "linear-gradient(135deg, #1a9e5c 0%, #22c972 100%)",
							}}
						>
							{processingPayment ? (
								<>
									<RefreshCw size={14} className="animate-spin" />
									<span>Generating & Verifying TLSNotary Proof...</span>
								</>
							) : (
								<>
									<Fingerprint size={15} />
									<span>
										Confirm ₦{numericNgn.toLocaleString("en-NG")} Transfer &
										Generate ZK Proof
									</span>
								</>
							)}
						</button>

						<button
							onClick={() => void handleAuthorizePaymentAndProve("pending")}
							disabled={processingPayment || initializingSession}
							className="w-full py-2.5 rounded-xl border border-[#d1e8dc] bg-[#f8fcfa] text-[#3d6b55] hover:text-[#0d2b1e] hover:bg-[#f0f7f3] font-medium text-xs transition-all disabled:opacity-60"
						>
							Test Unsettled / Pending Transfer Rejection
						</button>
					</div>
				</div>

				{/* Right Column: Live Rust TLSNotary Cryptographic Inspector */}
				<div className="lg:col-span-6 rounded-2xl border border-[#d1e8dc] bg-white p-6 flex flex-col justify-between space-y-5">
					<div className="space-y-4">
						<div className="flex items-center justify-between border-b border-[#d1e8dc] pb-4">
							<div>
								<h2 className="text-base font-bold text-[#0d2b1e]">
									Cryptographic Verification Engine
								</h2>
								<p className="text-xs text-[#7aaa92]">
									Live output from Rust `tlsn-core` (`v0.1.0-alpha.12`)
								</p>
							</div>
							<Badge
								label={
									proofResult?.verified
										? "Proof Verified"
										: errorMsg
										? "Rejected"
										: "Awaiting Transfer"
								}
								color={
									proofResult?.verified
										? "green"
										: errorMsg
										? "red"
										: "slate"
								}
							/>
						</div>

						{/* Pipeline Stages */}
						<div className="p-4 rounded-xl bg-[#f8fcfa] border border-[#d1e8dc] font-mono text-xs space-y-2.5">
							{[
								{
									step: 1,
									label: "1. Initialize session & pin Notary secp256k1 public key",
								},
								{
									step: 2,
									label:
										"2. Build TLSNotary Presentation (Attestation + BLAKE3 Merkle Tree)",
								},
								{
									step: 3,
									label:
										"3. Verify X.509 certificate chain & transcript openings in Rust",
								},
								{
									step: 4,
									label:
										"4. Sign PEERNOTARY_TLSN_ESCROW_V1 attestation & evaluate release",
								},
							].map((item) => {
								const done = proofStage >= item.step && !errorMsg;
								const active = processingPayment && proofStage === item.step;
								return (
									<div
										key={item.step}
										className={cn(
											"flex items-center gap-2",
											done
												? "text-[#1a9e5c] font-semibold"
												: active
												? "text-amber-600 animate-pulse"
												: "text-[#7aaa92]",
										)}
									>
										<span>{done ? "✓" : active ? "⟳" : "·"}</span>
										<span>{item.label}</span>
									</div>
								);
							})}
						</div>

						{/* Error / Rejection Display */}
						{errorMsg && (
							<div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-1.5">
								<div className="flex items-center gap-2 text-xs font-bold text-red-600">
									<AlertTriangle size={15} />
									<span>Cryptographic Verification Rejected by Rust Server</span>
								</div>
								<div className="font-mono text-xs text-red-700 break-all">
									{errorMsg}
								</div>
								<p className="text-[11px] text-red-600/80">
									Escrow funds remain locked in ArcP2PEscrowService because the
									transcript did not satisfy settlement invariants.
								</p>
							</div>
						)}

						{/* Verified Proof Details */}
						{proofResult && (
							<div className="space-y-3 text-xs">
								<div className="p-3.5 rounded-xl bg-[#f0f7f3] border border-[#22c972]/40 space-y-2">
									<div className="flex items-center justify-between">
										<span className="font-bold text-[#1a9e5c] flex items-center gap-1.5">
											<CheckCircle2 size={14} />
											<span>
												Escrow Release Authorized:{" "}
												{proofResult.authorizedForRelease ? "YES" : "NO"}
											</span>
										</span>
										<span className="font-mono text-[11px] text-[#0d2b1e]">
											Chain #{proofResult.proofSummary.binding_attestation.chain_id}
										</span>
									</div>

									<div className="space-y-1 font-mono text-[11px]">
										<div className="flex items-center justify-between text-[#3d6b55]">
											<span>On-Chain Proof ID (bytes32):</span>
											<button
												onClick={() =>
													copyProofId(
														proofResult.proofSummary.on_chain_proof_id_bytes32,
													)
												}
												className="inline-flex items-center gap-1 text-[#0d2b1e] font-bold hover:text-[#1a9e5c]"
											>
												<span>
													{proofResult.proofSummary.on_chain_proof_id_bytes32.slice(
														0,
														12,
													)}
													…
													{proofResult.proofSummary.on_chain_proof_id_bytes32.slice(
														-8,
													)}
												</span>
												{copiedProof ? <Check size={11} /> : <Copy size={11} />}
											</button>
										</div>

										<div className="flex items-center justify-between text-[#3d6b55]">
											<span>Transcript SHA-256 Digest:</span>
											<span className="text-[#0d2b1e]">
												{proofResult.evidence.transcript_digest_hex.slice(0, 12)}…
												{proofResult.evidence.transcript_digest_hex.slice(-8)}
											</span>
										</div>

										<div className="flex items-center justify-between text-[#3d6b55]">
											<span>Notary Public Key (SEC1):</span>
											<span className="text-[#0d2b1e]">
												{proofResult.proofSummary.binding_attestation.notary_public_key_hex.slice(
													0,
													12,
												)}
												…
											</span>
										</div>

										<div className="flex items-center justify-between text-[#3d6b55]">
											<span>ECDSA Binding Signature:</span>
											<span className="text-[#0d2b1e]">
												{proofResult.proofSummary.binding_attestation.notary_signature_hex.slice(
													0,
													14,
												)}
												…
											</span>
										</div>

										<div className="flex items-center justify-between text-[#3d6b55]">
											<span>Authenticated Bytes:</span>
											<span className="text-[#0d2b1e]">
												{proofResult.evidence.transcript_sent_len}B sent /{" "}
												{proofResult.evidence.transcript_recv_len}B recv
											</span>
										</div>
									</div>
								</div>

								{/* Cryptographic Checks List */}
								<div>
									<div className="text-[11px] font-semibold text-[#3d6b55] mb-1.5">
										Verified Invariants ({proofResult.proofSummary.checks_performed.length} passed)
									</div>
									<div className="flex flex-wrap gap-1.5">
										{proofResult.proofSummary.checks_performed.map((chk) => (
											<span
												key={chk}
												className="px-2 py-0.5 rounded-md bg-[#f8fcfa] border border-[#d1e8dc] font-mono text-[10px] text-[#1a9e5c]"
											>
												✓ {chk}
											</span>
										))}
									</div>
								</div>

								{/* Continue to Portal / Dashboard */}
								<div className="pt-2 flex flex-wrap gap-2">
									<button
										onClick={() => {
											const qs = new URLSearchParams({
												verified: "1",
												tradeId,
												sessionId: proofResult.sessionId,
												proofId:
													proofResult.proofSummary.on_chain_proof_id_bytes32,
												bank: bankName,
												amountNgn: String(numericNgn),
											});
											router.push(`/trade?${qs.toString()}`);
										}}
										className="flex-1 py-2.5 rounded-xl bg-[#1a9e5c] text-white font-semibold text-xs hover:bg-[#15854c] transition-all flex items-center justify-center gap-1.5"
									>
										<span>Return to Trading Portal</span>
										<ArrowRight size={13} />
									</button>
									<Link
										href="/dashboard"
										className="px-4 py-2.5 rounded-xl border border-[#d1e8dc] bg-[#f8fcfa] text-[#0d2b1e] font-semibold text-xs hover:bg-[#f0f7f3] transition-all"
									>
										View in Dashboard
									</Link>
								</div>
							</div>
						)}
					</div>

					{/* Bottom Contract Footer */}
					<div className="pt-3 border-t border-[#d1e8dc] flex items-center justify-between text-[11px] text-[#7aaa92]">
						<span>
							Notary Key:{" "}
							<span className="font-mono">
								{notaryPubKey ? `${notaryPubKey.slice(0, 12)}…` : "secp256k1"}
							</span>
						</span>
						<a
							href={ARCSCAN_ADDR(ESCROW_ADDRESS)}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-[#1a9e5c] hover:underline font-mono"
						>
							<span>Escrow Contract</span>
							<ExternalLink size={11} />
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function BankCheckoutPage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7] py-10 px-4 sm:px-6">
			<Suspense
				fallback={
					<div className="max-w-md mx-auto my-16 p-6 rounded-2xl bg-white border border-[#d1e8dc] text-center text-xs text-[#3d6b55]">
						Loading bank checkout session...
					</div>
				}
			>
				<BankCheckoutContent />
			</Suspense>
		</div>
	);
}

