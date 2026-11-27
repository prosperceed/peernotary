"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
	Lock,
	CheckCircle2,
	ArrowLeft,
	ExternalLink,
	Copy,
	Check,
	RefreshCw,
	Clock,
	ShieldCheck,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useEscrow } from "@/hooks/useEscrow";
import { IS_TESTNET } from "@/lib/env/network";
import TxStatusBanner from "@/components/web3/TxStatusBanner";
import { ToastAlert } from "@/components/shared";
import { subscribeToTradeUpdates } from "@/lib/supabase/client";
import { ARCSCAN_TX, ESCROW_ADDRESS, arcChain } from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
import type {
	EscrowOperationState,
	PaymentState,
	PayoutState,
	RefundState,
	TradeAuditEventItem,
	TradeLifecycleState,
} from "@/types";

type PaymentModeLabel = "flutterwave_test" | "flutterwave_live" | "simulated";

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
	{ state: "AWAITING_PAYMENT", label: "1. Awaiting payment" },
	{ state: "PAYMENT_CONFIRMED", label: "2. Payment verified" },
	{ state: "SELLER_PAYOUT_PENDING", label: "3. Payout pending" },
	{ state: "SELLER_PAYOUT_CONFIRMED", label: "4. Payout confirmed" },
	{ state: "RELEASE_PENDING", label: "5. Releasing USDC" },
	{ state: "COMPLETED", label: "6. Complete" },
];

function CheckoutSkeleton() {
	return (
		<div className="mx-auto max-w-6xl animate-pulse space-y-6">
			<div className="space-y-2">
				<div className="h-4 w-14 rounded bg-subtle" />
				<div className="h-7 w-56 rounded bg-subtle" />
			</div>
			<div className="card h-[76px]" />
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
				<div className="card space-y-5 p-7 lg:col-span-7">
					<div className="h-4 w-24 rounded bg-subtle" />
					<div className="h-9 w-48 rounded bg-subtle" />
					<div className="h-44 rounded-lg bg-subtle/70" />
					<div className="h-12 rounded-md bg-subtle" />
				</div>
				<div className="space-y-6 lg:col-span-5">
					<div className="card h-72" />
					<div className="card h-40" />
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

	const [paymentMode, setPaymentMode] = useState<PaymentModeLabel | null>(null);
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

	const initializeCheckoutSession = useCallback(async (): Promise<string | undefined> => {
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
				paymentMode?: PaymentModeLabel;
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
			if (data.paymentMode) setPaymentMode(data.paymentMode);
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
			return data.checkoutUrl || undefined;
		} catch (err) {
			setErrorMsg(
				err instanceof Error ? err.message : "Failed to initialize checkout.",
			);
		} finally {
			setBusyAction(null);
		}
	}, [address, fetchTradeState, tradeId]);

	/** Sends the buyer to Flutterwave's hosted page; they return with ?tx_ref=… */
	const handlePayWithFlutterwave = useCallback(async () => {
		const url = attempt?.checkoutUrl || (await initializeCheckoutSession());
		if (url) {
			window.location.assign(url);
		} else {
			setErrorMsg("Flutterwave did not return a checkout link. Try again in a moment.");
		}
	}, [attempt?.checkoutUrl, initializeCheckoutSession]);

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
				const data = (await res.json().catch(() => ({}))) as {
					ok?: boolean;
					trade?: AuthoritativeTradeDetail;
				};
				if (res.ok) {
					await fetchTradeState();
					if (data.trade?.lifecycleState === "COMPLETED") {
						setStatusBanner(
							`Payment confirmed and ${usdcDisplay} USDC released on ${arcChain.name}! Trade is COMPLETED.`,
						);
					} else {
						setStatusBanner(
							"Payment verified server-side with Flutterwave. Completing settlement...",
						);
						await handleCompleteFullSettlementPipeline();
					}
					window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
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
					// Only honoured by the server in simulated mode.
					...(paymentMode === "simulated"
						? { simulatedAmountMinor: simulatedMinor, simulatedCurrency: "NGN" }
						: {}),
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
			} else if (data.trade?.lifecycleState === "COMPLETED") {
				setStatusBanner(
					`Payment confirmed and ${usdcDisplay} USDC released on ${arcChain.name}! Trade is COMPLETED.`,
				);
				window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
			} else {
				setStatusBanner(
					`Payment verified server-side. Completing settlement and releasing USDC on ${arcChain.name}...`,
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
		if (trade?.lifecycleState === "COMPLETED") {
			setStatusBanner(
				`Trade is already COMPLETED and ${usdcDisplay} USDC released on ${arcChain.name}.`,
			);
			window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
			return;
		}
		setBusyAction("full_pipeline");
		setErrorMsg(null);
		setStatusBanner(null);

		try {
			await handleLifecycleOperation("payout_initiate");
			await handleLifecycleOperation("payout_confirm");

			let releaseTxHash: `0x${string}` | undefined;
			let tlsnProofId: string | undefined;

			// 1. Run TLSNotary MPC-TLS verification + Oracle on-chain settlement
			try {
				const sessionRes = await fetch(
					`/api/tlsn/trades/${encodeURIComponent(tradeId)}/verify`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-wallet-address": address,
						},
						body: JSON.stringify({
							action: "create_session",
							fiatAmountMinor:
								trade?.fiatAmountMinor ?? attempt?.expectedAmountMinor ?? 0,
							fiatCurrency: trade?.fiatCurrency ?? "NGN",
							bankCode: trade?.bankCode ?? "058",
							sellerAccountHash: trade?.accountMasked ?? tradeId,
						}),
					},
				);
				const sessionData = (await sessionRes.json()) as {
					session?: { sessionId: string };
				};
				const sessionId = sessionData.session?.sessionId;
				if (sessionId) {
					const proofRes = await fetch(
						`/api/tlsn/trades/${encodeURIComponent(tradeId)}/verify`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"x-wallet-address": address,
							},
							body: JSON.stringify({
								action: "execute_proof",
								sessionId,
								fiatAmountMinor:
									trade?.fiatAmountMinor ?? attempt?.expectedAmountMinor ?? 0,
								fiatCurrency: trade?.fiatCurrency ?? "NGN",
								bankCode: trade?.bankCode ?? "058",
								sellerAccountHash: trade?.accountMasked ?? tradeId,
							}),
						},
					);
					if (proofRes.ok) {
						const proofData = (await proofRes.json()) as {
							proofId?: string;
							oracleTransactionHash?: string;
						};
						if (proofData.proofId) tlsnProofId = proofData.proofId;
						if (
							proofData.oracleTransactionHash &&
							proofData.oracleTransactionHash.startsWith("0x")
						) {
							releaseTxHash = proofData.oracleTransactionHash as `0x${string}`;
						}
					}
				}
			} catch (tlsnErr) {
				console.warn("TLSN verification step warning:", tlsnErr);
			}

			// 2. If seller is connected directly on-chain and oracle didn't settle yet, allow direct release
			if (
				!releaseTxHash &&
				tradeId &&
				trade?.sellerAddress?.toLowerCase() === address.toLowerCase()
			) {
				releaseTxHash = (await escrow.releaseIfSellerCan(tradeId)) ?? undefined;
			}

			await handleLifecycleOperation("escrow_request_release", {
				txHash: releaseTxHash,
				proofId: tlsnProofId,
			});
			await handleLifecycleOperation("escrow_confirm_on_chain", {
				txHash: releaseTxHash,
				proofId: tlsnProofId,
			});
			await fetchTradeState();
			setStatusBanner(
				`TLSNotary proof verified and ${usdcDisplay} USDC released on ${arcChain.name}${releaseTxHash ? ` (Tx: ${releaseTxHash.slice(0, 10)}...)` : ""}. Trade is COMPLETED.`,
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
			<div className="card mx-auto my-16 max-w-md space-y-4 p-8 text-center">
				<div className="w-11 h-11 rounded-lg bg-subtle border border-line flex items-center justify-center mx-auto">
					<Lock size={18} className="text-accent" />
				</div>
				<h2 className="text-base font-semibold text-ink">
					Sign in to pay
				</h2>
				<p className="text-sm text-ink-3">
					Connect your wallet and sign in from the dashboard before starting a
					payment.
				</p>
				<Link
					href="/dashboard"
					className="btn-primary h-10 w-full"
				>
					Go to sign-in
				</Link>
			</div>
		);
	}

	if (!tradeId || (!loading && !trade)) {
		return (
			<div className="card mx-auto my-16 max-w-md space-y-4 p-8 text-center">
				<div className="w-11 h-11 rounded-lg bg-subtle border border-line flex items-center justify-center mx-auto">
					<Lock size={18} className="text-accent" />
				</div>
				<h2 className="text-base font-semibold text-ink">
					Order not found
				</h2>
				<p className="text-sm text-ink-3">
					Pick an offer on the trading desk, or open an order from your
					dashboard.
				</p>
				<Link
					href="/trade"
					className="btn-primary h-10 w-full"
				>
					Go to trading desk
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

	const stepIndex = Math.max(
		0,
		LIFECYCLE_STEPS.findIndex((item) => item.state === currentLifecycle),
	);
	const isDoneAll = currentLifecycle === "COMPLETED";
	const onHold =
		currentLifecycle.includes("HOLD") ||
		currentLifecycle === "REFUND_PENDING" ||
		currentLifecycle === "LATE_PAYMENT_REVIEW";
	const usdcNum = parseFloat(usdcDisplay.replace(/,/g, "")) || 0;
	const receiveUsdc = (usdcNum - parseFloat(platformFeeUsdc)).toFixed(2);
	const statusLabel = currentLifecycle.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

	return (
		<div className="mx-auto max-w-6xl space-y-6">
			{/* Header */}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<Link
						href={returnTo}
						className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
					>
						<ArrowLeft size={14} />
						Back
					</Link>
					<h1 className="mt-2 text-2xl font-bold text-ink">Pay for order #{tradeId}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
							isDoneAll
								? "border-mint/20 bg-mint-soft text-mint"
								: onHold
									? "border-red-200 bg-red-50 text-red-700"
									: "border-line bg-white text-ink-2",
						)}
					>
						<span className={cn("h-1.5 w-1.5 rounded-full", isDoneAll ? "bg-mint" : onHold ? "bg-red-500" : "bg-accent")} />
						{statusLabel}
					</span>
					{currentLifecycle === "AWAITING_PAYMENT" && (
						<span
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-medium",
								secondsRemaining !== null && secondsRemaining < 300
									? "border-amber-200 bg-amber-50 text-amber-800"
									: "border-line bg-white text-ink",
							)}
						>
							<Clock size={13} />
							{formattedCountdown}
						</span>
					)}
				</div>
			</div>

			{/* Progress */}
			<div className="card px-6 py-5">
				<ol className="flex items-start">
					{LIFECYCLE_STEPS.map((s, idx) => {
						const done = isDoneAll || idx < stepIndex;
						const current = !isDoneAll && idx === stepIndex;
						return (
							<li key={s.state} className="relative flex flex-1 flex-col items-center text-center">
								{idx > 0 && (
									<span
										className={cn(
											"absolute right-1/2 top-3 h-px w-full",
											done || current ? "bg-accent" : "bg-line",
										)}
									/>
								)}
								<span
									className={cn(
										"relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
										done
											? "border-accent bg-accent text-white"
											: current
												? "border-accent bg-white text-accent ring-4 ring-accent/10"
												: "border-line bg-white text-ink-4",
									)}
								>
									{done ? <Check size={12} strokeWidth={3} /> : idx + 1}
								</span>
								<span
									className={cn(
										"mt-2 hidden max-w-[120px] text-xs leading-snug sm:block",
										current ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-4",
									)}
								>
									{s.label.slice(3)}
								</span>
							</li>
						);
					})}
				</ol>
			</div>

			<TxStatusBanner
				txState={escrow.txState}
				txHash={escrow.txHash}
				arcScanUrl={escrow.arcScanUrl}
				errorMsg={escrow.errorMsg}
			/>

			<ToastAlert
				type={errorMsg ? "error" : "success"}
				message={errorMsg ?? statusBanner}
				onClose={() => {
					setErrorMsg(null);
					setStatusBanner(null);
				}}
			/>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
				{/* Payment */}
				<section className="card space-y-6 p-6 sm:p-7 lg:col-span-7">
					<div>
						<div className="text-[13px] font-medium text-ink-3">Amount due</div>
						<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className="font-display text-[34px] font-bold leading-none text-ink">₦{fiatMajorNgn}</span>
							<span className="text-sm text-ink-3">for {usdcDisplay} USDC</span>
						</div>
					</div>

					<dl className="divide-y divide-line rounded-lg border border-line">
						{[
							{ label: "Bank", value: trade?.bankName ?? "Bank transfer" },
							{ label: "Account number", value: trade?.accountMasked ?? "—", mono: true, copy: trade?.accountMasked },
							{ label: "Amount", value: `₦${fiatMajorNgn}`, mono: true, copy: fiatMajorNgn.replace(/,/g, "") },
							{
								label: "Reference",
								value: activeTxRef,
								mono: true,
								copy: activeTxRef !== "Not initialized" ? activeTxRef : undefined,
							},
						].map((row) => (
							<div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
								<dt className="text-sm text-ink-3">{row.label}</dt>
								<dd className={cn("flex min-w-0 items-center gap-2 text-sm text-ink", row.mono && "font-mono")}>
									<span className="truncate">{row.value}</span>
									{row.copy && (
										<button
											type="button"
											onClick={() => copyReference(row.copy ?? "")}
											className="rounded p-1 text-ink-4 transition-colors hover:bg-subtle hover:text-ink"
											title={`Copy ${row.label.toLowerCase()}`}
										>
											{copiedRef ? <Check size={13} className="text-mint" /> : <Copy size={13} />}
										</button>
									)}
								</dd>
							</div>
						))}
					</dl>

					{currentLifecycle === "AWAITING_PAYMENT" && (
						<div className="space-y-3">
							{paymentMode === "simulated" ? (
								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void handleVerifyPayment("exact")}
									className="btn-primary h-12 w-full"
								>
									{busyAction === "verify_payment" || busyAction === "full_pipeline" ? (
										<RefreshCw size={15} className="animate-spin" />
									) : null}
									Simulate payment (local dev only)
								</button>
							) : (
								<>
									<button
										type="button"
										disabled={busyAction !== null || secondsRemaining === 0}
										onClick={() => void handlePayWithFlutterwave()}
										className="btn-primary h-12 w-full"
									>
										{busyAction === "init_checkout" ? (
											<RefreshCw size={15} className="animate-spin" />
										) : (
											<Lock size={15} />
										)}
										Pay ₦{fiatMajorNgn} securely
									</button>
									<button
										type="button"
										disabled={busyAction !== null || secondsRemaining === 0}
										onClick={() => void handleVerifyPayment()}
										className="btn-secondary h-10 w-full"
									>
										{busyAction === "verify_payment" || busyAction === "full_pipeline" ? (
											<RefreshCw size={15} className="animate-spin" />
										) : null}
										I&apos;ve paid, check status
									</button>
									{IS_TESTNET && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
											<div className="font-medium">Test mode: no real money is charged.</div>
											<div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
												<span className="text-amber-700">Card</span>
												<span>5531 8866 5214 2950</span>
												<span className="text-amber-700">CVV / Exp</span>
												<span>564 · 09/32</span>
												<span className="text-amber-700">PIN / OTP</span>
												<span>3310 · 12345</span>
											</div>
										</div>
									)}
								</>
							)}

							<div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm">
								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void initializeCheckoutSession()}
									className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
								>
									<RefreshCw size={13} className={cn(busyAction === "init_checkout" && "animate-spin")} />
									Refresh payment session
								</button>
								<button
									type="button"
									disabled={busyAction !== null}
									onClick={() => void handleCancelOrder()}
									className="font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
								>
									Cancel order
								</button>
							</div>
						</div>
					)}

					{(currentLifecycle === "PAYMENT_CONFIRMED" ||
						currentLifecycle === "SELLER_PAYOUT_PENDING" ||
						currentLifecycle === "SELLER_PAYOUT_CONFIRMED" ||
						currentLifecycle === "RELEASE_PENDING") && (
						<div className="space-y-3 rounded-lg border border-accent/20 bg-accent-soft/60 p-5">
							<div className="flex items-center gap-2 text-sm font-semibold text-ink">
								<CheckCircle2 size={16} className="text-accent" />
								Payment verified
							</div>
							<p className="text-sm leading-relaxed text-ink-2">
								The escrow is releasing {receiveUsdc} USDC to your wallet on {arcChain.name}. This usually takes under a
								minute.
							</p>
							<button
								type="button"
								disabled={busyAction !== null}
								onClick={() => void handleCompleteFullSettlementPipeline()}
								className="btn-primary h-10 px-4"
							>
								{busyAction === "full_pipeline" ? <RefreshCw size={14} className="animate-spin" /> : null}
								{busyAction === "full_pipeline" ? "Releasing…" : "Finish release"}
							</button>
						</div>
					)}

					{currentLifecycle === "COMPLETED" && (
						<div className="space-y-4 rounded-lg border border-mint/20 bg-mint-soft/60 p-6 text-center">
							<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-mint shadow-card">
								<CheckCircle2 size={24} />
							</div>
							<div>
								<h3 className="text-lg font-semibold text-ink">Trade complete</h3>
								<p className="mt-1 text-sm text-ink-2">
									{receiveUsdc} USDC was released to your wallet on {arcChain.name}.
								</p>
							</div>
							{trade?.proofId && (
								<div className="mx-auto max-w-md rounded-md border border-line bg-white px-3.5 py-2.5 text-left">
									<div className="text-[11px] font-medium text-ink-3">Payment proof</div>
									<div className="truncate font-mono text-xs text-ink">{trade.proofId}</div>
								</div>
							)}
							<div className="flex flex-wrap justify-center gap-2 pt-1">
								{trade?.txHash && trade.txHash !== "0x0" && (
									<a
										href={ARCSCAN_TX(trade.txHash)}
										target="_blank"
										rel="noopener noreferrer"
										className="btn-secondary h-10 px-4"
									>
										View receipt
										<ExternalLink size={13} />
									</a>
								)}
								<Link href="/dashboard" className="btn-primary h-10 px-4">
									Go to dashboard
								</Link>
							</div>
						</div>
					)}
				</section>

				{/* Summary + activity */}
				<aside className="space-y-6 lg:col-span-5">
					<section className="card p-6">
						<h2 className="text-[15px] font-semibold text-ink">Order summary</h2>
						<dl className="mt-4 space-y-3 text-sm">
							<div className="flex justify-between">
								<dt className="text-ink-3">You pay</dt>
								<dd className="font-mono text-ink">₦{fiatMajorNgn}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-ink-3">Rate</dt>
								<dd className="font-mono text-ink">₦{(trade?.rateNgn ?? RATE).toLocaleString("en-NG")} / USDC</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-ink-3">Order size</dt>
								<dd className="font-mono text-ink">{usdcDisplay} USDC</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-ink-3">Platform fee (1%)</dt>
								<dd className="font-mono text-ink">−{platformFeeUsdc} USDC</dd>
							</div>
							<div className="flex justify-between border-t border-line pt-3">
								<dt className="font-medium text-ink">You receive</dt>
								<dd className="font-mono font-semibold text-ink">{receiveUsdc} USDC</dd>
							</div>
						</dl>
						<div className="mt-5 space-y-2 border-t border-line pt-4 text-xs">
							<div className="flex justify-between gap-3">
								<span className="text-ink-3">Seller</span>
								<span className="font-mono text-ink-2">
									{trade?.sellerAddress
										? `${trade.sellerAddress.slice(0, 6)}…${trade.sellerAddress.slice(-4)}`
										: "—"}
								</span>
							</div>
							<div className="flex justify-between gap-3">
								<span className="text-ink-3">Escrow</span>
								<span className="font-mono text-ink-2">
									{ESCROW_ADDRESS.slice(0, 6)}…{ESCROW_ADDRESS.slice(-4)} · {arcChain.name}
								</span>
							</div>
						</div>
						<div className="mt-5 flex gap-3 rounded-lg bg-subtle px-4 py-3 text-xs leading-relaxed text-ink-2">
							<ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
							<span>
								The seller&apos;s USDC was locked in escrow before this order opened. It&apos;s released to you only
								after your payment is verified.
							</span>
						</div>
					</section>

					<section className="card p-6">
						<div className="flex items-center justify-between">
							<h2 className="text-[15px] font-semibold text-ink">Activity</h2>
							<span className="text-xs text-ink-4">v{trade?.version ?? 1}</span>
						</div>
						{auditEvents.length === 0 ? (
							<p className="mt-4 text-sm text-ink-3">No activity yet.</p>
						) : (
							<ol className="mt-4 max-h-[300px] space-y-4 overflow-y-auto pr-1">
								{auditEvents.map((ev, i) => (
									<li key={ev.id} className="relative flex gap-3 text-sm">
										{i < auditEvents.length - 1 && (
											<span className="absolute left-[5px] top-4 h-[calc(100%+4px)] w-px bg-line" />
										)}
										<span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-accent bg-white" />
										<div className="min-w-0">
											<div className="text-ink">
												{ev.newState.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
											</div>
											<div className="mt-0.5 text-xs text-ink-3">
												{new Date(ev.createdAt).toLocaleTimeString()} · {ev.actorRole.toLowerCase()}
											</div>
										</div>
									</li>
								))}
							</ol>
						)}
					</section>
				</aside>
			</div>
		</div>
	);
}

export default function BankCheckoutPage() {
	return (
		<div className="min-h-screen text-ink py-8 px-4 sm:px-6">
			<Suspense fallback={<CheckoutSkeleton />}>
				<BankCheckoutContent />
			</Suspense>
		</div>
	);
}
