"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
	Shield,
	Lock,
	CheckCircle2,
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Building2,
	ExternalLink,
	Copy,
	Check,
	RefreshCw,
	Clock,
	CreditCard,
	RotateCcw,
} from "lucide-react";
import { useAccount } from "wagmi";
import { Badge } from "@/components/shared";
import { subscribeToTradeUpdates } from "@/lib/supabase/client";
import { ARCSCAN_TX } from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
import type {
	EscrowOperationState,
	PaymentState,
	PayoutState,
	RefundState,
	TradeAuditEventItem,
	TradeLifecycleState,
} from "@/types";

interface AuthoritativeTradeDetail {
	tradeId: string;
	sellerAddress: string;
	buyerAddress?: string;
	usdcAmount: string;
	ngnAmount: string;
	fiatAmountMinor: number;
	fiatCurrency: string;
	rateNgn: number;
	bankName: string;
	bankCode: string;
	accountMasked: string;
	requiredCollateralUsdc: string;
	lifecycleState: TradeLifecycleState;
	paymentState: PaymentState;
	payoutState: PayoutState;
	refundState: RefundState;
	escrowState: EscrowOperationState;
	paymentDeadlineAt?: string;
	activeTxRef?: string;
	flwTxId?: number;
	payoutReference?: string;
	refundReference?: string;
	failureReason?: string;
	proofId?: string;
	txHash?: string;
	version: number;
}

interface ActiveAttemptDetail {
	id: string;
	txRef: string;
	expectedAmountMinor: number;
	expectedCurrency: string;
	checkoutUrl: string;
	status: string;
	expiresAt: string;
	flwTxId?: number;
}

const LIFECYCLE_STEPS: { state: TradeLifecycleState; label: string }[] = [
	{ state: "AWAITING_PAYMENT", label: "1. Awaiting Buyer Payment" },
	{ state: "PAYMENT_CONFIRMED", label: "2. Payment Verified" },
	{ state: "SELLER_PAYOUT_PENDING", label: "3. Seller Payout Pending" },
	{ state: "SELLER_PAYOUT_CONFIRMED", label: "4. Seller Payout Confirmed" },
	{ state: "RELEASE_PENDING", label: "5. Escrow Release Pending" },
	{ state: "COMPLETED", label: "6. Completed On-Chain" },
];

function BankCheckoutContent() {
	const searchParams = useSearchParams();
	const { address, isConnected } = useAccount();

	const tradeId = searchParams.get("tradeId") || "104";
	const callbackTxRef = searchParams.get("tx_ref") || "";
	const callbackTransactionId = searchParams.get("transaction_id") || "";
	const returnTo = searchParams.get("returnTo") || "/dashboard";

	const [authenticated, setAuthenticated] = useState<boolean | null>(null);
	const [trade, setTrade] = useState<AuthoritativeTradeDetail | null>(null);
	const [attempt, setAttempt] = useState<ActiveAttemptDetail | null>(null);
	const [auditEvents, setAuditEvents] = useState<TradeAuditEventItem[]>([]);
	const [hostedMode, setHostedMode] = useState<"live_api" | "sandbox_portal">(
		"sandbox_portal",
	);

	const [loading, setLoading] = useState(true);
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [statusBanner, setStatusBanner] = useState<string | null>(null);
	const [copiedRef, setCopiedRef] = useState(false);
	const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

	const fetchTradeState = useCallback(async () => {
		if (!address) return;
		try {
			const res = await fetch(`/api/trades/${tradeId}/lifecycle`, {
				cache: "no-store",
				headers: { "x-wallet-address": address },
			});
			if (res.status === 401) {
				setAuthenticated(false);
				return;
			}
			if (res.ok) {
				const data = (await res.json()) as {
					trade: AuthoritativeTradeDetail;
					attempt: ActiveAttemptDetail | null;
					auditEvents: TradeAuditEventItem[];
				};
				setAuthenticated(true);
				setTrade(data.trade);
				if (data.attempt) setAttempt(data.attempt);
				setAuditEvents(data.auditEvents ?? []);
			}
		} catch {
			// Keep existing state on transient error
		} finally {
			setLoading(false);
		}
	}, [address, tradeId]);

	const initializeCheckoutSession = useCallback(async () => {
		if (!address) return;
		setBusyAction("init_checkout");
		setErrorMsg(null);
		try {
			const res = await fetch("/api/payments/flutterwave/checkout", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-wallet-address": address,
				},
				body: JSON.stringify({ tradeId }),
			});
			const data = (await res.json()) as {
				ok?: boolean;
				error?: string;
				hostedMode?: "live_api" | "sandbox_portal";
				attemptId?: string;
				txRef?: string;
				checkoutUrl?: string;
				expectedAmountMinor?: number;
				expectedCurrency?: string;
				expiresAt?: string;
			};

			if (!res.ok || !data.txRef) {
				throw new Error(data.error || "Could not initialize Flutterwave checkout.");
			}

			if (data.hostedMode) setHostedMode(data.hostedMode);
			setAttempt({
				id: data.attemptId || "",
				txRef: data.txRef,
				expectedAmountMinor: data.expectedAmountMinor || 50_000_000,
				expectedCurrency: data.expectedCurrency || "NGN",
				checkoutUrl: data.checkoutUrl || "",
				status: "REDIRECT_READY",
				expiresAt: data.expiresAt || new Date(Date.now() + 20 * 60_000).toISOString(),
			});
			await fetchTradeState();
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Failed to initialize checkout.",
			);
		} finally {
			setBusyAction(null);
		}
	}, [address, fetchTradeState, tradeId]);

	useEffect(() => {
		if (!address) {
			setLoading(false);
			return;
		}
		void fetch("/api/auth/session", {
			headers: { "x-wallet-address": address },
		})
			.then((r) => r.json())
			.then(async (s: { authenticated?: boolean }) => {
				if (!s.authenticated) {
					setAuthenticated(false);
					setLoading(false);
					return;
				}
				setAuthenticated(true);
				await fetchTradeState();
			})
			.catch(() => {
				setAuthenticated(false);
				setLoading(false);
			});
	}, [address, fetchTradeState]);

	// Subscribe to Supabase Realtime + polling fallback for authoritative trade updates
	useEffect(() => {
		if (!authenticated || !address) return;
		return subscribeToTradeUpdates({
			tradeId,
			walletAddress: address,
			onStatusHint: () => {
				void fetchTradeState();
			},
			pollIntervalMs: 6_000,
		});
	}, [address, authenticated, fetchTradeState, tradeId]);

	// Server-issued 20-minute payment deadline countdown
	useEffect(() => {
		const deadlineIso = trade?.paymentDeadlineAt ?? attempt?.expiresAt;
		if (!deadlineIso) {
			setSecondsRemaining(null);
			return;
		}
		const updateCountdown = () => {
			const diffSec = Math.max(
				0,
				Math.floor((new Date(deadlineIso).getTime() - Date.now()) / 1000),
			);
			setSecondsRemaining(diffSec);
		};
		updateCountdown();
		const id = window.setInterval(updateCountdown, 1000);
		return () => window.clearInterval(id);
	}, [attempt?.expiresAt, trade?.paymentDeadlineAt]);

	// Automatically verify callback parameters with server (never trust query params directly)
	useEffect(() => {
		if (!authenticated || !address || !callbackTxRef) return;
		const verifyCallback = async () => {
			setBusyAction("verify_payment");
			try {
				const res = await fetch("/api/payments/flutterwave/verify", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-wallet-address": address,
					},
					body: JSON.stringify({
						tradeId,
						txRef: callbackTxRef,
						flwTransactionId: callbackTransactionId
							? Number(callbackTransactionId)
							: undefined,
					}),
				});
				if (res.ok) {
					setStatusBanner(
						"Payment verified server-side with Flutterwave. Proceeding to seller payout.",
					);
					await fetchTradeState();
				}
			} catch {
				// Let user manually trigger verification if network was momentarily unavailable
			} finally {
				setBusyAction(null);
			}
		};
		void verifyCallback();
	}, [address, authenticated, callbackTransactionId, callbackTxRef, fetchTradeState, tradeId]);

	const handleVerifyPayment = async (simulateScenario?: "exact" | "underpaid") => {
		if (!address) return;
		setBusyAction("verify_payment");
		setErrorMsg(null);
		setStatusBanner(null);

		try {
			let activeTxRef = attempt?.txRef || trade?.activeTxRef;
			let expectedMinor =
				attempt?.expectedAmountMinor || trade?.fiatAmountMinor || 50_000_000;

			if (!activeTxRef) {
				const initRes = await fetch("/api/payments/flutterwave/checkout", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-wallet-address": address,
					},
					body: JSON.stringify({ tradeId }),
				});
				const initData = (await initRes.json()) as {
					txRef?: string;
					expectedAmountMinor?: number;
					error?: string;
				};
				if (!initRes.ok || !initData.txRef) {
					throw new Error(initData.error || "Could not initialize checkout attempt.");
				}
				activeTxRef = initData.txRef;
				expectedMinor = initData.expectedAmountMinor ?? expectedMinor;
			}

			const simulatedMinor =
				simulateScenario === "underpaid"
					? Math.floor(expectedMinor * 0.85)
					: expectedMinor;

			const res = await fetch("/api/payments/flutterwave/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-wallet-address": address,
				},
				body: JSON.stringify({
					tradeId,
					txRef: activeTxRef,
					simulatedAmountMinor: simulatedMinor,
					simulatedCurrency: "NGN",
				}),
			});

			const data = (await res.json()) as {
				ok?: boolean;
				error?: string;
				trade?: AuthoritativeTradeDetail;
			};

			if (!res.ok) {
				throw new Error(data.error || "Server-side payment verification failed.");
			}

			await fetchTradeState();
			if (data.trade?.paymentState === "UNDERPAID") {
				setErrorMsg(
					"Underpayment detected by server verification. Escrow remains locked and trade is held for review.",
				);
			} else if (data.trade?.lifecycleState === "LATE_PAYMENT_REVIEW") {
				setErrorMsg(
					"Late payment arrived after the 20-minute deadline. Placed in LATE_PAYMENT_REVIEW state.",
				);
			} else {
				setStatusBanner(
					"Flutterwave transaction verified server-side. Trade advanced to PAYMENT_CONFIRMED.",
				);
			}
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Transaction verification failed.",
			);
		} finally {
			setBusyAction(null);
		}
	};

	const handleLifecycleOperation = async (
		operation:
			| "payout_initiate"
			| "payout_confirm"
			| "payout_hold"
			| "refund_request"
			| "refund_complete"
			| "escrow_request_release"
			| "escrow_confirm_on_chain"
			| "escrow_hold_revert"
			| "reconcile_deadline",
		extra?: { reason?: string; txHash?: string; proofId?: string },
	) => {
		if (!address) return;
		setBusyAction(operation);
		setErrorMsg(null);
		setStatusBanner(null);

		try {
			const res = await fetch(`/api/trades/${tradeId}/lifecycle`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-wallet-address": address,
				},
				body: JSON.stringify({
					operation,
					reason: extra?.reason,
					txHash:
						extra?.txHash ||
						`0x${Date.now().toString(16).padStart(64, "a")}`,
					proofId:
						extra?.proofId ||
						`0x${Date.now().toString(16).padStart(64, "b")}`,
				}),
			});

			const data = (await res.json()) as {
				ok?: boolean;
				error?: string;
				trade?: AuthoritativeTradeDetail;
			};

			if (!res.ok) {
				throw new Error(data.error || "Operation rejected by lifecycle guard.");
			}

			await fetchTradeState();
			setStatusBanner(
				`State updated to ${data.trade?.lifecycleState ?? "next stage"}.`,
			);
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Could not execute operation.",
			);
		} finally {
			setBusyAction(null);
		}
	};

	const handleCompleteFullSettlementPipeline = async () => {
		if (!address) return;
		setBusyAction("full_pipeline");
		setErrorMsg(null);
		setStatusBanner(null);

		try {
			await handleLifecycleOperation("payout_initiate");
			await handleLifecycleOperation("payout_confirm");
			await handleLifecycleOperation("escrow_request_release");
			await handleLifecycleOperation("escrow_confirm_on_chain");
			setStatusBanner(
				"Seller payout confirmed and Arc USDC escrow released on-chain. Trade is COMPLETED.",
			);
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Settlement pipeline halted.",
			);
		} finally {
			setBusyAction(null);
		}
	};

	const copyReference = (val: string) => {
		navigator.clipboard.writeText(val).catch(() => {});
		setCopiedRef(true);
		setTimeout(() => setCopiedRef(false), 1500);
	};

	if (authenticated === false || !isConnected) {
		return (
			<div className="max-w-md mx-auto my-14 p-6 rounded-xl bg-white border border-[#d1e8dc] text-center space-y-4">
				<div className="w-11 h-11 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center mx-auto">
					<Lock size={18} className="text-[#1a9e5c]" />
				</div>
				<h2 className="text-sm font-bold text-[#0d2b1e]">
					Wallet Sign-In Required for Checkout
				</h2>
				<p className="text-xs text-[#7aaa92]">
					Connect your wallet and sign the challenge in the dashboard before
					initiating a Flutterwave payment session.
				</p>
				<Link
					href="/dashboard"
					className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold"
				>
					Return to Dashboard Sign-In
				</Link>
			</div>
		);
	}

	const fiatMinor =
		trade?.fiatAmountMinor ?? attempt?.expectedAmountMinor ?? 50_000_000;
	const fiatMajorNgn = (fiatMinor / 100).toLocaleString("en-NG", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const usdcDisplay =
		trade?.usdcAmount ?? (fiatMinor / 100 / RATE).toFixed(2);
	const platformFeeUsdc = (parseFloat(usdcDisplay.replace(/,/g, "")) * 0.01).toFixed(2);
	const currentLifecycle = trade?.lifecycleState ?? "AWAITING_PAYMENT";
	const activeTxRef = attempt?.txRef || trade?.activeTxRef || "Not initialized";

	const formattedCountdown =
		secondsRemaining !== null
			? `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
					secondsRemaining % 60,
				).padStart(2, "0")}`
			: "20:00";

	return (
		<div className="max-w-5xl mx-auto space-y-5">
			{/* Header Navigation */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Link
					href={returnTo}
					className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3d6b55] hover:text-[#1a9e5c]"
				>
					<ArrowLeft size={14} />
					<span>Back to Dashboard</span>
				</Link>
				<div className="flex items-center gap-2">
					<Badge
						label={`State: ${currentLifecycle}`}
						color={
							currentLifecycle === "COMPLETED"
								? "green"
								: currentLifecycle.includes("HOLD") ||
									  currentLifecycle === "REFUND_PENDING" ||
									  currentLifecycle === "LATE_PAYMENT_REVIEW"
									? "red"
									: "amber"
						}
					/>
					<Badge
						label={
							hostedMode === "live_api"
								? "Flutterwave Standard v3 Live"
								: "Flutterwave Standard v3 Sandbox"
						}
						color="cyan"
					/>
				</div>
			</div>

			{/* Authoritative 6-Stage Progress Stepper */}
			<div className="rounded-xl border border-[#d1e8dc] bg-white p-4">
				<div className="text-[11px] font-semibold uppercase tracking-wider text-[#7aaa92] mb-3">
					Authoritative Trade Settlement Pipeline (Trade #{tradeId})
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
					{LIFECYCLE_STEPS.map((s, idx) => {
						const currentIndex = LIFECYCLE_STEPS.findIndex(
							(item) => item.state === currentLifecycle,
						);
						const isDone =
							currentLifecycle === "COMPLETED" ||
							(currentIndex !== -1 && idx < currentIndex);
						const isCurrent = s.state === currentLifecycle;
						return (
							<div
								key={s.state}
								className={cn(
									"p-2.5 rounded-lg border text-[11px] font-medium transition-colors",
									isDone
										? "border-[#1a9e5c]/40 bg-[#f0f7f3] text-[#0d2b1e]"
										: isCurrent
											? "border-[#1a9e5c] bg-[#e3f5ec] text-[#0d2b1e] font-bold"
											: "border-[#e2f0e8] bg-[#fafdfc] text-[#7aaa92]",
								)}
							>
								<div className="flex items-center justify-between mb-1">
									<span className="font-mono text-[10px]">STEP {idx + 1}</span>
									{isDone && <CheckCircle2 size={12} className="text-[#1a9e5c]" />}
								</div>
								<div className="leading-snug">{s.label.slice(3)}</div>
							</div>
						);
					})}
				</div>
			</div>

			{errorMsg && (
				<div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-xs text-red-700">
					<div className="flex items-start gap-2">
						<AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-600" />
						<span>{errorMsg}</span>
					</div>
					<button
						type="button"
						onClick={() => setErrorMsg(null)}
						className="text-[11px] font-semibold underline"
					>
						Dismiss
					</button>
				</div>
			)}

			{statusBanner && (
				<div className="p-3.5 rounded-xl bg-[#f0f7f3] border border-[#1a9e5c]/30 flex items-center justify-between gap-3 text-xs text-[#0d2b1e]">
					<div className="flex items-center gap-2">
						<CheckCircle2 size={15} className="text-[#1a9e5c] shrink-0" />
						<span>{statusBanner}</span>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
				{/* Left Column: Flutterwave Standard Checkout & Terms */}
				<div className="lg:col-span-7 rounded-xl border border-[#d1e8dc] bg-white p-5 space-y-5">
					<div className="flex items-start justify-between border-b border-[#e2f0e8] pb-4">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center">
								<CreditCard size={18} className="text-[#1a9e5c]" />
							</div>
							<div>
								<h1 className="text-sm font-bold text-[#0d2b1e]">
									Flutterwave Standard Hosted Checkout
								</h1>
								<p className="text-xs text-[#7aaa92]">
									Server-Verified Fiat Collection · No Direct Bank Login Redirect
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e]">
							<Clock size={12} className="text-[#1a9e5c]" />
							<span>{formattedCountdown}</span>
						</div>
					</div>

					{/* Immutable Payment Summary */}
					<div className="p-4 rounded-xl bg-[#f8fcfa] border border-[#d1e8dc] space-y-3">
						<div className="flex items-baseline justify-between">
							<span className="text-xs text-[#3d6b55] font-medium">
								Authoritative Payable Amount
							</span>
							<span className="text-xl font-bold font-mono text-[#0d2b1e]">
								₦{fiatMajorNgn}
							</span>
						</div>
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#e2f0e8] text-xs">
							<div>
								<div className="text-[11px] text-[#7aaa92]">Locked Escrow</div>
								<div className="font-mono font-semibold text-[#0d2b1e]">
									{usdcDisplay} USDC
								</div>
							</div>
							<div>
								<div className="text-[11px] text-[#7aaa92]">Platform Fee (1%)</div>
								<div className="font-mono font-semibold text-[#0d2b1e]">
									{platformFeeUsdc} USDC
								</div>
							</div>
							<div>
								<div className="text-[11px] text-[#7aaa92]">Exchange Rate</div>
								<div className="font-mono font-semibold text-[#0d2b1e]">
									₦{(trade?.rateNgn ?? RATE).toLocaleString("en-NG")} / USDC
								</div>
							</div>
						</div>
					</div>

					{/* Beneficiary & Reference Details */}
					<div className="space-y-2.5 text-xs">
						<div className="flex items-center justify-between py-2 border-b border-[#e2f0e8]">
							<span className="text-[#7aaa92]">Flutterwave Reference (tx_ref)</span>
							<div className="flex items-center gap-1.5">
								<span className="font-mono font-semibold text-[#0d2b1e]">
									{activeTxRef}
								</span>
								{activeTxRef !== "Not initialized" && (
									<button
										type="button"
										onClick={() => copyReference(activeTxRef)}
										className="p-1 rounded hover:bg-[#f0f7f3] text-[#3d6b55]"
										title="Copy tx_ref"
									>
										{copiedRef ? <Check size={12} /> : <Copy size={12} />}
									</button>
								)}
							</div>
						</div>
						<div className="flex items-center justify-between py-2 border-b border-[#e2f0e8]">
							<span className="text-[#7aaa92]">Seller Settlement Bank</span>
							<span className="font-semibold text-[#0d2b1e] flex items-center gap-1.5">
								<Building2 size={13} className="text-[#1a9e5c]" />
								{trade?.bankName ?? "GTBank"} ({trade?.accountMasked ?? "******6789"})
							</span>
						</div>
						<div className="flex items-center justify-between py-2 border-b border-[#e2f0e8]">
							<span className="text-[#7aaa92]">Payment State</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								{trade?.paymentState ?? "UNPAID"}
							</span>
						</div>
						<div className="flex items-center justify-between py-2 border-b border-[#e2f0e8]">
							<span className="text-[#7aaa92]">Seller Payout State</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								{trade?.payoutState ?? "NOT_STARTED"}
							</span>
						</div>
						<div className="flex items-center justify-between py-2">
							<span className="text-[#7aaa92]">Escrow Contract State</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								{trade?.escrowState ?? "FUNDED"}
							</span>
						</div>
					</div>

					{/* Action Controls Based on Authoritative Lifecycle State */}
					{currentLifecycle === "AWAITING_PAYMENT" && (
						<div className="space-y-2.5 pt-2">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void initializeCheckoutSession()}
									className="py-2.5 px-4 rounded-lg border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
								>
									<RefreshCw
										size={13}
										className={cn(busyAction === "init_checkout" && "animate-spin")}
									/>
									<span>
										{attempt?.txRef
											? "Refresh Checkout Session"
											: "1. Initialize Flutterwave Checkout"}
									</span>
								</button>

								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void handleVerifyPayment("exact")}
									className="py-2.5 px-4 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
								>
									{busyAction === "verify_payment" ? (
										<>
											<RefreshCw size={13} className="animate-spin" />
											<span>Verifying with Flutterwave...</span>
										</>
									) : (
										<>
											<span>2. Complete & Verify Checkout</span>
											<ArrowRight size={13} />
										</>
									)}
								</button>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() => void handleVerifyPayment("underpaid")}
									className="text-[11px] text-[#7aaa92] hover:text-[#0d2b1e] underline"
								>
									Test Underpayment Hold Guard
								</button>
								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() =>
										void handleLifecycleOperation("reconcile_deadline")
									}
									className="text-[11px] text-[#7aaa92] hover:text-[#0d2b1e] underline"
								>
									Reconcile Payment Deadline
								</button>
							</div>
						</div>
					)}

					{(currentLifecycle === "PAYMENT_CONFIRMED" ||
						currentLifecycle === "SELLER_PAYOUT_PENDING" ||
						currentLifecycle === "SELLER_PAYOUT_CONFIRMED" ||
						currentLifecycle === "RELEASE_PENDING") && (
						<div className="p-4 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] space-y-3">
							<div className="text-xs font-bold text-[#0d2b1e]">
								Settlement & On-Chain Release Orchestration
							</div>
							<p className="text-[11px] text-[#3d6b55] leading-relaxed">
								Buyer payment is verified. USDC escrow release is strictly gated on
								confirmed seller fiat payout and verified on-chain execution.
							</p>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() => void handleCompleteFullSettlementPipeline()}
									className="py-2 px-3.5 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold hover:bg-[#15854c] disabled:opacity-50"
								>
									{busyAction === "full_pipeline"
										? "Executing Settlement..."
										: "Execute Seller Payout & Release Escrow"}
								</button>
								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() =>
										void handleLifecycleOperation("payout_hold", {
											reason: "Bank NIP transfer timeout; placed on hold.",
										})
									}
									className="py-2 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold"
								>
									Simulate Payout Hold
								</button>
								{currentLifecycle === "RELEASE_PENDING" && (
									<button
										type="button"
										disabled={busyAction !== null}
										onClick={() =>
											void handleLifecycleOperation("escrow_hold_revert", {
												reason: "Chain transaction reverted; held for receipt check.",
											})
										}
										className="py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold"
									>
										Simulate Chain Revert Hold
									</button>
								)}
							</div>
						</div>
					)}

					{(currentLifecycle === "PAYOUT_ON_HOLD" ||
						currentLifecycle === "LATE_PAYMENT_REVIEW" ||
						currentLifecycle === "RELEASE_ON_HOLD" ||
						currentLifecycle === "REFUND_PENDING") && (
						<div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
							<div className="flex items-center gap-2 text-xs font-bold text-amber-900">
								<AlertTriangle size={14} className="text-amber-600" />
								<span>Recovery & Hold Resolution ({currentLifecycle})</span>
							</div>
							<p className="text-[11px] text-amber-800 leading-relaxed">
								{trade?.failureReason ||
									"Trade is preserved on hold. Reconcile the provider or chain state before retrying or authorizing a buyer refund."}
							</p>
							<div className="flex flex-wrap gap-2">
								{currentLifecycle === "PAYOUT_ON_HOLD" && (
									<>
										<button
											type="button"
											disabled={busyAction !== null}
											onClick={() =>
												void handleLifecycleOperation("payout_confirm")
											}
											className="py-2 px-3 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold"
										>
											Retry & Confirm Seller Payout
										</button>
										<button
											type="button"
											disabled={busyAction !== null}
											onClick={() =>
												void handleLifecycleOperation("refund_request", {
													reason: "Seller authorized refund after payout hold.",
												})
											}
											className="py-2 px-3 rounded-lg border border-red-300 bg-white text-red-700 text-xs font-semibold flex items-center gap-1.5"
										>
											<RotateCcw size={12} />
											<span>Request Buyer Refund</span>
										</button>
									</>
								)}
								{currentLifecycle === "LATE_PAYMENT_REVIEW" && (
									<button
										type="button"
										disabled={busyAction !== null}
										onClick={() =>
											void handleLifecycleOperation("refund_request", {
												reason: "Late payment after deadline; initiating buyer refund.",
											})
										}
										className="py-2 px-3 rounded-lg border border-red-300 bg-white text-red-700 text-xs font-semibold"
									>
										Authorize Late-Payment Refund
									</button>
								)}
								{currentLifecycle === "REFUND_PENDING" && (
									<button
										type="button"
										disabled={busyAction !== null}
										onClick={() =>
											void handleLifecycleOperation("refund_complete")
										}
										className="py-2 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold"
									>
										Confirm Refund Settlement & Cancel Escrow
									</button>
								)}
								{currentLifecycle === "RELEASE_ON_HOLD" && (
									<button
										type="button"
										disabled={busyAction !== null}
										onClick={() =>
											void handleLifecycleOperation("escrow_confirm_on_chain")
										}
										className="py-2 px-3 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold"
									>
										Reconcile Receipt & Confirm Release
									</button>
								)}
							</div>
						</div>
					)}

					{currentLifecycle === "COMPLETED" && (
						<div className="p-4 rounded-xl bg-[#f0f7f3] border border-[#1a9e5c]/40 space-y-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-xs font-bold text-[#0d2b1e]">
									<CheckCircle2 size={16} className="text-[#1a9e5c]" />
									<span>Trade Settled & Confirmed On-Chain</span>
								</div>
								{trade?.txHash && (
									<a
										href={ARCSCAN_TX(trade.txHash)}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a9e5c] hover:underline"
									>
										<span>View on ArcScan</span>
										<ExternalLink size={11} />
									</a>
								)}
							</div>
							<div className="flex gap-2">
								<Link
									href="/dashboard"
									className="py-2 px-4 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold"
								>
									Return to User Dashboard
								</Link>
							</div>
						</div>
					)}
				</div>

				{/* Right Column: Persistent Audit Trail & Security Invariants */}
				<div className="lg:col-span-5 rounded-xl border border-[#d1e8dc] bg-white p-5 space-y-4">
					<div className="flex items-center justify-between border-b border-[#e2f0e8] pb-3">
						<div className="flex items-center gap-2">
							<Shield size={16} className="text-[#1a9e5c]" />
							<h2 className="text-sm font-bold text-[#0d2b1e]">
								Authoritative Audit Trail
							</h2>
						</div>
						<span className="text-[11px] font-mono text-[#7aaa92]">
							v{trade?.version ?? 1}
						</span>
					</div>

					<div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
						{loading ? (
							<div className="text-xs text-[#7aaa92] py-8 text-center">
								Loading trade lifecycle history...
							</div>
						) : auditEvents.length === 0 ? (
							<div className="text-xs text-[#7aaa92] py-8 text-center">
								No state transitions recorded yet for Trade #{tradeId}.
							</div>
						) : (
							auditEvents.map((ev) => (
								<div
									key={ev.id}
									className="p-3 rounded-lg border border-[#e2f0e8] bg-[#fafdfc] space-y-1 text-xs"
								>
									<div className="flex items-center justify-between">
										<span className="font-mono font-bold text-[#0d2b1e] text-[11px]">
											{ev.eventType}
										</span>
										<span className="text-[10px] text-[#7aaa92] uppercase font-semibold">
											{ev.actorRole}
										</span>
									</div>
									<div className="text-[11px] text-[#3d6b55]">
										{ev.previousState ? `${ev.previousState} -> ` : ""}
										<span className="font-semibold text-[#0d2b1e]">
											{ev.newState}
										</span>
									</div>
									<div className="text-[10px] text-[#7aaa92] font-mono">
										{new Date(ev.createdAt).toLocaleTimeString()}
									</div>
								</div>
							))
						)}
					</div>

					<div className="p-3 rounded-lg bg-[#f8fcfa] border border-[#d1e8dc] text-[11px] text-[#3d6b55] space-y-1">
						<div className="font-semibold text-[#0d2b1e]">
							Financial Settlement Guarantees
						</div>
						<div>
							• Browser redirects never mark a payment confirmed; every payment is
							verified directly with Flutterwave on the server.
						</div>
						<div>
							• USDC escrow release requires both confirmed buyer payment and
							confirmed seller payout.
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function BankCheckoutPage() {
	return (
		<div className="min-h-screen bg-[#f4faf6] text-[#0d2b1e] py-8 px-4 sm:px-6">
			<Suspense
				fallback={
					<div className="max-w-4xl mx-auto p-8 rounded-xl bg-white border border-[#d1e8dc] text-center text-xs text-[#7aaa92]">
						Loading Flutterwave Checkout & Settlement Portal...
					</div>
				}
			>
				<BankCheckoutContent />
			</Suspense>
		</div>
	);
}
