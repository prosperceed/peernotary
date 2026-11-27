"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	useAccount,
	useBalance,
	useConnect,
	useReadContract,
	useSignMessage,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { formatUnits } from "viem";
import {
	Shield,
	CheckCircle,
	AlertTriangle,
	Lock,
	Fingerprint,
	ArrowRight,
	ExternalLink,
	RefreshCw,
	CreditCard,
	Clock,
	Wallet,
	Search,
	ChevronRight,
	ArrowUpRight,
	Users,
	SlidersHorizontal,
	Check,
} from "lucide-react";
import { StepBar, ToastAlert, BankSearchSelect } from "@/components/shared";
import { useEscrow } from "@/hooks/useEscrow";
import TxStatusBanner from "@/components/web3/TxStatusBanner";
import {
	arcChain,
	isOnChainTradeId,
	DEFAULT_FEE_BPS,
	USDC_ADDRESS,
	USDC_ABI,
	formatUsdc,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";
import { supabaseWalletSignin } from "@/lib/supabase/client";
import { cn, RATE } from "@/lib/utils";
import { useMonierateRate } from "@/hooks/useMonierateRate";
import type {
	TradeStep,
	VerifyMode,
	PeerTradeOffer,
	UserTransaction,
	TradeLifecycleState,
	TradeAuditEventItem,
} from "@/types";

interface VerifiedProofMeta {
	proofId: string;
	sessionId: string;
	bankName: string;
	transcriptDigest?: string;
	notarySignature?: string;
	checksCount?: number;
}

interface LifecycleTradeData {
	tradeId: string;
	sellerHandle: string;
	sellerAddress: string;
	buyerAddress?: string;
	usdcAmount: string;
	ngnAmount: string;
	rateNgn: number;
	fiatAmountMinor: number;
	fiatCurrency: string;
	bankName: string;
	sellerAccountNumber: string;
	sellerAccountName: string;
	requiredCollateralUsdc: string;
	lifecycleState: TradeLifecycleState;
	paymentState: string;
	payoutState: string;
	refundState: string;
	escrowState: string;
	paymentDeadlineAt?: string;
	activeTxRef?: string;
	flwTxId?: number;
	payoutReference?: string;
	refundReference?: string;
	releaseTxHash?: string;
	tlsnProofId?: string;
	holdReason?: string;
	failureReason?: string;
	auditLog: TradeAuditEventItem[];
}

function ZKProofPanel({
	tradeId,
	amountNgn,
	bankName,
	accountNo,
	usdcAmount,
	onComplete,
}: {
	tradeId: string;
	amountNgn: string;
	bankName: string;
	accountNo: string;
	usdcAmount: string;
	onComplete: (meta: VerifiedProofMeta) => void;
}) {
	const [stage, setStage] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [proofMeta, setProofMeta] = useState<VerifiedProofMeta | null>(null);

	const stages = [
		"Initializing TLSNotary session on Rust verifier (:7047)...",
		"Generating BLAKE3 Merkle transcript commitments...",
		"Verifying X.509 certificate chain and Notary secp256k1 signature...",
		"Evaluating Arc escrow release and firing webhook...",
		"Cryptographic proof verified on-chain",
	];

	const runRealTlsnVerification = useCallback(async () => {
		setError(null);
		setStage(0);
		try {
			const cleanNgn = Number(amountNgn.replace(/[^0-9]/g, "")) || 0;
			const createRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "create_session",
					bankName,
					amountUnits: cleanNgn,
					expectedAmountNgn: cleanNgn,
					currency: "NGN",
					expectedCurrency: "NGN",
					expectedAccountNo: accountNo || "",
					cryptoAmountUsdc: usdcAmount,
				}),
			});

			const created = (await createRes.json().catch(() => ({}))) as {
				error?: string;
				sessionId?: string;
				session?: { session_id?: string };
			};

			const activeSessionId = created.session?.session_id ?? created.sessionId;
			if (!createRes.ok || !activeSessionId) {
				throw new Error(
					created.error === "AUTHENTICATION_REQUIRED"
						? "Connect wallet and sign in to run live TLSNotary verification."
						: created.error || "Rust TLSNotary verifier is unreachable.",
				);
			}

			setStage(1);
			await new Promise((r) => setTimeout(r, 350));
			setStage(2);

			const execRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "execute_proof",
					sessionId: activeSessionId,
					bankName,
					amountNgn: cleanNgn,
					recipientAccount: accountNo || "",
					paymentReference: `NIP-${bankName.replace(/\s+/g, "").toUpperCase()}-${tradeId}`,
					paymentStatus: "completed",
					cryptoAmountUsdc: usdcAmount,
				}),
			});

			const verifiedData = (await execRes.json().catch(() => ({}))) as {
				error?: string;
				sessionId?: string;
				proofSummary?: {
					on_chain_proof_id_bytes32?: string;
					checks_performed?: string[];
					binding_attestation?: {
						notary_signature_hex?: string;
					};
				};
				evidence?: {
					transcript_digest_hex?: string;
				};
			};

			if (
				!execRes.ok ||
				!verifiedData.proofSummary?.on_chain_proof_id_bytes32
			) {
				throw new Error(
					verifiedData.error || "Proof verification failed on Rust server.",
				);
			}

			setStage(3);
			await new Promise((r) => setTimeout(r, 300));
			setStage(4);

			const meta: VerifiedProofMeta = {
				proofId: verifiedData.proofSummary.on_chain_proof_id_bytes32,
				sessionId: verifiedData.sessionId || activeSessionId,
				bankName,
				transcriptDigest: verifiedData.evidence?.transcript_digest_hex,
				notarySignature:
					verifiedData.proofSummary.binding_attestation?.notary_signature_hex,
				checksCount: verifiedData.proofSummary.checks_performed?.length ?? 7,
			};
			setProofMeta(meta);
			onComplete(meta);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "TLSNotary verification failed.",
			);
		}
	}, [accountNo, amountNgn, bankName, onComplete, tradeId, usdcAmount]);

	useEffect(() => {
		void runRealTlsnVerification();
	}, [runRealTlsnVerification]);

	return (
		<div className="bg-surface rounded-xl p-4 border border-line font-mono text-xs">
			<div className="text-ink mb-2.5 font-semibold flex items-center justify-between gap-2">
				<span>TLSNotary Verifier (Rust :7047)</span>
				<span className="text-[11px] text-accent bg-subtle px-2 py-0.5 rounded-md border border-line">
					tlsn-core
				</span>
			</div>
			<div className="space-y-1.5">
				{stages.map((s, i) => {
					if (i > stage) return null;
					const isActive = i === stage && stage < stages.length - 1 && !error;
					const isVerified =
						i === stages.length - 1 && stage === stages.length - 1;
					return (
						<div
							key={s}
							className={cn(
								"flex items-start gap-2 text-xs leading-relaxed",
								isActive
									? "text-amber-700"
									: isVerified
										? "text-accent font-medium"
										: "text-ink-2",
							)}
						>
							<span className="shrink-0">
								{i < stage || isVerified ? <Check size={13} strokeWidth={2.25} /> : <ChevronRight size={13} />}
							</span>
							<span className="break-words">{s}</span>
						</div>
					);
				})}
			</div>

			{error && (
				<div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs space-y-2 font-sans">
					<div>{error}</div>
					<button
						type="button"
						onClick={() => void runRealTlsnVerification()}
						className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium"
					>
						Retry Verification
					</button>
				</div>
			)}

			{proofMeta && (
				<div className="mt-3 p-2.5 rounded-lg bg-subtle border border-accent/30 text-ink space-y-1 text-xs">
					<div className="flex items-center justify-between gap-2">
						<span className="text-ink-3">Proof ID</span>
						<span className="font-semibold text-accent">
							{proofMeta.proofId.slice(0, 10)}...{proofMeta.proofId.slice(-6)}
						</span>
					</div>
					{proofMeta.checksCount && (
						<div className="text-[11px] text-ink-2">
							{proofMeta.checksCount} cryptographic checks passed · Chain #{arcChain.id}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

interface TradingWidgetProps {
	embedded?: boolean;
	selectedOffer?: PeerTradeOffer | null;
	onSelectOffer?: (offer: PeerTradeOffer) => void;
	onTradeUpdated?: () => void;
}

export default function TradingWidget({
	embedded = false,
	selectedOffer = null,
	onSelectOffer,
	onTradeUpdated,
}: TradingWidgetProps) {
	const router = useRouter();
	const { address, isConnected } = useAccount();
	const { connectAsync } = useConnect();
	const { signMessageAsync } = useSignMessage();
	const escrow = useEscrow();
	const { rate: monierateRate } = useMonierateRate();

	// View mode: "market" (browse peer activities) or "terminal" (order execution)
	const [widgetTab, setWidgetTab] = useState<"market" | "terminal">("terminal");
	const [marketSideFilter, setMarketSideFilter] = useState<"all" | "sell" | "buy">("all");
	const [marketSearch, setMarketSearch] = useState("");
	const [marketBankFilter, setMarketBankFilter] = useState("all");

	const [signingIn, setSigningIn] = useState(false);
	const [step, setStep] = useState<TradeStep>(0);
	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [activeOffer, setActiveOffer] = useState<PeerTradeOffer | null>(
		selectedOffer,
	);
	const [lifecycleTrade, setLifecycleTrade] =
		useState<LifecycleTradeData | null>(null);
	const [loadingMarket, setLoadingMarket] = useState(true);

	const [verifyMode, setVerifyMode] = useState<VerifyMode>("bank");
	const [selectedBank, setSelectedBank] = useState("GTBank");
	const [redirectingBank, setRedirectingBank] = useState(false);
	const [zkDone, setZkDone] = useState(false);
	const [bankLinked, setBankLinked] = useState(false);
	const [verifiedProof, setVerifiedProof] = useState<VerifiedProofMeta | null>(
		null,
	);

	const [ngnInput, setNgnInput] = useState("");
	const [creatingOrder, setCreatingOrder] = useState(false);
	const [queuedOrderInfo, setQueuedOrderInfo] = useState<{
		queueRef: string;
		queuePosition: number;
		estimatedWaitSeconds: number;
		requestedUsdc: string;
	} | null>(null);
	const [actionBusy, setActionBusy] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [remainingSeconds, setRemainingSeconds] = useState<number>(1200);

	// Track real on-chain wallet USDC balance
	const { data: nativeBalance, refetch: refetchNative } = useBalance({
		address,
		chainId: arcChain.id,
		query: { refetchInterval: 4000 },
	});
	const { data: erc20BalanceRaw, refetch: refetchErc20 } = useReadContract(
		address
			? {
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "balanceOf",
					args: [address],
					query: { refetchInterval: 4000 },
				}
			: undefined,
	);

	const walletUsdc = useMemo(() => {
		if (typeof erc20BalanceRaw === "bigint" && erc20BalanceRaw > 0n) {
			return parseFloat(formatUsdc(erc20BalanceRaw));
		}
		if (nativeBalance && typeof nativeBalance.value === "bigint") {
			const parsed = parseFloat(
				formatUnits(nativeBalance.value, nativeBalance.decimals),
			);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}, [erc20BalanceRaw, nativeBalance]);

	const fetchTradeLifecycle = useCallback(async (tid: string) => {
		if (!tid) return;
		try {
			const res = await fetch(
				`/api/trades/${encodeURIComponent(tid)}/lifecycle`,
				{
					cache: "no-store",
				},
			);
			if (!res.ok) return;
			const data = (await res.json()) as { trade?: LifecycleTradeData };
			if (data.trade) {
				setLifecycleTrade(data.trade);
				if (
					data.trade.lifecycleState === "PAYMENT_CONFIRMED" ||
					data.trade.lifecycleState === "SELLER_PAYOUT_PENDING" ||
					data.trade.lifecycleState === "SELLER_PAYOUT_CONFIRMED" ||
					data.trade.lifecycleState === "RELEASE_PENDING" ||
					data.trade.lifecycleState === "COMPLETED"
				) {
					setBankLinked(true);
				}
			}
		} catch {
			// Ignore transient poll error
		}
	}, []);

	// Load live market offers
	const loadLiveMarket = useCallback(async () => {
		setLoadingMarket(true);
		try {
			const res = await fetch("/api/user/dashboard", {
				cache: "no-store",
				headers: address ? { "x-wallet-address": address } : {},
			});
			if (!res.ok) return;
			const data = (await res.json()) as {
				peerOffers?: PeerTradeOffer[];
				transactions?: UserTransaction[];
			};
			const offers = data.peerOffers ?? [];
			setPeerOffers(offers);

			if (activeOffer) {
				const currentInOffers = offers.find(
					(o) => o.tradeId === activeOffer.tradeId,
				);
				if (currentInOffers) {
					setActiveOffer(currentInOffers);
				}
				void fetchTradeLifecycle(
					lifecycleTrade?.tradeId || activeOffer.tradeId,
				);
			}
		} catch {
			// Ignore initial fetch failure
		} finally {
			setLoadingMarket(false);
		}
	}, [activeOffer, address, fetchTradeLifecycle, lifecycleTrade?.tradeId]);

	useEffect(() => {
		void loadLiveMarket();
	}, [loadLiveMarket]);

	// Sync external selectedOffer prop
	useEffect(() => {
		if (selectedOffer) {
			setActiveOffer(selectedOffer);
			setSelectedBank(selectedOffer.bankName);
			setNgnInput(selectedOffer.ngnAmount.replace(/[^0-9,]/g, ""));
			setFeedback(null);
			setWidgetTab("terminal");
			void fetchTradeLifecycle(selectedOffer.tradeId);
		}
	}, [selectedOffer, fetchTradeLifecycle]);

	// Select offer helper from market activities
	const handlePickOffer = (offer: PeerTradeOffer) => {
		setActiveOffer(offer);
		setSelectedBank(offer.bankName);
		setNgnInput(offer.ngnAmount.replace(/[^0-9,]/g, ""));
		setFeedback(null);
		setWidgetTab("terminal");
		setStep(0);
		onSelectOffer?.(offer);
		void fetchTradeLifecycle(offer.tradeId);
	};

	// Sign-in handler
	const handleConnectAndSignIn = async () => {
		setSigningIn(true);
		setFeedback(null);
		try {
			let targetAddress = address;
			if (!isConnected || !targetAddress) {
				const res = await connectAsync({ connector: injected() });
				targetAddress = res.accounts[0];
			}
			if (targetAddress) {
				await supabaseWalletSignin({
					address: targetAddress,
					wagmiSignAsync: signMessageAsync,
				});
				await loadLiveMarket();
				setFeedback({
					type: "success",
					text: "Wallet signed in successfully. You can now trade on the market.",
				});
			}
		} catch (err) {
			setFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Failed to sign in wallet.",
			});
		} finally {
			setSigningIn(false);
		}
	};

	const activeTradeId = lifecycleTrade?.tradeId ?? activeOffer?.tradeId ?? "";
	const activeRate = lifecycleTrade?.rateNgn ?? activeOffer?.rateNgn ?? (monierateRate || RATE);
	const maxOfferUsdc =
		parseFloat(
			(activeOffer?.availableUsdc ?? lifecycleTrade?.usdcAmount ?? "0").replace(
				/,/g,
				"",
			),
		) || 0;
	const rawNgn = parseFloat(ngnInput.replace(/[^0-9.]/g, "")) || 0;
	const computedUsdc =
		activeRate > 0 ? Math.min(maxOfferUsdc, rawNgn / activeRate) : 0;
	const usdcAmount = computedUsdc > 0 ? computedUsdc.toFixed(2) : "0.00";
	// Matches the escrow contract's feeBps (100 = 1%), deducted from the buyer's USDC on release.
	const platformFee = (
		(parseFloat(usdcAmount.replace(/,/g, "") || "0") * DEFAULT_FEE_BPS) /
		10_000
	).toFixed(2);

	// Restore verified state when returning from /bank-checkout redirect
	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		const urlTradeId = params.get("tradeId");
		if (urlTradeId) {
			void fetchTradeLifecycle(urlTradeId);
		}
		if (params.get("verified") === "1") {
			const pId = params.get("proofId") || "";
			const sId = params.get("sessionId") || "";
			const bName = params.get("bank") || "GTBank";
			const amt = params.get("amountNgn");

			if (amt && !Number.isNaN(Number(amt))) {
				setNgnInput(Number(amt).toLocaleString("en-NG"));
			}
			setSelectedBank(bName);
			setVerifyMode("bank");
			setBankLinked(true);
			setZkDone(true);
			setVerifiedProof({
				proofId: pId,
				sessionId: sId,
				bankName: bName,
			});
			setStep(2);
			setWidgetTab("terminal");
		}
	}, [fetchTradeLifecycle]);

	// Live 20-minute payment deadline countdown
	useEffect(() => {
		const deadlineStr = lifecycleTrade?.paymentDeadlineAt;
		if (!deadlineStr) {
			setRemainingSeconds(1200);
			return;
		}
		const tick = () => {
			const diffSec = Math.max(
				0,
				Math.floor((new Date(deadlineStr).getTime() - Date.now()) / 1000),
			);
			setRemainingSeconds(diffSec);
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [lifecycleTrade?.paymentDeadlineAt]);

	const steps = [
		"1. Order Terms",
		"2. Payment",
		"3. Settlement",
		"4. Audit",
	] as const;

	const canProceedStep1 =
		zkDone ||
		bankLinked ||
		lifecycleTrade?.lifecycleState === "PAYMENT_CONFIRMED" ||
		lifecycleTrade?.lifecycleState === "SELLER_PAYOUT_CONFIRMED" ||
		lifecycleTrade?.lifecycleState === "COMPLETED";

	const handleZkComplete = useCallback(
		(meta: VerifiedProofMeta) => {
			setVerifiedProof(meta);
			setZkDone(true);
			void fetchTradeLifecycle(activeTradeId);
			onTradeUpdated?.();
		},
		[activeTradeId, fetchTradeLifecycle, onTradeUpdated],
	);

	const handleCreateEscrowOrder = async () => {
		setFeedback(null);
		if (!isConnected || !address) {
			setFeedback({
				type: "error",
				text: "Wallet sign-in is required before placing an order.",
			});
			return;
		}

		if (
			address &&
			activeOffer &&
			activeOffer.peerAddress.toLowerCase() === address.toLowerCase()
		) {
			setFeedback({
				type: "error",
				text: "You cannot buy or take an offer that you published yourself.",
			});
			return;
		}

		if (computedUsdc <= 0 || rawNgn < 1) {
			setFeedback({
				type: "error",
				text: "Enter a positive amount (minimum ₦1.00 for checkout).",
			});
			return;
		}

		setCreatingOrder(true);
		try {
			let txHash: `0x${string}` | undefined;
			// Full take of an on-chain listing → claim it on Arc (switches network
			// if needed). Partial fills are reserved off-chain and settled
			// atomically by the oracle once payment is proven.
			const requestedUnits = Math.round(parseFloat(usdcAmount) * 1_000_000);
			const isFullTake =
				!!activeOffer?.availableUsdcUnits &&
				requestedUnits >= activeOffer.availableUsdcUnits;
			if (isFullTake && !activeOffer?.sellerBusy && isOnChainTradeId(activeTradeId)) {
				txHash = await escrow.acceptListing(
					BigInt(activeTradeId),
					BigInt(activeOffer!.availableUsdcUnits!),
				);
			}

			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "take_offer",
					tradeId: activeTradeId,
					requestedUsdcAmount: usdcAmount,
					txHash,
				}),
			});

			const data = (await res.json()) as {
				error?: string;
				executionMode?: "ACTIVE_SLOT" | "QUEUED";
				activeTradeId?: string | null;
				allocatedTradeId?: string;
				queueEntry?: {
					queueRef: string;
					queuePosition: number;
					estimatedWaitSeconds: number;
					requestedUsdc: string;
				} | null;
				queueRef?: string;
				queuePosition?: number;
				estimatedWaitSeconds?: number;
			};

			if (!res.ok) {
				throw new Error(data.error || "Could not initialize order.");
			}

			if (data.executionMode === "QUEUED") {
				const qRef =
					data.queueEntry?.queueRef || data.queueRef || `Q-${activeTradeId}`;
				const qPos = data.queueEntry?.queuePosition ?? data.queuePosition ?? 1;
				const qWait =
					data.queueEntry?.estimatedWaitSeconds ??
					data.estimatedWaitSeconds ??
					420;
				setQueuedOrderInfo({
					queueRef: qRef,
					queuePosition: qPos,
					estimatedWaitSeconds: qWait,
					requestedUsdc: data.queueEntry?.requestedUsdc || usdcAmount,
				});
				onTradeUpdated?.();
				setFeedback({
					type: "success",
					text: `Seller slot is busy. Reserved ${usdcAmount} USDC at Queue #${qPos}.`,
				});
				return;
			}

			const targetTradeId =
				data.activeTradeId || data.allocatedTradeId || activeTradeId;
			setQueuedOrderInfo(null);
			onTradeUpdated?.();

			const qs = new URLSearchParams({
				tradeId: targetTradeId,
				bank: selectedBank,
				amountNgn: String(Math.round(rawNgn)),
				amountUsdc: usdcAmount,
				accountNo: lifecycleTrade?.sellerAccountNumber || "",
				returnTo: "/trade",
			});
			router.push(`/bank-checkout?${qs.toString()}`);
		} catch (err) {
			setFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					"Could not initialize order. Please try again.",
				),
			});
		} finally {
			setCreatingOrder(false);
		}
	};

	const handleCancelQueueInWidget = async (queueRef: string) => {
		setActionBusy("cancel_queue");
		setFeedback(null);
		try {
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "cancel_queue",
					queueRef,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				throw new Error(data.error || "Failed to cancel queued request.");
			}
			setQueuedOrderInfo(null);
			void loadLiveMarket();
			onTradeUpdated?.();
			setFeedback({
				type: "success",
				text: `Cancelled queue reservation ${queueRef}.`,
			});
		} catch (err) {
			setFeedback({
				type: "error",
				text:
					err instanceof Error ? err.message : "Could not cancel queue entry.",
			});
		} finally {
			setActionBusy(null);
		}
	};

	const handleActivateQueueInWidget = async (queueRef: string) => {
		setActionBusy("activate_queue");
		setFeedback(null);
		try {
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "activate_queue",
					queueRef,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				activeTradeId?: string;
				allocatedTradeId?: string;
			};
			if (!res.ok) {
				throw new Error(data.error || "Seller slot is still busy.");
			}
			const tid = data.activeTradeId || data.allocatedTradeId || activeTradeId;
			setQueuedOrderInfo(null);
			await fetchTradeLifecycle(tid);
			onTradeUpdated?.();
			setFeedback({
				type: "success",
				text: `Activated Trade #${tid}. Complete payment within 20 minutes.`,
			});
			setStep(1);
		} catch (err) {
			setFeedback({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Could not activate queue entry.",
			});
		} finally {
			setActionBusy(null);
		}
	};

	const handleFlutterwaveCheckout = async () => {
		setRedirectingBank(true);
		setFeedback(null);
		const cleanNgn = String(Math.round(rawNgn));

		try {
			const res = await fetch("/api/payments/flutterwave/checkout", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					tradeId: activeTradeId,
				}),
			});

			if (res.ok) {
				const data = (await res.json()) as { checkoutUrl?: string };
				// Only leave the app for a real hosted payment page.
				if (data.checkoutUrl?.startsWith("https://") && !data.checkoutUrl.includes(window.location.host)) {
					window.location.href = data.checkoutUrl;
					return;
				}
			}
		} catch {
			// Fall through to the payment page, which can retry and shows errors.
		}

		const qs = new URLSearchParams({
			tradeId: activeTradeId,
			bank: selectedBank,
			amountNgn: cleanNgn,
			amountUsdc: usdcAmount,
			accountNo: lifecycleTrade?.sellerAccountNumber || "",
			returnTo: "/trade",
		});
		router.push(`/bank-checkout?${qs.toString()}`);
	};

	const handleCancelTradeInWidget = async () => {
		if (!activeTradeId) return;
		setActionBusy("cancel_trade");
		setFeedback(null);
		try {
			const res = await fetch(
				`/api/trades/${encodeURIComponent(activeTradeId)}/lifecycle`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(address ? { "x-wallet-address": address } : {}),
					},
					body: JSON.stringify({
						operation: "cancel",
						reason: "Cancelled by trader.",
					}),
				},
			);
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				throw new Error(data.error || "Failed to cancel order.");
			}
			setFeedback({
				type: "success",
				text: `Trade #${activeTradeId} cancelled successfully.`,
			});
			setStep(0);
			setActiveOffer(null);
			setLifecycleTrade(null);
			onTradeUpdated?.();
			void loadLiveMarket();
		} catch (err) {
			setFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Could not cancel order.",
			});
		} finally {
			setActionBusy(null);
		}
	};

	const handleLifecycleAction = async (
		action: string,
		extra: Record<string, unknown> = {},
	) => {
		setActionBusy(action);
		setFeedback(null);
		try {
			let operation = action;
			let txHash: `0x${string}` | undefined =
				(extra.txHash as `0x${string}`) || undefined;

			if (action === "confirm_payout") {
				operation = "payout_confirm";
			} else if (action === "release_escrow") {
				operation = "escrow_confirm_on_chain";
				// Seller signs directly when the on-chain trade allows it;
				// otherwise the server oracle settles on Arc.
				txHash = txHash ?? (await escrow.releaseIfSellerCan(activeTradeId)) ?? undefined;
			}

			const res = await fetch(
				`/api/trades/${encodeURIComponent(activeTradeId)}/lifecycle`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(address ? { "x-wallet-address": address } : {}),
					},
					body: JSON.stringify({ operation, txHash, ...extra }),
				},
			);
			const data = (await res.json()) as {
				error?: string;
				trade?: LifecycleTradeData;
			};
			if (!res.ok) {
				throw new Error(data.error || `Failed to execute ${action}`);
			}
			if (data.trade) {
				setLifecycleTrade(data.trade);
			}
			await refetchNative?.();
			await refetchErc20?.();
			onTradeUpdated?.();
			window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
			setFeedback({
				type: "success",
				text: `Updated Trade #${activeTradeId} to ${data.trade?.lifecycleState ?? action}.`,
			});
		} catch (err) {
			setFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Lifecycle update failed.",
			});
		} finally {
			setActionBusy(null);
		}
	};

	const formatDeadline = (sec: number) => {
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	};

	// Filter market activities
	const filteredMarketOffers = useMemo(() => {
		return peerOffers.filter((o) => {
			if (marketSideFilter === "sell" && o.side !== "sell") return false;
			if (marketSideFilter === "buy" && o.side !== "buy") return false;

			if (marketBankFilter !== "all") {
				const bf = marketBankFilter.toLowerCase();
				const ob = o.bankName.toLowerCase();
				if (ob !== bf && !ob.includes(bf) && !bf.includes(ob)) return false;
			}

			if (marketSearch.trim()) {
				const q = marketSearch.toLowerCase();
				return (
					o.peerHandle.toLowerCase().includes(q) ||
					o.bankName.toLowerCase().includes(q) ||
					o.tradeId.toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [peerOffers, marketSideFilter, marketBankFilter, marketSearch]);

	const sellerCount = useMemo(
		() => peerOffers.filter((o) => o.side === "sell").length,
		[peerOffers],
	);
	const buyerCount = useMemo(
		() => peerOffers.filter((o) => o.side === "buy").length,
		[peerOffers],
	);

	return (
		<div
			className={cn(
				"flex flex-col w-full rounded-xl border border-line bg-surface p-4 sm:p-7 shadow-card space-y-5",
				embedded ? "" : "",
			)}
		>
			{/* Top Bar: Clean Terminal Header with Tab Navigation */}
			<div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-subtle">
				<div className="flex items-center gap-2">
					<div>
						<div className="flex items-center gap-2">
							<span className="text-base font-semibold text-ink">
								{activeTradeId ? `Order #${activeTradeId}` : "Order"}
							</span>
							{lifecycleTrade?.lifecycleState && (
								<span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
									{lifecycleTrade.lifecycleState.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
								</span>
							)}
						</div>
						<div className="text-xs text-ink-3">Settles on {arcChain.name}</div>
					</div>
				</div>

				{/* Primary Tabs */}
				<div className="flex items-center gap-1.5 p-1 rounded-full bg-subtle border border-line">
					<button
						type="button"
						onClick={() => setWidgetTab("market")}
						className={cn(
							"px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
							widgetTab === "market"
								? "bg-raised text-white shadow-card"
								: "text-ink-2 hover:text-ink",
						)}
					>
						Market ({peerOffers.length})
					</button>

					<button
						type="button"
						onClick={() => setWidgetTab("terminal")}
						className={cn(
							"px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1",
							widgetTab === "terminal"
								? "bg-raised text-white shadow-card"
								: "text-ink-2 hover:text-ink",
						)}
					>
						<span>Order</span>
						{activeOffer && (
							<span className="w-2 h-2 rounded-full bg-accent" />
						)}
					</button>
				</div>

				<div className="flex items-center gap-2 ml-auto">
					{isConnected && (
						<div className="hidden sm:block text-right">
							<div className="text-[11px] text-ink-3">Wallet Balance</div>
							<div className="text-xs font-mono font-semibold text-ink">
								{walletUsdc.toFixed(2)} USDC
							</div>
						</div>
					)}
					<button
						type="button"
						onClick={() => void loadLiveMarket()}
						disabled={loadingMarket}
						className="w-8 h-8 rounded-full border border-line text-ink-2 hover:bg-subtle transition-colors flex items-center justify-center shrink-0"
						title="Refresh market activities"
					>
						<RefreshCw
							size={13}
							className={loadingMarket ? "animate-spin text-accent" : ""}
						/>
					</button>
				</div>
			</div>

			<TxStatusBanner
				txState={escrow.txState}
				txHash={escrow.txHash}
				arcScanUrl={escrow.arcScanUrl}
				errorMsg={escrow.errorMsg}
			/>

			{/* Toast Notification Alert */}
			<ToastAlert
				type={feedback?.type ?? "info"}
				message={feedback?.text}
				onClose={() => setFeedback(null)}
			/>

			{/* ── WALLET AUTHENTICATION GUARD ── */}
			{!isConnected && (
				<div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-subtle px-4 py-3.5">
					<div>
						<h3 className="text-sm font-medium text-ink">Connect a wallet to trade</h3>
						<p className="mt-0.5 text-xs text-ink-3">
							You&apos;ll sign a message to prove ownership. No transaction, no gas.
						</p>
					</div>
					<button
						type="button"
						onClick={() => void handleConnectAndSignIn()}
						disabled={signingIn}
						className="btn-primary h-9 shrink-0 px-3.5"
					>
						<Wallet size={15} strokeWidth={1.75} />
						{signingIn ? "Check wallet…" : "Connect"}
					</button>
				</div>
			)}

			{/* ── TAB: MARKET ACTIVITY (BUYERS & SELLERS) ── */}
			{widgetTab === "market" && (
				<div className="space-y-4">
					{/* Sub-Filters: All / Sellers (Buy USDC) / Buyers (Sell USDC) */}
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-1.5">
							<button
								type="button"
								onClick={() => setMarketSideFilter("all")}
								className={cn(
									"px-3 py-1 rounded-md text-xs font-semibold transition-colors",
									marketSideFilter === "all"
										? "bg-raised text-white"
										: "bg-surface border border-line text-ink-2 hover:bg-subtle",
								)}
							>
								All ({peerOffers.length})
							</button>
							<button
								type="button"
								onClick={() => setMarketSideFilter("sell")}
								className={cn(
									"px-3 py-1 rounded-md text-xs font-semibold transition-colors",
									marketSideFilter === "sell"
										? "bg-accent text-white"
										: "bg-surface border border-line text-ink-2 hover:bg-subtle",
								)}
							>
								Sellers ({sellerCount})
							</button>
							<button
								type="button"
								onClick={() => setMarketSideFilter("buy")}
								className={cn(
									"px-3 py-1 rounded-md text-xs font-semibold transition-colors",
									marketSideFilter === "buy"
										? "bg-amber-600 text-white"
										: "bg-surface border border-line text-ink-2 hover:bg-subtle",
								)}
							>
								Buyers ({buyerCount})
							</button>
						</div>

						{/* Search Bar */}
						<div className="relative w-full sm:w-60">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
							/>
							<input
								type="text"
								value={marketSearch}
								onChange={(e) => setMarketSearch(e.target.value)}
								placeholder="Search peer or bank..."
								className="w-full pl-8 pr-3 py-1.5 rounded-full border border-line bg-surface text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
							/>
						</div>
					</div>

					{/* Market Activity Cards Grid */}
					{filteredMarketOffers.length === 0 ? (
						<div className="py-12 px-4 text-center rounded-xl bg-surface border border-line space-y-3">
							<div className="w-10 h-10 mx-auto rounded-full bg-subtle border border-line flex items-center justify-center text-accent">
								<Users size={18} />
							</div>
							<p className="text-xs text-ink-3">
								No active market offers matching your search criteria.
							</p>
							<Link
								href="/dashboard"
								className="inline-block rounded-md px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-card transition-colors"
							>
								Post Offer in Dashboard
							</Link>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
							{filteredMarketOffers.map((offer) => {
								const isUserOffer =
									address &&
									offer.peerAddress.toLowerCase() === address.toLowerCase();
								const isSelected = activeOffer?.tradeId === offer.tradeId;

								return (
									<div
										key={offer.tradeId}
										className={cn(
											"p-4 rounded-xl border transition-colors space-y-3",
											isSelected
												? "border-accent bg-subtle shadow-card"
												: "border-line bg-surface hover:border-line",
										)}
									>
										{/* Card Header: Side & Trader info */}
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span
													className={cn(
														"px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase",
														offer.side === "sell"
															? "bg-accent-soft text-accent border border-line"
															: "bg-amber-50 text-amber-700 border border-amber-200",
													)}
												>
													{offer.side === "sell" ? "Sell USDC" : "Buy USDC"}
												</span>
												<span className="font-semibold text-xs text-ink">
													{offer.peerHandle}
												</span>
											</div>
											<span className="text-[11px] font-mono text-ink-3">
												#{offer.tradeId}
											</span>
										</div>

										{/* Pricing & Liquidity Metrics */}
										<div className="grid grid-cols-2 gap-2 text-xs">
											<div>
												<div className="text-[11px] text-ink-3">Available</div>
												<div className="font-mono font-semibold text-ink text-sm">
													{offer.availableUsdc} USDC
												</div>
											</div>
											<div>
												<div className="text-[11px] text-ink-3">Rate</div>
												<div className="font-mono font-semibold text-accent text-sm">
													₦{offer.rateNgn.toLocaleString("en-NG")}
												</div>
											</div>
										</div>

										{/* Rail & Action Row */}
										<div className="flex items-center justify-between pt-1 border-t border-subtle">
											<div className="text-xs text-ink-2 font-medium truncate max-w-[140px]">
												{offer.bankName}
											</div>

											{isUserOffer ? (
												<span className="px-3 py-1 rounded-md text-[11px] font-semibold bg-subtle text-ink-3">
													Your Offer
												</span>
											) : (
												<button
													type="button"
													onClick={() => {
														if (!isConnected) {
															void handleConnectAndSignIn();
														} else {
															handlePickOffer(offer);
														}
													}}
													className={cn(
														"px-4 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-card flex items-center gap-1",
														offer.side === "sell"
															? "bg-accent hover:bg-accent-hover text-white"
															: "bg-amber-600 hover:bg-amber-500 text-white",
													)}
												>
													<span>
														{!isConnected
															? "Sign In to Trade"
															: offer.side === "sell"
																? "Buy USDC"
																: "Sell USDC"}
													</span>
													<ArrowRight size={12} />
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* ── TAB: ORDER EXECUTION TERMINAL ── */}
			{widgetTab === "terminal" && (
				<>
					{!activeOffer && !lifecycleTrade ? (
						<div className="py-12 px-4 text-center rounded-xl bg-surface border border-line space-y-3">
							<div className="w-12 h-12 mx-auto rounded-full bg-subtle border border-line flex items-center justify-center text-accent">
								<Lock size={20} />
							</div>
							<div className="space-y-1">
								<h3 className="text-sm font-semibold text-ink">
									No offer selected
								</h3>
								<p className="text-xs text-ink-3 max-w-sm mx-auto">
									Pick an offer from the market to start an order.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setWidgetTab("market")}
								className="rounded-md px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-card transition-colors inline-flex items-center gap-1.5"
							>
								<span>Browse offers</span>
								<ArrowRight size={13} />
							</button>
						</div>
					) : (
						<>
							{/* Stepper */}
							<StepBar current={step} steps={[...steps]} />

							{/* Active Offer Capsule */}
							{activeOffer && (
								<div className="p-3.5 rounded-xl bg-subtle border border-line flex flex-wrap items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-2">
										<span
											className={cn(
												"px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase",
												activeOffer.side === "sell"
													? "bg-accent-soft text-accent border border-line"
													: "bg-amber-50 text-amber-700 border border-amber-200",
											)}
										>
											{activeOffer.side === "sell" ? "BUY USDC" : "SELL USDC"}
										</span>
										<span className="font-semibold text-ink">
											#{activeOffer.tradeId} · {activeOffer.peerHandle}
										</span>
										<span className="text-ink-3">({activeOffer.bankName})</span>
									</div>
									<button
										type="button"
										onClick={() => setWidgetTab("market")}
										className="text-xs font-semibold text-accent hover:underline"
									>
										Switch Offer
									</button>
								</div>
							)}

							{/* ── STEP 0: Order Terms ── */}
							{step === 0 && (
								<div className="space-y-4">
									{/* Amount Input Cards */}
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
										<div className="p-4 rounded-xl border border-line bg-surface shadow-card space-y-2">
											<div className="flex items-center justify-between text-xs text-ink-3">
												<span>You Pay (Fiat)</span>
												<div className="flex items-center gap-1 font-mono">
													<button
														type="button"
														onClick={() =>
															setNgnInput(
																Math.round(
																	maxOfferUsdc * 0.25 * activeRate,
																).toLocaleString("en-NG"),
															)
														}
														className="px-2 py-0.5 rounded-md border border-line text-[11px] hover:bg-subtle text-ink-2"
													>
														25%
													</button>
													<button
														type="button"
														onClick={() =>
															setNgnInput(
																Math.round(
																	maxOfferUsdc * 0.5 * activeRate,
																).toLocaleString("en-NG"),
															)
														}
														className="px-2 py-0.5 rounded-md border border-line text-[11px] hover:bg-subtle text-ink-2"
													>
														50%
													</button>
													<button
														type="button"
														onClick={() =>
															setNgnInput(
																Math.round(
																	maxOfferUsdc * activeRate,
																).toLocaleString("en-NG"),
															)
														}
														className="px-2.5 py-0.5 rounded-md border border-accent text-[11px] hover:bg-subtle text-accent font-semibold"
													>
														MAX
													</button>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-base font-mono font-semibold text-ink-2">
													₦
												</span>
												<input
													type="text"
													value={ngnInput}
													onChange={(e) => setNgnInput(e.target.value)}
													className="w-full bg-transparent font-mono text-lg font-semibold text-ink focus:outline-none min-w-0"
												/>
											</div>
										</div>

										<div className="p-4 rounded-xl border border-line bg-surface shadow-card flex flex-col justify-between">
											<div className="flex items-center justify-between text-xs text-ink-3">
												<span>You Receive</span>
												<span className="font-mono text-[11px]">
													Max {activeOffer?.availableUsdc ?? maxOfferUsdc.toFixed(2)} USDC
												</span>
											</div>
											<div className="font-mono text-lg font-semibold text-accent truncate mt-2">
												{usdcAmount} USDC
											</div>
										</div>
									</div>

									{/* Concise KPI Grid */}
									<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
										<div className="p-3 rounded-xl border border-line bg-surface">
											<div className="text-[11px] text-ink-3">Rate</div>
											<div className="font-mono font-semibold text-ink mt-0.5 truncate">
												₦{activeRate.toLocaleString("en-NG")}
											</div>
										</div>

										<div className="p-3 rounded-xl border border-line bg-surface">
											<div className="text-[11px] text-ink-3">Bank Rail</div>
											<div className="font-semibold text-ink mt-0.5 truncate">
												{activeOffer?.bankName ?? lifecycleTrade?.bankName ?? selectedBank}
											</div>
										</div>

										<div className="p-3 rounded-xl border border-line bg-surface">
											<div className="text-[11px] text-ink-3">Counterparty</div>
											<div className="font-semibold text-ink mt-0.5 truncate">
												{activeOffer?.peerHandle ?? lifecycleTrade?.sellerHandle ?? "Peer Trader"}
											</div>
										</div>

										<div className="p-3 rounded-xl border border-line bg-surface">
											<div className="text-[11px] text-ink-3">SLA Window</div>
											<div className="font-semibold text-accent mt-0.5">
												20 Minutes
											</div>
										</div>
									</div>

									{/* Queue Notice if applicable */}
									{queuedOrderInfo && (
										<div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 space-y-2 text-xs">
											<div className="flex items-center justify-between">
												<span className="font-semibold text-ink">
													Queue Position #{queuedOrderInfo.queuePosition} ({queuedOrderInfo.queueRef})
												</span>
												<span className="font-mono text-xs text-amber-800 font-semibold">
													Est. wait ~{Math.max(1, Math.ceil(queuedOrderInfo.estimatedWaitSeconds / 60))}m
												</span>
											</div>
											<div className="flex flex-wrap gap-2 pt-1">
												{queuedOrderInfo.queuePosition === 1 && (
													<button
														type="button"
														disabled={actionBusy !== null}
														onClick={() => void handleActivateQueueInWidget(queuedOrderInfo.queueRef)}
														className="rounded-md px-4 py-2 bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-card"
													>
														{actionBusy === "activate_queue" ? "Activating..." : "Activate & Proceed"}
													</button>
												)}
												<button
													type="button"
													disabled={actionBusy !== null}
													onClick={() => void handleCancelQueueInWidget(queuedOrderInfo.queueRef)}
													className="rounded-md px-4 py-2 border border-red-200 bg-surface hover:bg-red-50 text-red-700 font-semibold text-xs"
												>
													{actionBusy === "cancel_queue" ? "Cancelling..." : "Cancel Queue"}
												</button>
											</div>
										</div>
									)}

									{/* Action Button */}
									<button
										type="button"
										onClick={() => {
											if (!isConnected) {
												void handleConnectAndSignIn();
											} else {
												void handleCreateEscrowOrder();
											}
										}}
										disabled={creatingOrder}
										className="w-full py-3.5 px-6 rounded-md bg-accent hover:bg-accent-hover text-white font-semibold text-xs transition-colors shadow-card flex items-center justify-center gap-2 disabled:opacity-60"
									>
										<span>
											{!isConnected
												? "Sign In with Wallet to Proceed"
												: creatingOrder
													? "Reserving Inventory..."
													: `Proceed to Payment (₦${Math.round(rawNgn).toLocaleString("en-NG")})`}
										</span>
										<ArrowRight size={14} />
									</button>
								</div>
							)}

							{/* ── STEP 1: Fiat Payment ── */}
							{step === 1 && (
								<div className="space-y-4">
									{/* Payment Deadline Bar */}
									<div className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between text-xs">
										<div className="flex items-center gap-2 text-ink-2">
											<Clock size={14} className="text-accent" />
											<span>Payment Window</span>
										</div>
										<span className="font-mono font-semibold text-ink">
											{formatDeadline(remainingSeconds)} remaining
										</span>
									</div>

									{/* Payment Method Selector */}
									<div className="grid grid-cols-2 gap-2.5">
										<button
											type="button"
											onClick={() => setVerifyMode("bank")}
											className={cn(
												"p-3 rounded-xl border text-left transition-colors",
												verifyMode === "bank"
													? "border-accent bg-subtle"
													: "border-line bg-surface hover:bg-surface",
											)}
										>
											<div className="flex items-center justify-between">
												<CreditCard
													size={15}
													className={verifyMode === "bank" ? "text-accent" : "text-ink-3"}
												/>
												<span className="text-[11px] font-mono text-accent">
													Direct
												</span>
											</div>
											<div className="text-xs font-semibold text-ink mt-1">
												Bank Checkout
											</div>
										</button>

										<button
											type="button"
											onClick={() => {
												setVerifyMode("zk");
												setZkDone(false);
											}}
											className={cn(
												"p-3 rounded-xl border text-left transition-colors",
												verifyMode === "zk"
													? "border-accent bg-subtle"
													: "border-line bg-surface hover:bg-surface",
											)}
										>
											<div className="flex items-center justify-between">
												<Fingerprint
													size={15}
													className={verifyMode === "zk" ? "text-accent" : "text-ink-3"}
												/>
												<span className="text-[11px] font-mono text-ink-3">
													Zero-Knowledge
												</span>
											</div>
											<div className="text-xs font-semibold text-ink mt-1">
												TLSNotary ZK
											</div>
										</button>
									</div>

									{verifyMode === "bank" && (
										<div className="p-4 rounded-xl border border-line bg-surface space-y-3 text-xs">
											<div className="flex items-center justify-between">
												<span className="text-ink-3">Beneficiary Bank</span>
												<span className="font-semibold text-ink">
													{lifecycleTrade?.bankName ?? selectedBank}
												</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-ink-3">Amount Due</span>
												<span className="font-mono font-semibold text-ink">
													₦{rawNgn.toLocaleString("en-NG")}
												</span>
											</div>

											<div className="flex flex-col sm:flex-row gap-2 pt-2">
												<button
													type="button"
													onClick={() => void handleFlutterwaveCheckout()}
													disabled={redirectingBank}
													className="flex-1 py-2.5 px-4 rounded-md bg-accent hover:bg-accent-hover text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-card disabled:opacity-60"
												>
													<span>
														{redirectingBank ? "Opening..." : "Proceed to Payment"}
													</span>
													<ExternalLink size={13} />
												</button>

												<button
													type="button"
													onClick={() => void handleCancelTradeInWidget()}
													disabled={actionBusy === "cancel_trade"}
													className="py-2.5 px-4 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs disabled:opacity-50"
												>
													Cancel Trade
												</button>
											</div>
										</div>
									)}

									{verifyMode === "zk" && !zkDone && (
										<ZKProofPanel
											tradeId={activeTradeId}
											amountNgn={ngnInput}
											bankName={lifecycleTrade?.bankName ?? selectedBank}
											accountNo={lifecycleTrade?.sellerAccountNumber || ""}
											usdcAmount={usdcAmount}
											onComplete={handleZkComplete}
										/>
									)}

									{canProceedStep1 && (
										<div className="p-3 rounded-xl bg-subtle border border-accent/30 flex items-center gap-2 text-xs">
											<CheckCircle size={15} className="text-accent shrink-0" />
											<span className="font-semibold text-ink">
												Payment Verified
											</span>
										</div>
									)}

									<div className="flex gap-2 pt-1">
										<button
											type="button"
											onClick={() => setStep(0)}
											className="flex-1 py-2.5 rounded-full border border-line text-ink-2 text-xs font-semibold hover:bg-subtle"
										>
											Back
										</button>
										<button
											type="button"
											onClick={() => setStep(2)}
											className="flex-1 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold"
										>
											Proceed to Settlement
										</button>
									</div>
								</div>
							)}

							{/* ── STEP 2: Escrow Settlement ── */}
							{step === 2 && (
								<div className="space-y-4">
									<div className="p-4 rounded-xl border border-line bg-surface space-y-2.5 text-xs">
										<div className="flex items-center justify-between">
											<span className="text-ink-3">Lifecycle State</span>
											<span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-subtle text-accent border border-line">
												{lifecycleTrade?.lifecycleState ?? "AWAITING_PAYMENT"}
											</span>
										</div>

										<div className="flex items-center justify-between">
											<span className="text-ink-3">USDC Amount</span>
											<span className="font-mono font-semibold text-ink">
												{usdcAmount} USDC
											</span>
										</div>

										<div className="flex items-center justify-between">
											<span className="text-ink-3">Payment Status</span>
											<span className="font-mono font-semibold text-ink">
												{lifecycleTrade?.paymentState ?? (canProceedStep1 ? "CONFIRMED" : "PENDING")}
											</span>
										</div>

										<div className="flex items-center justify-between">
											<span className="text-ink-3">Escrow Status</span>
											<span className="font-mono text-accent font-semibold">
												{lifecycleTrade?.escrowState ?? "LOCKED"}
											</span>
										</div>
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										<button
											type="button"
											disabled={actionBusy !== null}
											onClick={() => void handleLifecycleAction("confirm_payout")}
											className="py-2.5 px-4 rounded-md border border-line bg-surface hover:bg-subtle text-ink text-xs font-semibold disabled:opacity-50"
										>
											{actionBusy === "confirm_payout" ? "Confirming..." : "Confirm Payout"}
										</button>

										<button
											type="button"
											disabled={actionBusy !== null}
											onClick={() => void handleLifecycleAction("release_escrow")}
											className="py-2.5 px-4 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold disabled:opacity-50 shadow-card"
										>
											{actionBusy === "release_escrow" ? "Releasing..." : "Release Escrow"}
										</button>
									</div>

									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => setStep(1)}
											className="flex-1 py-2.5 rounded-full border border-line text-ink-2 text-xs font-semibold hover:bg-subtle"
										>
											Back
										</button>
										<button
											type="button"
											onClick={() => setStep(3)}
											className="flex-1 py-2.5 rounded-full border border-accent text-accent hover:bg-subtle text-xs font-semibold"
										>
											Audit Trail
										</button>
									</div>
								</div>
							)}

							{/* ── STEP 3: Audit Trail ── */}
							{step === 3 && (
								<div className="space-y-4">
									<div className="rounded-xl border border-line bg-surface p-4">
										<div className="flex items-center justify-between mb-3">
											<span className="text-xs font-semibold text-ink">
												Trade Audit Trail (#{activeTradeId})
											</span>
											<span className="text-[11px] font-mono text-ink-3">
												{(lifecycleTrade?.auditLog ?? []).length} events
											</span>
										</div>

										{(lifecycleTrade?.auditLog ?? []).length === 0 ? (
											<div className="py-6 text-center text-xs text-ink-3">
												No state transitions recorded yet for Trade #{activeTradeId}.
											</div>
										) : (
											<div className="space-y-2 max-h-52 overflow-y-auto pr-1">
												{(lifecycleTrade?.auditLog ?? []).map((ev) => (
													<div
														key={ev.id}
														className="p-2.5 rounded-lg border border-line bg-surface text-xs flex items-start justify-between gap-2"
													>
														<div className="min-w-0">
															<div className="font-mono font-medium text-ink truncate">
																{ev.eventType}
															</div>
															<div className="text-[11px] text-ink-3 mt-0.5">
																{ev.previousState ? `${ev.previousState} → ` : ""}
																<span className="font-mono text-accent">
																	{ev.newState}
																</span>{" "}
																· {ev.actorRole}
															</div>
														</div>
														<span className="text-[11px] font-mono text-ink-3 shrink-0">
															{new Date(ev.createdAt).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</span>
													</div>
												))}
											</div>
										)}
									</div>

									<div className="flex flex-col sm:flex-row gap-2">
										<button
											type="button"
											onClick={() => setStep(2)}
											className="flex-1 py-2.5 rounded-full border border-line text-ink-2 text-xs font-semibold hover:bg-subtle"
										>
											Back to Settlement
										</button>

										<button
											type="button"
											disabled={actionBusy !== null}
											onClick={() =>
												void handleLifecycleAction("hold_payout", {
													reason: "Dispute opened from trading terminal.",
												})
											}
											className="flex-1 py-2.5 px-4 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center justify-center gap-1.5"
										>
											<AlertTriangle size={13} />
											<span>Place Trade on Hold</span>
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</>
			)}
		</div>
	);
}
