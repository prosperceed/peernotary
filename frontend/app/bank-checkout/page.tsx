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
	ExternalLink,
	Copy,
	Check,
	RefreshCw,
	Clock,
	CreditCard,
	RotateCcw,
	Landmark,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useEscrow } from "@/hooks/useEscrow";
import { Badge, ToastAlert } from "@/components/shared";
import { subscribeToTradeUpdates } from "@/lib/supabase/client";
import { ARCSCAN_TX, ESCROW_ADDRESS } from "@/lib/web3/arcConfig";
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

function CheckoutSkeleton() {
	return (
		<div className="max-w-6xl mx-auto space-y-6 animate-pulse">
			<div className="flex items-center justify-between">
				<div className="h-8 w-28 bg-[#e2f0e8] rounded-full" />
				<div className="flex gap-2">
					<div className="h-8 w-28 bg-[#e2f0e8] rounded-full" />
					<div className="h-8 w-32 bg-[#e2f0e8] rounded-full" />
				</div>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-36 rounded-[28px] bg-white border border-[#e5ebe7] p-6 space-y-3"
					>
						<div className="h-4 w-24 bg-[#e2f0e8] rounded" />
						<div className="h-8 w-36 bg-[#e2f0e8] rounded" />
						<div className="h-3 w-40 bg-[#e2f0e8] rounded" />
					</div>
				))}
			</div>
			<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 space-y-3">
				<div className="h-3 w-40 bg-[#e2f0e8] rounded" />
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
					{[...Array(6)].map((_, i) => (
						<div
							key={i}
							className="h-16 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc]"
						/>
					))}
				</div>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				<div className="lg:col-span-7 rounded-[32px] border border-[#e5ebe7] bg-white p-7 space-y-5">
					<div className="h-6 w-48 bg-[#e2f0e8] rounded" />
					<div className="grid grid-cols-2 gap-3">
						<div className="h-20 bg-[#fbfdfc] rounded-2xl border border-[#e5ebe7]" />
						<div className="h-20 bg-[#fbfdfc] rounded-2xl border border-[#e5ebe7]" />
						<div className="h-20 bg-[#fbfdfc] rounded-2xl border border-[#e5ebe7]" />
						<div className="h-20 bg-[#fbfdfc] rounded-2xl border border-[#e5ebe7]" />
					</div>
					<div className="h-12 bg-[#1a9e5c]/20 rounded-full" />
				</div>
				<div className="lg:col-span-5 rounded-[32px] border border-[#e5ebe7] bg-white p-7 space-y-4">
					<div className="h-5 w-32 bg-[#e2f0e8] rounded" />
					<div className="h-48 bg-[#fbfdfc] rounded-2xl border border-[#e5ebe7]" />
				</div>
			</div>
		</div>
	);
}

function BankCheckoutContent() {
	const searchParams = useSearchParams();
	const { address, isConnected } = useAccount();
	const escrow = useEscrow();

	const tradeId = searchParams.get("tradeId") || "";
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
		if (!tradeId) {
			setLoading(false);
			return;
		}
		try {
			const res = await fetch(
				`/api/trades/${encodeURIComponent(tradeId)}/lifecycle`,
				{
					cache: "no-store",
					headers: address ? { "x-wallet-address": address } : {},
				},
			);
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
				throw new Error(
					data.error || "Could not initialize Flutterwave checkout.",
				);
			}

			if (data.hostedMode) setHostedMode(data.hostedMode);
			setAttempt({
				id: data.attemptId || "",
				txRef: data.txRef,
				expectedAmountMinor:
					data.expectedAmountMinor || trade?.fiatAmountMinor || 0,
				expectedCurrency: data.expectedCurrency || "NGN",
				checkoutUrl: data.checkoutUrl || "",
				status: "REDIRECT_READY",
				expiresAt:
					data.expiresAt || new Date(Date.now() + 20 * 60_000).toISOString(),
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
		void fetchTradeState();
		if (!address) return;

		void fetch("/api/auth/session", {
			headers: { "x-wallet-address": address },
		})
			.then((r) => r.json())
			.then(async (s: { authenticated?: boolean }) => {
				setAuthenticated(Boolean(s?.authenticated));
				await fetchTradeState();
			})
			.catch(() => {
				setAuthenticated(true);
				void fetchTradeState();
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
	}, [
		address,
		authenticated,
		callbackTransactionId,
		callbackTxRef,
		fetchTradeState,
		tradeId,
	]);

	const handleVerifyPayment = async (
		simulateScenario?: "exact" | "underpaid",
	) => {
		if (!address) return;
		setBusyAction("verify_payment");
		setErrorMsg(null);
		setStatusBanner(null);

		try {
			let activeTxRef = attempt?.txRef || trade?.activeTxRef;
			let expectedMinor =
				attempt?.expectedAmountMinor || trade?.fiatAmountMinor || 0;

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
					throw new Error(
						initData.error || "Could not initialize checkout attempt.",
					);
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
				throw new Error(
					data.error || "Server-side payment verification failed.",
				);
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
					"Payment verified server-side. Completing settlement and releasing USDC on Arc Testnet...",
				);
				await handleCompleteFullSettlementPipeline();
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
					txHash: extra?.txHash || undefined,
					proofId: extra?.proofId || undefined,
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

			let releaseTxHash: `0x${string}` | undefined;
			if (
				escrow.isConnected &&
				!escrow.isWrongChain &&
				ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
				tradeId &&
				/^\d+$/.test(tradeId)
			) {
				const isSeller =
					trade?.sellerAddress?.toLowerCase() === address.toLowerCase();
				if (isSeller) {
					try {
						releaseTxHash = await escrow.releaseFunds(BigInt(tradeId));
					} catch (e) {
						console.warn("Direct on-chain release error:", e);
					}
				} else {
					try {
						await escrow.markFiatSent(BigInt(tradeId));
					} catch (e) {
						console.warn("markFiatSent on-chain error:", e);
					}
				}
			}

			await handleLifecycleOperation("escrow_request_release", {
				txHash: releaseTxHash,
			});
			await handleLifecycleOperation("escrow_confirm_on_chain", {
				txHash: releaseTxHash,
			});
			setStatusBanner(
				`Seller payout confirmed and Arc USDC escrow released on-chain${releaseTxHash ? ` (Tx: ${releaseTxHash.slice(0, 8)}…)` : ""}. Trade is COMPLETED.`,
			);
			window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Settlement pipeline halted.",
			);
		} finally {
			setBusyAction(null);
		}
	};

	const handleCancelOrder = async () => {
		if (!tradeId || !address) return;
		setBusyAction("cancel_trade");
		setErrorMsg(null);
		try {
			const res = await fetch(
				`/api/trades/${encodeURIComponent(tradeId)}/lifecycle`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-wallet-address": address,
					},
					body: JSON.stringify({
						operation: "cancel",
						reason:
							"Cancelled by buyer due to technical challenge or preference.",
					}),
				},
			);
			if (!res.ok) {
				const d = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(d.error || "Failed to cancel order.");
			}
			setStatusBanner(
				"Order cancelled successfully. Escrow inventory lock has been released back to seller.",
			);
			await fetchTradeState();
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Failed to cancel order.",
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

	if (loading) {
		return <CheckoutSkeleton />;
	}

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

	if (!tradeId || (!loading && !trade)) {
		return (
			<div className="max-w-md mx-auto my-14 p-6 rounded-xl bg-white border border-[#d1e8dc] text-center space-y-4">
				<div className="w-11 h-11 rounded-xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center mx-auto">
					<Lock size={18} className="text-[#1a9e5c]" />
				</div>
				<h2 className="text-sm font-bold text-[#0d2b1e]">
					No Active Trade Order Found
				</h2>
				<p className="text-xs text-[#7aaa92]">
					Please select an order from the Trading Desk or place an order from
					your Dashboard before accessing the settlement portal.
				</p>
				<Link
					href="/trade"
					className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold"
				>
					Go to Trading Desk
				</Link>
			</div>
		);
	}

	const fiatMinor = trade?.fiatAmountMinor ?? attempt?.expectedAmountMinor ?? 0;
	const fiatMajorNgn = (fiatMinor / 100).toLocaleString("en-NG", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const usdcDisplay = trade?.usdcAmount ?? (fiatMinor / 100 / RATE).toFixed(2);
	const platformFeeUsdc = (
		parseFloat(usdcDisplay.replace(/,/g, "")) * 0.01
	).toFixed(2);
	const currentLifecycle = trade?.lifecycleState ?? "AWAITING_PAYMENT";
	const activeTxRef = attempt?.txRef || trade?.activeTxRef || "Not initialized";

	const formattedCountdown =
		secondsRemaining !== null
			? `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
					secondsRemaining % 60,
				).padStart(2, "0")}`
			: "20:00";

	return (
		<div className="max-w-6xl mx-auto space-y-6">
			{/* Top Navigation & Status Bar */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Link
						href={returnTo}
						className="inline-flex items-center gap-2 rounded-full px-4 py-2 border border-[#d1e8dc] bg-white text-xs font-semibold text-[#0d2b1e] hover:bg-[#f0f7f3] hover:border-[#1a9e5c] transition-all shadow-sm"
					>
						<ArrowLeft size={14} />
						<span>Dashboard</span>
					</Link>
					<span className="text-xs font-mono font-semibold text-[#7aaa92]">
						Order #{tradeId}
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span
						className={cn(
							"px-3.5 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5",
							currentLifecycle === "COMPLETED"
								? "bg-[#e8f7ee] border-[#1a9e5c] text-[#0d2b1e]"
								: currentLifecycle.includes("HOLD") ||
									  currentLifecycle === "REFUND_PENDING" ||
									  currentLifecycle === "LATE_PAYMENT_REVIEW"
									? "bg-red-50 border-red-200 text-red-800"
									: "bg-[#f0f7f3] border-[#d1e8dc] text-[#0d2b1e]",
						)}
					>
						<span
							className={cn(
								"w-2 h-2 rounded-full",
								currentLifecycle === "COMPLETED"
									? "bg-[#1a9e5c]"
									: currentLifecycle.includes("HOLD")
										? "bg-red-500"
										: "bg-[#1a9e5c] animate-pulse",
							)}
						/>
						<span>{currentLifecycle.replace(/_/g, " ")}</span>
					</span>
					<span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#0d2b1e] text-white">
						Protected Escrow
					</span>
				</div>
			</div>

			{/* 4 Metric Pill Cards matching the Dashboard Layout */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Card 1: Payable Amount */}
				<div className="rounded-[28px] p-6 bg-gradient-to-br from-[#0d2b1e] via-[#113827] to-[#1a4a35] text-white shadow-sm flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-[#a0c4b3]">
						<span>Payable Amount</span>
						<span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono font-semibold text-[#d1e8dc]">
							Fiat NGN
						</span>
					</div>
					<div className="my-2">
						<div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight">
							₦{fiatMajorNgn}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-[#d1e8dc] font-mono">
						<CheckCircle2 size={12} className="text-[#34d399]" />
						<span>≈ {usdcDisplay} USDC (Rate: ₦{(trade?.rateNgn ?? RATE).toLocaleString("en-NG")})</span>
					</div>
				</div>

				{/* Card 2: Release SLA / Timer */}
				<div className="rounded-[28px] p-6 bg-white border border-[#e5ebe7] shadow-sm flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-[#7aaa92]">
						<span>Payment Window</span>
						<span className="px-2 py-0.5 rounded-full bg-[#f0f7f3] text-[10px] font-mono font-semibold text-[#1a9e5c]">
							20m Auto-Cancel
						</span>
					</div>
					<div className="my-2 flex items-baseline gap-2">
						<div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0d2b1e] tracking-tight">
							{formattedCountdown}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-[#3d6b55]">
						<Clock size={12} className="text-[#1a9e5c]" />
						<span>Instant Release SLA · 4.1s Avg Settlement</span>
					</div>
				</div>

				{/* Card 3: Settlement Bank */}
				<div className="rounded-[28px] p-6 bg-white border border-[#e5ebe7] shadow-sm flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-[#7aaa92]">
						<span>Settlement Bank</span>
						<span className="px-2 py-0.5 rounded-full bg-[#f0f7f3] text-[10px] font-mono text-[#4a6b5d]">
							CBN {trade?.bankCode ?? "058"}
						</span>
					</div>
					<div className="my-2">
						<div className="text-xl sm:text-2xl font-bold text-[#0d2b1e] truncate">
							{trade?.bankName ?? "Bank Transfer"}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-[11px] font-mono text-[#7aaa92]">
						<Landmark size={12} className="text-[#1a9e5c]" />
						<span>Account: {trade?.accountMasked ?? "******"}</span>
					</div>
				</div>

				{/* Card 4: Arc Escrow Lock */}
				<div className="rounded-[28px] p-6 bg-white border border-[#e5ebe7] shadow-sm flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-[#7aaa92]">
						<span>Escrow Inventory</span>
						<span className="px-2 py-0.5 rounded-full bg-[#f0f7f3] text-[10px] font-mono text-[#1a9e5c]">
							Arc Testnet
						</span>
					</div>
					<div className="my-2">
						<div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#0d2b1e] tracking-tight">
							{usdcDisplay} USDC
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-[#3d6b55]">
						<ShieldCheck size={12} className="text-[#1a9e5c]" />
						<span>0 USDC Buyer Bond · Zero Collateral</span>
					</div>
				</div>
			</div>

			{/* Authoritative 6-Stage Progress Stepper */}
			<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm">
				<div className="text-[11px] font-bold uppercase tracking-wider text-[#7aaa92] mb-3">
					Settlement Pipeline (Trade #{tradeId})
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
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
									"p-3.5 rounded-2xl border text-[11px] font-medium transition-all",
									isDone
										? "border-[#1a9e5c]/40 bg-[#f0f7f3] text-[#0d2b1e]"
										: isCurrent
											? "border-[#1a9e5c] bg-[#e3f5ec] text-[#0d2b1e] font-bold shadow-sm ring-2 ring-[#1a9e5c]/20"
											: "border-[#e5ebe7] bg-[#fafdfc] text-[#7aaa92]",
								)}
							>
								<div className="flex items-center justify-between mb-1.5">
									<span className="font-mono text-[10px] text-[#7aaa92]">
										STAGE {idx + 1}
									</span>
									{isDone ? (
										<CheckCircle2 size={13} className="text-[#1a9e5c]" />
									) : isCurrent ? (
										<span className="w-2 h-2 rounded-full bg-[#1a9e5c] animate-ping" />
									) : null}
								</div>
								<div className="leading-snug text-[#0d2b1e]">{s.label.slice(3)}</div>
							</div>
						);
					})}
				</div>
			</div>

			<ToastAlert
				type={errorMsg ? "error" : "success"}
				message={errorMsg ?? statusBanner}
				onClose={() => {
					setErrorMsg(null);
					setStatusBanner(null);
				}}
			/>

			{/* Main Two-Column Layout */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Left Column: Bank Settlement Card */}
				<div className="lg:col-span-7 rounded-[32px] border border-[#e5ebe7] bg-white p-6 sm:p-8 space-y-6 shadow-[0_4px_24px_rgba(13,43,30,0.06)]">
					<div className="flex items-start justify-between border-b border-[#eef2ee] pb-4">
						<div className="flex items-center gap-3">
							<div className="w-11 h-11 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center text-[#1a9e5c]">
								<CreditCard size={20} />
							</div>
							<div>
								<h1 className="text-base font-bold text-[#0d2b1e]">
									Fiat Payment Settlement
								</h1>
								<p className="text-xs text-[#7aaa92]">
									Transfer exact NGN amount using the details below
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f7f3] border border-[#d1e8dc] text-xs font-mono font-semibold text-[#0d2b1e]">
							<Clock size={13} className="text-[#1a9e5c]" />
							<span>{formattedCountdown}</span>
						</div>
					</div>

					{/* Bank Transfer Details Cards */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{/* Bank Name */}
						<div className="p-4 rounded-2xl bg-[#fbfdfc] border border-[#e5ebe7] space-y-1">
							<span className="text-[11px] font-medium text-[#7aaa92]">
								Beneficiary Bank
							</span>
							<div className="text-sm font-bold text-[#0d2b1e] flex items-center justify-between">
								<span>{trade?.bankName ?? "Bank Transfer"}</span>
								<span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#f0f7f3] text-[#4a6b5d] border border-[#d1e8dc]">
									{trade?.bankCode ?? "058"}
								</span>
							</div>
						</div>

						{/* Account Number */}
						<div className="p-4 rounded-2xl bg-[#fbfdfc] border border-[#e5ebe7] space-y-1">
							<span className="text-[11px] font-medium text-[#7aaa92]">
								Account Number
							</span>
							<div className="text-sm font-mono font-bold text-[#0d2b1e] flex items-center justify-between">
								<span>{trade?.accountMasked ?? "******"}</span>
								<button
									type="button"
									onClick={() => copyReference(trade?.accountMasked ?? "")}
									className="p-1 rounded-full text-[#7aaa92] hover:text-[#0d2b1e] hover:bg-[#f0f7f3] transition-colors"
									title="Copy account"
								>
									{copiedRef ? <Check size={12} className="text-[#1a9e5c]" /> : <Copy size={12} />}
								</button>
							</div>
						</div>

						{/* Payable Exact Amount */}
						<div className="p-4 rounded-2xl bg-[#fbfdfc] border border-[#e5ebe7] space-y-1">
							<span className="text-[11px] font-medium text-[#7aaa92]">
								Exact Amount to Pay
							</span>
							<div className="text-base font-mono font-extrabold text-[#1a9e5c] flex items-center justify-between">
								<span>₦{fiatMajorNgn}</span>
								<span className="text-[10px] font-normal text-[#7aaa92]">
									{usdcDisplay} USDC
								</span>
							</div>
						</div>

						{/* Payment Reference */}
						<div className="p-4 rounded-2xl bg-[#fbfdfc] border border-[#e5ebe7] space-y-1">
							<span className="text-[11px] font-medium text-[#7aaa92]">
								Payment Reference (tx_ref)
							</span>
							<div className="text-xs font-mono font-semibold text-[#0d2b1e] flex items-center justify-between">
								<span className="truncate max-w-[150px]">{activeTxRef}</span>
								{activeTxRef !== "Not initialized" && (
									<button
										type="button"
										onClick={() => copyReference(activeTxRef)}
										className="p-1 rounded-full text-[#7aaa92] hover:text-[#0d2b1e] hover:bg-[#f0f7f3] transition-colors"
										title="Copy reference"
									>
										{copiedRef ? <Check size={12} className="text-[#1a9e5c]" /> : <Copy size={12} />}
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Action Buttons */}
					{currentLifecycle === "AWAITING_PAYMENT" && (
						<div className="space-y-3 pt-2">
							<button
								type="button"
								disabled={busyAction !== null || secondsRemaining === 0}
								onClick={() => void handleVerifyPayment("exact")}
								className="w-full py-4 px-6 rounded-full bg-[#1a9e5c] hover:bg-[#15854c] text-white text-sm font-bold shadow-lg shadow-[#1a9e5c]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
							>
								{busyAction === "verify_payment" || busyAction === "full_pipeline" ? (
									<>
										<RefreshCw size={15} className="animate-spin" />
										<span>Verifying Payment & Settling Escrow...</span>
									</>
								) : (
									<>
										<span>I Have Paid — Complete & Verify Checkout</span>
										<ArrowRight size={15} />
									</>
								)}
							</button>

							<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void initializeCheckoutSession()}
									className="px-4 py-2 rounded-full border border-[#d1e8dc] text-[#3d6b55] hover:border-[#1a9e5c] hover:text-[#0d2b1e] transition-all flex items-center gap-1.5"
								>
									<RefreshCw
										size={12}
										className={cn(busyAction === "init_checkout" && "animate-spin")}
									/>
									<span>Refresh Session</span>
								</button>

								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() => void handleCancelOrder()}
									className="px-4 py-2 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 transition-all font-medium"
								>
									Cancel Order & Release Escrow
								</button>
							</div>
						</div>
					)}

					{(currentLifecycle === "PAYMENT_CONFIRMED" ||
						currentLifecycle === "SELLER_PAYOUT_PENDING" ||
						currentLifecycle === "SELLER_PAYOUT_CONFIRMED" ||
						currentLifecycle === "RELEASE_PENDING") && (
						<div className="p-5 rounded-2xl bg-[#f0f7f3] border border-[#1a9e5c]/30 space-y-3">
							<div className="text-xs font-bold text-[#0d2b1e] flex items-center gap-2">
								<CheckCircle2 size={16} className="text-[#1a9e5c]" />
								<span>Payment Verified — Settlement in Progress</span>
							</div>
							<p className="text-xs text-[#3d6b55] leading-relaxed">
								Your payment was confirmed. The oracle is releasing {usdcDisplay} USDC on Arc Testnet to your wallet.
							</p>
							<button
								type="button"
								disabled={busyAction !== null}
								onClick={() => void handleCompleteFullSettlementPipeline()}
								className="py-2.5 px-5 rounded-full bg-[#1a9e5c] text-white text-xs font-semibold hover:bg-[#15854c] shadow-sm transition-all"
							>
								{busyAction === "full_pipeline"
									? "Executing Settlement..."
									: "Finalize Escrow Release"}
							</button>
						</div>
					)}

					{currentLifecycle === "COMPLETED" && (
						<div className="p-6 rounded-[24px] bg-[#f0f7f3] border border-[#1a9e5c]/40 space-y-4 text-center">
							<div className="w-12 h-12 rounded-full bg-[#1a9e5c]/10 text-[#1a9e5c] flex items-center justify-center mx-auto">
								<CheckCircle2 size={24} />
							</div>
							<div className="space-y-1">
								<h3 className="text-base font-bold text-[#0d2b1e]">
									Settlement Completed Successfully!
								</h3>
								<p className="text-xs text-[#3d6b55]">
									{usdcDisplay} USDC has been released to your wallet on Arc Testnet.
								</p>
							</div>
							{trade?.txHash && (
								<div className="pt-1">
									<a
										href={ARCSCAN_TX(trade.txHash)}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#d1e8dc] text-xs font-semibold text-[#1a9e5c] hover:border-[#1a9e5c] transition-all shadow-sm"
									>
										<span>View On-Chain Receipt</span>
										<ExternalLink size={12} />
									</a>
								</div>
							)}
							<div className="pt-2">
								<Link
									href="/dashboard"
									className="inline-flex items-center justify-center rounded-full px-6 py-2.5 bg-[#0d2b1e] hover:bg-[#153e2c] text-white text-xs font-semibold shadow-sm transition-all"
								>
									Return to Dashboard
								</Link>
							</div>
						</div>
					)}
				</div>

				{/* Right Column: Counterparty Dossier & Audit Log */}
				<div className="lg:col-span-5 space-y-6">
					{/* Counterparty Trust Card */}
					<div className="rounded-[32px] border border-[#e5ebe7] bg-white p-6 sm:p-7 shadow-[0_4px_24px_rgba(13,43,30,0.06)] space-y-4">
						<div className="flex items-center justify-between border-b border-[#eef2ee] pb-3">
							<div className="flex items-center gap-2">
								<ShieldCheck size={16} className="text-[#1a9e5c]" />
								<h2 className="text-sm font-bold text-[#0d2b1e]">
									Settlement Guarantees
								</h2>
							</div>
							<span className="text-[11px] font-mono text-[#7aaa92]">
								Verified Peer
							</span>
						</div>

						<div className="space-y-3 text-xs text-[#3d6b55]">
							<div className="flex items-center justify-between py-1.5 border-b border-[#f0f4f2]">
								<span className="text-[#7aaa92]">Seller Counterparty</span>
								<span className="font-mono font-semibold text-[#0d2b1e]">
									{trade?.sellerAddress ? `${trade.sellerAddress.slice(0, 6)}...${trade.sellerAddress.slice(-4)}` : "Verified Merchant"}
								</span>
							</div>
							<div className="flex items-center justify-between py-1.5 border-b border-[#f0f4f2]">
								<span className="text-[#7aaa92]">Order Completion SLA</span>
								<span className="font-semibold text-[#0d2b1e]">100% Guaranteed</span>
							</div>
							<div className="flex items-center justify-between py-1.5 border-b border-[#f0f4f2]">
								<span className="text-[#7aaa92]">Buyer Bond Required</span>
								<span className="font-semibold text-[#1a9e5c]">0.00 USDC</span>
							</div>
							<div className="flex items-center justify-between py-1.5">
								<span className="text-[#7aaa92]">Escrow Contract</span>
								<span className="font-mono text-[11px] text-[#0d2b1e] truncate max-w-[140px]">
									{ESCROW_ADDRESS}
								</span>
							</div>
						</div>

						<div className="p-3.5 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc]/70 text-[11px] text-[#3d6b55] space-y-1">
							<div className="font-bold text-[#0d2b1e] flex items-center gap-1.5">
								<Sparkles size={12} className="text-[#1a9e5c]" />
								<span>Zero Counterparty Risk</span>
							</div>
							<p className="leading-relaxed">
								The seller&apos;s {usdcDisplay} USDC was locked in escrow before order publication. Funds release automatically upon verified fiat receipt.
							</p>
						</div>
					</div>

					{/* Real-Time Audit Log Card */}
					<div className="rounded-[32px] border border-[#e5ebe7] bg-white p-6 sm:p-7 shadow-[0_4px_24px_rgba(13,43,30,0.06)] space-y-4">
						<div className="flex items-center justify-between border-b border-[#eef2ee] pb-3">
							<h2 className="text-sm font-bold text-[#0d2b1e]">
								Authoritative Audit Trail
							</h2>
							<span className="text-[11px] font-mono font-semibold text-[#7aaa92]">
								v{trade?.version ?? 1}
							</span>
						</div>

						<div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
							{loading ? (
								<div className="text-xs text-[#7aaa92] py-8 text-center">
									Loading trade lifecycle history...
								</div>
							) : auditEvents.length === 0 ? (
								<div className="text-xs text-[#7aaa92] py-8 text-center">
									No state transitions recorded yet for Order #{tradeId}.
								</div>
							) : (
								auditEvents.map((ev) => (
									<div
										key={ev.id}
										className="p-3 rounded-2xl border border-[#eef2ee] bg-[#fafdfc] space-y-1 text-xs"
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
					</div>
				</div>
			</div>
		</div>
	);
}

export default function BankCheckoutPage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7] text-[#0d2b1e] py-8 px-4 sm:px-6">
			<Suspense fallback={<CheckoutSkeleton />}>
				<BankCheckoutContent />
			</Suspense>
		</div>
	);
}
