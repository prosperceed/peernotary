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
import { IS_TESTNET } from "@/lib/env/network";
import TxStatusBanner from "@/components/web3/TxStatusBanner";
import { Badge, ToastAlert } from "@/components/shared";
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
				<div className="h-8 w-28 bg-accent-soft rounded-full" />
				<div className="flex gap-2">
					<div className="h-8 w-28 bg-accent-soft rounded-full" />
					<div className="h-8 w-32 bg-accent-soft rounded-full" />
				</div>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-36 rounded-xl bg-surface border border-line p-6 space-y-3"
					>
						<div className="h-4 w-24 bg-accent-soft rounded" />
						<div className="h-8 w-36 bg-accent-soft rounded" />
						<div className="h-3 w-40 bg-accent-soft rounded" />
					</div>
				))}
			</div>
			<div className="rounded-xl border border-line bg-surface p-6 space-y-3">
				<div className="h-3 w-40 bg-accent-soft rounded" />
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
					{[...Array(6)].map((_, i) => (
						<div
							key={i}
							className="h-16 rounded-xl bg-subtle border border-line"
						/>
					))}
				</div>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				<div className="lg:col-span-7 rounded-xl border border-line bg-surface p-7 space-y-5">
					<div className="h-6 w-48 bg-accent-soft rounded" />
					<div className="grid grid-cols-2 gap-3">
						<div className="h-20 bg-surface rounded-xl border border-line" />
						<div className="h-20 bg-surface rounded-xl border border-line" />
						<div className="h-20 bg-surface rounded-xl border border-line" />
						<div className="h-20 bg-surface rounded-xl border border-line" />
					</div>
					<div className="h-12 bg-accent/20 rounded-full" />
				</div>
				<div className="lg:col-span-5 rounded-xl border border-line bg-surface p-7 space-y-4">
					<div className="h-5 w-32 bg-accent-soft rounded" />
					<div className="h-48 bg-surface rounded-xl border border-line" />
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
			<div className="max-w-md mx-auto my-14 p-6 rounded-lg bg-surface border border-line text-center space-y-4">
				<div className="w-11 h-11 rounded-lg bg-subtle border border-line flex items-center justify-center mx-auto">
					<Lock size={18} className="text-accent" />
				</div>
				<h2 className="text-sm font-semibold text-ink">
					Wallet Sign-In Required for Checkout
				</h2>
				<p className="text-xs text-ink-3">
					Connect your wallet and sign the challenge in the dashboard before
					initiating a Flutterwave payment session.
				</p>
				<Link
					href="/dashboard"
					className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-accent text-white text-xs font-semibold"
				>
					Return to Dashboard Sign-In
				</Link>
			</div>
		);
	}

	if (!tradeId || (!loading && !trade)) {
		return (
			<div className="max-w-md mx-auto my-14 p-6 rounded-lg bg-surface border border-line text-center space-y-4">
				<div className="w-11 h-11 rounded-lg bg-subtle border border-line flex items-center justify-center mx-auto">
					<Lock size={18} className="text-accent" />
				</div>
				<h2 className="text-sm font-semibold text-ink">
					No Active Trade Order Found
				</h2>
				<p className="text-xs text-ink-3">
					Please select an order from the Trading Desk or place an order from
					your Dashboard before accessing the settlement portal.
				</p>
				<Link
					href="/trade"
					className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-accent text-white text-xs font-semibold"
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
						className="inline-flex items-center gap-2 rounded-md px-4 py-2 border border-line bg-surface text-xs font-semibold text-ink hover:bg-subtle hover:border-accent transition-colors shadow-card"
					>
						<ArrowLeft size={14} />
						<span>Dashboard</span>
					</Link>
					<span className="text-xs font-mono font-semibold text-ink-3">
						Order #{tradeId}
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span
						className={cn(
							"px-3.5 py-1.5 rounded-md text-xs font-semibold border flex items-center gap-1.5",
							currentLifecycle === "COMPLETED"
								? "bg-accent-soft border-accent text-ink"
								: currentLifecycle.includes("HOLD") ||
									  currentLifecycle === "REFUND_PENDING" ||
									  currentLifecycle === "LATE_PAYMENT_REVIEW"
									? "bg-red-50 border-red-200 text-red-800"
									: "bg-subtle border-line text-ink",
						)}
					>
						<span
							className={cn(
								"w-2 h-2 rounded-full",
								currentLifecycle === "COMPLETED"
									? "bg-accent"
									: currentLifecycle.includes("HOLD")
										? "bg-red-500"
										: "bg-accent",
							)}
						/>
						<span>{currentLifecycle.replace(/_/g, " ")}</span>
					</span>
					<span className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-ink text-white">
						Protected Escrow
					</span>
				</div>
			</div>

			{/* 4 Metric Pill Cards matching the Dashboard Layout */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Card 1: Payable Amount */}
				<div className="rounded-xl p-6 bg-ink text-white flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-[#a0c4b3]">
						<span>Payable Amount</span>
						<span className="px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-mono font-semibold text-line">
							Fiat NGN
						</span>
					</div>
					<div className="my-2">
						<div className="text-2xl sm:text-3xl font-semibold font-mono tracking-tight">
							₦{fiatMajorNgn}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-xs text-line font-mono">
						<CheckCircle2 size={12} className="text-[#34d399]" />
						<span>≈ {usdcDisplay} USDC (Rate: ₦{(trade?.rateNgn ?? RATE).toLocaleString("en-NG")})</span>
					</div>
				</div>

				{/* Card 2: Release SLA / Timer */}
				<div className="rounded-xl p-6 bg-surface border border-line shadow-card flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-ink-3">
						<span>Payment Window</span>
						<span className="px-2 py-0.5 rounded-md bg-subtle text-[11px] font-mono font-semibold text-accent">
							20m Auto-Cancel
						</span>
					</div>
					<div className="my-2 flex items-baseline gap-2">
						<div className="text-2xl sm:text-3xl font-semibold font-mono text-ink tracking-tight">
							{formattedCountdown}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-xs text-ink-2">
						<Clock size={12} className="text-accent" />
						<span>Instant Release SLA · 4.1s Avg Settlement</span>
					</div>
				</div>

				{/* Card 3: Settlement Bank */}
				<div className="rounded-xl p-6 bg-surface border border-line shadow-card flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-ink-3">
						<span>Settlement Bank</span>
						<span className="px-2 py-0.5 rounded-md bg-subtle text-[11px] font-mono text-ink-2">
							CBN {trade?.bankCode ?? "058"}
						</span>
					</div>
					<div className="my-2">
						<div className="text-xl sm:text-2xl font-semibold text-ink truncate">
							{trade?.bankName ?? "Bank Transfer"}
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-xs font-mono text-ink-3">
						<Landmark size={12} className="text-accent" />
						<span>Account: {trade?.accountMasked ?? "******"}</span>
					</div>
				</div>

				{/* Card 4: Arc Escrow Lock */}
				<div className="rounded-xl p-6 bg-surface border border-line shadow-card flex flex-col justify-between min-h-[148px]">
					<div className="flex items-center justify-between text-xs text-ink-3">
						<span>Escrow Inventory</span>
						<span className="px-2 py-0.5 rounded-md bg-subtle text-[11px] font-mono text-accent">
							{arcChain.name}
						</span>
					</div>
					<div className="my-2">
						<div className="text-2xl sm:text-3xl font-semibold font-mono text-ink tracking-tight">
							{usdcDisplay} USDC
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-xs text-ink-2">
						<ShieldCheck size={12} className="text-accent" />
						<span>0 USDC Buyer Bond · Zero Collateral</span>
					</div>
				</div>
			</div>

			{/* Authoritative 6-Stage Progress Stepper */}
			<div className="rounded-xl border border-line bg-surface p-6 shadow-card">
				<div className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">
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
									"p-3.5 rounded-xl border text-xs font-medium transition-colors",
									isDone
										? "border-accent/40 bg-subtle text-ink"
										: isCurrent
											? "border-accent bg-[#e3f5ec] text-ink font-semibold shadow-card ring-2 ring-accent/20"
											: "border-line bg-surface text-ink-3",
								)}
							>
								<div className="flex items-center justify-between mb-1.5">
									<span className="font-mono text-[11px] text-ink-3">
										STAGE {idx + 1}
									</span>
									{isDone ? (
										<CheckCircle2 size={13} className="text-accent" />
									) : isCurrent ? (
										<span className="w-2 h-2 rounded-full bg-accent" />
									) : null}
								</div>
								<div className="leading-snug text-ink">{s.label.slice(3)}</div>
							</div>
						);
					})}
				</div>
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

			{/* Main Two-Column Layout */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Left Column: Bank Settlement Card */}
				<div className="lg:col-span-7 rounded-xl border border-line bg-surface p-6 sm:p-8 space-y-6 shadow-card">
					<div className="flex items-start justify-between border-b border-subtle pb-4">
						<div className="flex items-center gap-3">
							<div className="w-11 h-11 rounded-xl bg-subtle border border-line flex items-center justify-center text-accent">
								<CreditCard size={20} />
							</div>
							<div>
								<h1 className="text-base font-semibold text-ink">
									Fiat Payment Settlement
								</h1>
								<p className="text-xs text-ink-3">
									Transfer exact NGN amount using the details below
								</p>
							</div>
						</div>
						<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle border border-line text-xs font-mono font-semibold text-ink">
							<Clock size={13} className="text-accent" />
							<span>{formattedCountdown}</span>
						</div>
					</div>

					{/* Bank Transfer Details Cards */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{/* Bank Name */}
						<div className="p-4 rounded-xl bg-surface border border-line space-y-1">
							<span className="text-xs font-medium text-ink-3">
								Beneficiary Bank
							</span>
							<div className="text-sm font-semibold text-ink flex items-center justify-between">
								<span>{trade?.bankName ?? "Bank Transfer"}</span>
								<span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-subtle text-ink-2 border border-line">
									{trade?.bankCode ?? "058"}
								</span>
							</div>
						</div>

						{/* Account Number */}
						<div className="p-4 rounded-xl bg-surface border border-line space-y-1">
							<span className="text-xs font-medium text-ink-3">
								Account Number
							</span>
							<div className="text-sm font-mono font-semibold text-ink flex items-center justify-between">
								<span>{trade?.accountMasked ?? "******"}</span>
								<button
									type="button"
									onClick={() => copyReference(trade?.accountMasked ?? "")}
									className="p-1 rounded-full text-ink-3 hover:text-ink hover:bg-subtle transition-colors"
									title="Copy account"
								>
									{copiedRef ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
								</button>
							</div>
						</div>

						{/* Payable Exact Amount */}
						<div className="p-4 rounded-xl bg-surface border border-line space-y-1">
							<span className="text-xs font-medium text-ink-3">
								Exact Amount to Pay
							</span>
							<div className="text-base font-mono font-semibold text-accent flex items-center justify-between">
								<span>₦{fiatMajorNgn}</span>
								<span className="text-[11px] font-normal text-ink-3">
									{usdcDisplay} USDC
								</span>
							</div>
						</div>

						{/* Payment Reference */}
						<div className="p-4 rounded-xl bg-surface border border-line space-y-1">
							<span className="text-xs font-medium text-ink-3">
								Payment Reference (tx_ref)
							</span>
							<div className="text-xs font-mono font-semibold text-ink flex items-center justify-between">
								<span className="truncate max-w-[150px]">{activeTxRef}</span>
								{activeTxRef !== "Not initialized" && (
									<button
										type="button"
										onClick={() => copyReference(activeTxRef)}
										className="p-1 rounded-full text-ink-3 hover:text-ink hover:bg-subtle transition-colors"
										title="Copy reference"
									>
										{copiedRef ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Action Buttons */}
					{currentLifecycle === "AWAITING_PAYMENT" && (
						<div className="space-y-3 pt-2">
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
										) : null}
										Pay ₦{fiatMajorNgn} with Flutterwave
										<ArrowRight size={15} />
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
										Already paid? Check payment status
									</button>
									{IS_TESTNET && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
											<div className="font-medium">Flutterwave test mode: no real money is charged.</div>
											<div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
												<span className="text-amber-700">Card</span><span>5531 8866 5214 2950</span>
												<span className="text-amber-700">CVV / Exp</span><span>564 · 09/32</span>
												<span className="text-amber-700">PIN / OTP</span><span>3310 · 12345</span>
											</div>
										</div>
									)}
								</>
							)}

							<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
								<button
									type="button"
									disabled={busyAction !== null || secondsRemaining === 0}
									onClick={() => void initializeCheckoutSession()}
									className="px-4 py-2 rounded-md border border-line text-ink-2 hover:border-accent hover:text-ink transition-colors flex items-center gap-1.5"
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
									className="px-4 py-2 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors font-medium"
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
						<div className="p-5 rounded-xl bg-subtle border border-accent/30 space-y-3">
							<div className="text-xs font-semibold text-ink flex items-center gap-2">
								<CheckCircle2 size={16} className="text-accent" />
								<span>Payment Verified - Settlement in Progress</span>
							</div>
							<p className="text-xs text-ink-2 leading-relaxed">
								Your payment was confirmed. The oracle is releasing {usdcDisplay} USDC on {arcChain.name} to your wallet.
							</p>
							<button
								type="button"
								disabled={busyAction !== null}
								onClick={() => void handleCompleteFullSettlementPipeline()}
								className="py-2.5 px-5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent-hover shadow-card transition-colors"
							>
								{busyAction === "full_pipeline"
									? "Executing Settlement..."
									: "Finalize Escrow Release"}
							</button>
						</div>
					)}

					{currentLifecycle === "COMPLETED" && (
						<div className="p-6 rounded-xl bg-subtle border border-accent/40 space-y-4 text-center">
							<div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
								<CheckCircle2 size={24} />
							</div>
							<div className="space-y-1">
								<h3 className="text-base font-semibold text-ink">
									Settlement Completed Successfully!
								</h3>
								<p className="text-xs text-ink-2">
									{usdcDisplay} USDC has been released to your wallet on {arcChain.name}.
								</p>
							</div>
							{trade?.proofId && (
								<div className="mx-auto max-w-md rounded-lg bg-white/90 border border-line px-3.5 py-2.5 text-left space-y-1">
									<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-accent">
										<span>TLSNotary Cryptographic Proof ID</span>
										<span>Verified On-Chain</span>
									</div>
									<div className="text-xs font-mono text-ink truncate">
										{trade.proofId}
									</div>
								</div>
							)}
							{trade?.txHash && trade.txHash !== "0x0" && (
								<div className="pt-1">
									<a
										href={ARCSCAN_TX(trade.txHash)}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface border border-line text-xs font-semibold text-accent hover:border-accent transition-colors shadow-card"
									>
										<span>View On-Chain Receipt ({trade.txHash.slice(0, 10)}...)</span>
										<ExternalLink size={12} />
									</a>
								</div>
							)}
							<div className="pt-2">
								<Link
									href="/dashboard"
									className="inline-flex items-center justify-center rounded-md px-6 py-2.5 bg-ink hover:bg-[#153e2c] text-white text-xs font-semibold shadow-card transition-colors"
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
					<div className="rounded-xl border border-line bg-surface p-6 sm:p-7 shadow-card space-y-4">
						<div className="flex items-center justify-between border-b border-subtle pb-3">
							<div className="flex items-center gap-2">
								<ShieldCheck size={16} className="text-accent" />
								<h2 className="text-sm font-semibold text-ink">
									Settlement Guarantees
								</h2>
							</div>
							<span className="text-xs font-mono text-ink-3">
								Verified Peer
							</span>
						</div>

						<div className="space-y-3 text-xs text-ink-2">
							<div className="flex items-center justify-between py-1.5 border-b border-subtle">
								<span className="text-ink-3">Seller Counterparty</span>
								<span className="font-mono font-semibold text-ink">
									{trade?.sellerAddress ? `${trade.sellerAddress.slice(0, 6)}...${trade.sellerAddress.slice(-4)}` : "Verified Merchant"}
								</span>
							</div>
							<div className="flex items-center justify-between py-1.5 border-b border-subtle">
								<span className="text-ink-3">Order Completion SLA</span>
								<span className="font-semibold text-ink">100% Guaranteed</span>
							</div>
							<div className="flex items-center justify-between py-1.5 border-b border-subtle">
								<span className="text-ink-3">Buyer Bond Required</span>
								<span className="font-semibold text-accent">0.00 USDC</span>
							</div>
							<div className="flex items-center justify-between py-1.5">
								<span className="text-ink-3">Escrow Contract</span>
								<span className="font-mono text-xs text-ink truncate max-w-[140px]">
									{ESCROW_ADDRESS}
								</span>
							</div>
						</div>

						<div className="p-3.5 rounded-xl bg-subtle border border-line/70 text-xs text-ink-2 space-y-1">
							<div className="font-semibold text-ink flex items-center gap-1.5">
								<Sparkles size={12} className="text-accent" />
								<span>Zero Counterparty Risk</span>
							</div>
							<p className="leading-relaxed">
								The seller&apos;s {usdcDisplay} USDC was locked in escrow before order publication. Funds release automatically upon verified fiat receipt.
							</p>
						</div>
					</div>

					{/* Real-Time Audit Log Card */}
					<div className="rounded-xl border border-line bg-surface p-6 sm:p-7 shadow-card space-y-4">
						<div className="flex items-center justify-between border-b border-subtle pb-3">
							<h2 className="text-sm font-semibold text-ink">
								Authoritative Audit Trail
							</h2>
							<span className="text-xs font-mono font-semibold text-ink-3">
								v{trade?.version ?? 1}
							</span>
						</div>

						<div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
							{loading ? (
								<div className="text-xs text-ink-3 py-8 text-center">
									Loading trade lifecycle history...
								</div>
							) : auditEvents.length === 0 ? (
								<div className="text-xs text-ink-3 py-8 text-center">
									No state transitions recorded yet for Order #{tradeId}.
								</div>
							) : (
								auditEvents.map((ev) => (
									<div
										key={ev.id}
										className="p-3 rounded-xl border border-subtle bg-surface space-y-1 text-xs"
									>
										<div className="flex items-center justify-between">
											<span className="font-mono font-semibold text-ink text-xs">
												{ev.eventType}
											</span>
											<span className="text-[11px] text-ink-3 uppercase font-semibold">
												{ev.actorRole}
											</span>
										</div>
										<div className="text-xs text-ink-2">
											{ev.previousState ? `${ev.previousState} -> ` : ""}
											<span className="font-semibold text-ink">
												{ev.newState}
											</span>
										</div>
										<div className="text-[11px] text-ink-3 font-mono">
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
		<div className="min-h-screen bg-subtle text-ink py-8 px-4 sm:px-6">
			<Suspense fallback={<CheckoutSkeleton />}>
				<BankCheckoutContent />
			</Suspense>
		</div>
	);
}
