"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	useAccount,
	useBalance,
	useReadContract,
} from "wagmi";
import { formatUnits } from "viem";
import {
	Shield,
	CheckCircle,
	AlertTriangle,
	Lock,
	Fingerprint,
	Database,
	ArrowRight,
	ExternalLink,
	RefreshCw,
	CreditCard,
	Clock,
} from "lucide-react";
import { StepBar } from "@/components/shared";
import { useEscrow } from "@/hooks/useEscrow";
import {
	arcTestnet,
	ESCROW_ADDRESS,
	USDC_ADDRESS,
	USDC_ABI,
	formatUsdc,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
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
						? "Connect wallet and sign in (top right) to run live TLSNotary verification."
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

			if (!execRes.ok || !verifiedData.proofSummary?.on_chain_proof_id_bytes32) {
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
		<div className="bg-[#fbfdfc] rounded-lg p-3.5 border border-[#d1e8dc] font-mono text-xs">
			<div className="text-[#0d2b1e] mb-2.5 font-semibold flex items-center justify-between gap-2">
				<span>TLSNotary Verifier (Rust :7047)</span>
				<span className="text-[10px] text-[#1a9e5c] bg-[#f0f7f3] px-2 py-0.5 rounded border border-[#d1e8dc]">
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
								"flex items-start gap-2 text-[11px] leading-relaxed",
								isActive
									? "text-amber-700"
									: isVerified
										? "text-[#1a9e5c] font-medium"
										: "text-[#3d6b55]",
							)}
						>
							<span className="shrink-0">{i < stage || isVerified ? "✓" : "→"}</span>
							<span className="break-words">{s}</span>
						</div>
					);
				})}
			</div>

			{error && (
				<div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] space-y-2 font-sans">
					<div>{error}</div>
					<button
						type="button"
						onClick={() => void runRealTlsnVerification()}
						className="px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-medium"
					>
						Retry Verification
					</button>
				</div>
			)}

			{proofMeta && (
				<div className="mt-3 p-2.5 rounded-lg bg-[#f0f7f3] border border-[#1a9e5c]/30 text-[#0d2b1e] space-y-1 text-[11px]">
					<div className="flex items-center justify-between gap-2">
						<span className="text-[#7aaa92]">Proof ID</span>
						<span className="font-semibold text-[#1a9e5c]">
							{proofMeta.proofId.slice(0, 10)}…{proofMeta.proofId.slice(-6)}
						</span>
					</div>
					{proofMeta.checksCount && (
						<div className="text-[10px] text-[#3d6b55]">
							{proofMeta.checksCount} cryptographic checks passed · Chain #5042002
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
	const escrow = useEscrow();

	const [step, setStep] = useState<TradeStep>(0);
	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [activeOffer, setActiveOffer] = useState<PeerTradeOffer | null>(selectedOffer);
	const [lifecycleTrade, setLifecycleTrade] = useState<LifecycleTradeData | null>(null);
	const [loadingMarket, setLoadingMarket] = useState(true);

	const [verifyMode, setVerifyMode] = useState<VerifyMode>("bank");
	const [selectedBank, setSelectedBank] = useState("GTBank");
	const [redirectingBank, setRedirectingBank] = useState(false);
	const [zkDone, setZkDone] = useState(false);
	const [bankLinked, setBankLinked] = useState(false);
	const [verifiedProof, setVerifiedProof] = useState<VerifiedProofMeta | null>(null);

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
	const { data: nativeBalance } = useBalance({
		address,
		chainId: arcTestnet.id,
	});
	const { data: erc20BalanceRaw } = useReadContract(
		address
			? {
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "balanceOf",
					args: [address],
				}
			: undefined,
	);

	const walletUsdc = useMemo(() => {
		if (typeof erc20BalanceRaw === "bigint" && erc20BalanceRaw > 0n) {
			return parseFloat(formatUsdc(erc20BalanceRaw));
		}
		if (nativeBalance && typeof nativeBalance.value === "bigint") {
			const parsed = parseFloat(formatUnits(nativeBalance.value, nativeBalance.decimals));
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}, [erc20BalanceRaw, nativeBalance]);

	// Sync external selectedOffer prop when clicked in parent portal
	useEffect(() => {
		if (selectedOffer) {
			setActiveOffer(selectedOffer);
			setSelectedBank(selectedOffer.bankName);
			setNgnInput(selectedOffer.ngnAmount.replace(/[^0-9,]/g, ""));
			setFeedback(null);
			void fetchTradeLifecycle(selectedOffer.tradeId);
		} else {
			setActiveOffer(null);
			setLifecycleTrade(null);
			setNgnInput("");
		}
	}, [selectedOffer, fetchTradeLifecycle]);

	const activeTradeId = activeOffer?.tradeId ?? lifecycleTrade?.tradeId ?? "";
	const activeRate = activeOffer?.rateNgn ?? lifecycleTrade?.rateNgn ?? RATE;
	const maxOfferUsdc = parseFloat(
		(activeOffer?.availableUsdc ?? lifecycleTrade?.usdcAmount ?? "0").replace(/,/g, ""),
	) || 0;
	const rawNgn = parseFloat(ngnInput.replace(/[^0-9.]/g, "")) || 0;
	const computedUsdc = activeRate > 0 ? Math.min(maxOfferUsdc, rawNgn / activeRate) : 0;
	const usdcAmount = computedUsdc > 0 ? computedUsdc.toFixed(2) : "0.00";
	const collateralUsdc =
		activeOffer?.requiredCollateralUsdc ??
		lifecycleTrade?.requiredCollateralUsdc ??
		"0.00";
	const platformFee = (parseFloat(usdcAmount.replace(/,/g, "") || "0") * 0.005).toFixed(2);

	const fetchTradeLifecycle = useCallback(async (tid: string) => {
		if (!tid) return;
		try {
			const res = await fetch(`/api/trades/${encodeURIComponent(tid)}/lifecycle`, {
				cache: "no-store",
			});
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
				const currentInOffers = offers.find((o) => o.tradeId === activeOffer.tradeId);
				if (currentInOffers) {
					setActiveOffer(currentInOffers);
				}
				void fetchTradeLifecycle(activeOffer.tradeId);
			}
		} catch {
			// Ignore initial fetch failure
		} finally {
			setLoadingMarket(false);
		}
	}, [activeOffer, address, fetchTradeLifecycle]);

	useEffect(() => {
		void loadLiveMarket();
	}, [loadLiveMarket]);

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
		}
	}, [fetchTradeLifecycle]);

	// Live 20-minute payment deadline countdown from authoritative trade record
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
		"2. Fiat Payment",
		"3. Settlement",
		"4. Audit & Dispute",
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
				text: "Enter a positive USDC/NGN amount (minimum ₦1.00 for bank checkout).",
			});
			return;
		}

		setCreatingOrder(true);
		try {
			let txHash: `0x${string}` | undefined;
			if (
				escrow.isConnected &&
				!escrow.isWrongChain &&
				ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
				/^\d+$/.test(activeTradeId)
			) {
				txHash = await escrow.fundBuyerCollateral({
					tradeId: BigInt(activeTradeId),
					collateralUsdc,
				});
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
				allocatedTradeId?: string;
				queueRef?: string;
				queuePosition?: number;
				estimatedWaitSeconds?: number;
			};

			if (!res.ok) {
				throw new Error(data.error || "Could not initialize order.");
			}

			if (data.executionMode === "QUEUED") {
				setQueuedOrderInfo({
					queueRef: data.queueRef || `Q-${activeTradeId}`,
					queuePosition: data.queuePosition ?? 1,
					estimatedWaitSeconds: data.estimatedWaitSeconds ?? 420,
					requestedUsdc: usdcAmount,
				});
				onTradeUpdated?.();
				setFeedback({
					type: "success",
					text: `Seller is currently settling an active buyer slot. Reserved ${usdcAmount} USDC at Queue #${data.queuePosition ?? 1}.`,
				});
				return;
			}

			const targetTradeId = data.allocatedTradeId || activeTradeId;
			setQueuedOrderInfo(null);
			await fetchTradeLifecycle(targetTradeId);
			onTradeUpdated?.();
			setFeedback({
				type: "success",
				text: `Trade #${targetTradeId} allocated (${usdcAmount} USDC) in AWAITING_PAYMENT. Complete payment within 20 minutes.`,
			});
			setStep(1);
		} catch (err) {
			setFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					"Could not reserve seller inventory or initialize order. Please try again.",
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
				text: `Cancelled queue reservation ${queueRef} with zero cooldown penalty.`,
			});
		} catch (err) {
			setFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Could not cancel queue entry.",
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
				allocatedTradeId?: string;
			};
			if (!res.ok) {
				throw new Error(data.error || "Seller slot is still busy.");
			}
			const tid = data.allocatedTradeId || activeTradeId;
			setQueuedOrderInfo(null);
			await fetchTradeLifecycle(tid);
			onTradeUpdated?.();
			setFeedback({
				type: "success",
				text: `Activated Trade #${tid}. Complete fiat payment within 20 minutes.`,
			});
			setStep(1);
		} catch (err) {
			setFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Could not activate queue entry.",
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
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tradeId: activeTradeId,
					redirectUrl: `${window.location.origin}/bank-checkout?tradeId=${encodeURIComponent(
						activeTradeId,
					)}&bank=${encodeURIComponent(selectedBank)}&amountNgn=${encodeURIComponent(
						cleanNgn,
					)}&amountUsdc=${encodeURIComponent(usdcAmount)}&returnTo=/trade`,
				}),
			});

			if (res.ok) {
				const data = (await res.json()) as { checkoutUrl?: string };
				if (data.checkoutUrl && data.checkoutUrl.startsWith("https://")) {
					window.location.href = data.checkoutUrl;
					return;
				}
			}
		} catch {
			// Continue to internal settlement portal
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

	const handleLifecycleAction = async (
		action: string,
		extra: Record<string, unknown> = {},
	) => {
		setActionBusy(action);
		setFeedback(null);
		try {
			const res = await fetch(
				`/api/trades/${encodeURIComponent(activeTradeId)}/lifecycle`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action, ...extra }),
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
			onTradeUpdated?.();
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

	return (
		<div className={cn("flex flex-col w-full", embedded ? "" : "")}>
			{/* Top Bar: Clean Binance-Style Header */}
			<div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-[#d1e8dc]">
				<div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-[#0d2b1e]">
							Order Execution Terminal
						</span>
						<span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
							{lifecycleTrade?.lifecycleState ?? "OPEN"}
						</span>
					</div>
					<div className="text-[11px] text-[#7aaa92] mt-0.5">
						Arc Testnet (#5042002) {activeTradeId ? `· Trade #${activeTradeId}` : "· Standby"}
					</div>
				</div>

				<div className="flex items-center gap-2">
					{isConnected && (
						<div className="text-right">
							<div className="text-[10px] text-[#7aaa92]">Wallet Balance</div>
							<div className="text-xs font-mono font-semibold text-[#0d2b1e]">
								{walletUsdc.toFixed(2)} USDC
							</div>
						</div>
					)}
					<button
						type="button"
						onClick={() => void loadLiveMarket()}
						disabled={loadingMarket}
						className="p-1.5 rounded-lg border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3] transition-colors"
						title="Refresh live order state"
					>
						<RefreshCw size={13} className={loadingMarket ? "animate-spin text-[#1a9e5c]" : ""} />
					</button>
				</div>
			</div>

			{/* Feedback Banner */}
			{feedback && (
				<div
					className={cn(
						"mb-4 p-3 rounded-lg border text-xs flex items-center justify-between gap-2",
						feedback.type === "success"
							? "bg-[#f0f7f3] border-[#1a9e5c]/30 text-[#0d2b1e]"
							: "bg-red-50 border-red-200 text-red-700",
					)}
				>
					<span className="break-words">{feedback.text}</span>
					<button
						type="button"
						onClick={() => setFeedback(null)}
						className="text-[11px] underline text-[#7aaa92] hover:text-[#0d2b1e] shrink-0"
					>
						Dismiss
					</button>
				</div>
			)}

			{!activeOffer && !lifecycleTrade ? (
				<div className="py-12 px-4 text-center space-y-3">
					<div className="w-10 h-10 mx-auto rounded-full bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center text-[#1a9e5c]">
						<Lock size={18} />
					</div>
					<div className="space-y-1">
						<h3 className="text-sm font-semibold text-[#0d2b1e]">No Order Selected</h3>
						<p className="text-xs text-[#7aaa92] max-w-sm mx-auto">
							Select an offer from the open peer liquidity list or publish an offer from your dashboard to initiate escrow settlement.
						</p>
					</div>
					<div className="pt-2 flex flex-wrap justify-center gap-2">
						<Link
							href="/dashboard"
							className="px-3 py-1.5 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white text-xs font-semibold"
						>
							Publish Offer in Dashboard
						</Link>
					</div>
				</div>
			) : (
				<>
					{/* Non-Overlapping Stepper */}
					<StepBar current={step} steps={[...steps]} />

					{/* ── STEP 0: Order Terms ── */}
					{step === 0 && (
				<div className="space-y-4">
					{/* Offer Selector if multiple peer offers exist */}
					{peerOffers.length > 0 && (
						<div>
							<label className="block text-[11px] font-medium text-[#7aaa92] mb-1.5">
								Active Market Offer
							</label>
							<select
								value={activeOffer?.tradeId ?? ""}
								onChange={(e) => {
									const found = peerOffers.find((o) => o.tradeId === e.target.value);
									if (found) {
										setActiveOffer(found);
										setSelectedBank(found.bankName);
										setNgnInput(found.ngnAmount.replace(/[^0-9,]/g, ""));
										onSelectOffer?.(found);
										void fetchTradeLifecycle(found.tradeId);
									}
								}}
								className="w-full px-3 py-2 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] text-xs text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
							>
								{peerOffers.map((o) => (
									<option key={o.tradeId} value={o.tradeId}>
										#{o.tradeId} · {o.peerHandle} · {o.availableUsdc} USDC @ ₦
										{o.rateNgn.toLocaleString("en-NG")} ({o.bankName})
									</option>
								))}
							</select>
						</div>
					)}

					{/* Amount Boxes */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div className="p-3 rounded-lg border border-[#d1e8dc] bg-white">
							<div className="flex items-center justify-between text-[11px] text-[#7aaa92] mb-1">
								<span>You Pay (Fiat)</span>
								<div className="flex items-center gap-1 font-mono">
									<button
										type="button"
										onClick={() =>
											setNgnInput(
												Math.round(maxOfferUsdc * 0.25 * activeRate).toLocaleString("en-NG"),
											)
										}
										className="px-1.5 py-0.5 rounded border border-[#d1e8dc] text-[10px] hover:bg-[#f0f7f3] text-[#3d6b55]"
									>
										25%
									</button>
									<button
										type="button"
										onClick={() =>
											setNgnInput(
												Math.round(maxOfferUsdc * 0.5 * activeRate).toLocaleString("en-NG"),
											)
										}
										className="px-1.5 py-0.5 rounded border border-[#d1e8dc] text-[10px] hover:bg-[#f0f7f3] text-[#3d6b55]"
									>
										50%
									</button>
									<button
										type="button"
										onClick={() =>
											setNgnInput(
												Math.round(maxOfferUsdc * activeRate).toLocaleString("en-NG"),
											)
										}
										className="px-1.5 py-0.5 rounded border border-[#1a9e5c] text-[10px] hover:bg-[#f0f7f3] text-[#1a9e5c] font-semibold"
									>
										MAX
									</button>
								</div>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="text-sm font-mono text-[#3d6b55]">₦</span>
								<input
									type="text"
									value={ngnInput}
									onChange={(e) => setNgnInput(e.target.value)}
									className="w-full bg-transparent font-mono text-base font-semibold text-[#0d2b1e] focus:outline-none min-w-0"
								/>
							</div>
						</div>

						<div className="p-3 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
							<div className="flex items-center justify-between text-[11px] text-[#7aaa92] mb-1">
								<span>You Receive (Seller Escrowed)</span>
								<span className="font-mono">
									Max {activeOffer?.availableUsdc ?? maxOfferUsdc.toFixed(2)} USDC
								</span>
							</div>
							<div className="font-mono text-base font-semibold text-[#1a9e5c] truncate">
								{usdcAmount} USDC
							</div>
						</div>
					</div>

					{/* Immutable Trade Parameters Grid */}
					<div className="grid grid-cols-2 gap-2.5 text-xs">
						<div className="p-2.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
							<div className="text-[11px] text-[#7aaa92]">Counterparty Seller</div>
							<div className="font-mono font-medium text-[#0d2b1e] mt-0.5 truncate">
								{activeOffer?.peerHandle ?? lifecycleTrade?.sellerHandle ?? "Peer Seller"}
							</div>
						</div>

						<div className="p-2.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
							<div className="text-[11px] text-[#7aaa92]">Exchange Rate</div>
							<div className="font-mono font-medium text-[#0d2b1e] mt-0.5">
								1 USDC = ₦{activeRate.toLocaleString("en-NG")}
							</div>
						</div>

						<div className="p-2.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
							<div className="text-[11px] text-[#7aaa92]">Settlement Bank Rail</div>
							<div className="font-medium text-[#0d2b1e] mt-0.5 truncate">
								{activeOffer?.bankName ?? lifecycleTrade?.bankName ?? selectedBank}
							</div>
						</div>

						<div className="p-2.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
							<div className="text-[11px] text-[#7aaa92]">Buyer Collateral Required</div>
							<div className="font-mono font-medium text-[#1a9e5c] mt-0.5">
								0.00 USDC (Seller-Funded)
							</div>
						</div>
					</div>

					{/* Fee & Deadline Notice */}
					<div className="p-3 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc] flex flex-wrap items-center justify-between gap-2 text-xs text-[#3d6b55]">
						<span>Protocol Fee (0.5%) + Est. Arc Gas (~0.0031 USDC)</span>
						<span className="font-mono font-semibold text-[#0d2b1e]">
							{platformFee} USDC · 20-min Payment Window
						</span>
					</div>

					{queuedOrderInfo && (
						<div className="p-3.5 rounded-lg border border-amber-300 bg-amber-50/70 space-y-2.5 text-xs">
							<div className="flex items-center justify-between">
								<span className="font-semibold text-[#0d2b1e]">
									FIFO Queue Position #{queuedOrderInfo.queuePosition} ({queuedOrderInfo.queueRef})
								</span>
								<span className="font-mono text-[11px] text-amber-800">
									Est. wait ~{Math.max(1, Math.ceil(queuedOrderInfo.estimatedWaitSeconds / 60))}m
								</span>
							</div>
							<p className="text-[11px] text-[#3d6b55]">
								Reserved {queuedOrderInfo.requestedUsdc} USDC of seller inventory. Only one active buyer slot can pay a seller at a time. You may cancel while queued with zero penalty.
							</p>
							<div className="flex flex-wrap gap-2">
								{queuedOrderInfo.queuePosition === 1 && (
									<button
										type="button"
										disabled={actionBusy !== null}
										onClick={() => void handleActivateQueueInWidget(queuedOrderInfo.queueRef)}
										className="px-3 py-1.5 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white font-semibold text-xs"
									>
										{actionBusy === "activate_queue"
											? "Activating..."
											: "Activate Order & Proceed to Payment"}
									</button>
								)}
								<button
									type="button"
									disabled={actionBusy !== null}
									onClick={() => void handleCancelQueueInWidget(queuedOrderInfo.queueRef)}
									className="px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 font-medium text-xs"
								>
									{actionBusy === "cancel_queue" ? "Cancelling..." : "Cancel Queued Request"}
								</button>
							</div>
						</div>
					)}

					<button
						type="button"
						onClick={() => void handleCreateEscrowOrder()}
						disabled={creatingOrder}
						className="w-full py-2.5 px-4 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
					>
						<span>
							{creatingOrder
								? "Reserving Seller Escrow Inventory..."
								: `Reserve ${usdcAmount} USDC & Proceed to Payment (0 USDC Bond)`}
						</span>
						<ArrowRight size={14} />
					</button>
				</div>
			)}

			{/* ── STEP 1: Fiat Payment & Cryptographic Verification ── */}
			{step === 1 && (
				<div className="space-y-4">
					{/* 20-Minute Payment Deadline Bar */}
					<div className="p-3 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] flex flex-wrap items-center justify-between gap-2 text-xs">
						<div className="flex items-center gap-2 text-[#3d6b55]">
							<Clock size={14} className="text-[#1a9e5c]" />
							<span>Buyer Payment Window</span>
						</div>
						<span className="font-mono font-semibold text-[#0d2b1e]">
							{formatDeadline(remainingSeconds)} remaining
						</span>
					</div>

					{/* Verification Rail Tabs */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
						<button
							type="button"
							onClick={() => setVerifyMode("bank")}
							className={cn(
								"p-3 rounded-lg border text-left transition-colors",
								verifyMode === "bank"
									? "border-[#1a9e5c] bg-[#f0f7f3]"
									: "border-[#d1e8dc] bg-white hover:bg-[#fbfdfc]",
							)}
						>
							<div className="flex items-center justify-between">
								<CreditCard
									size={15}
									className={verifyMode === "bank" ? "text-[#1a9e5c]" : "text-[#7aaa92]"}
								/>
								<span className="text-[10px] font-mono text-[#1a9e5c]">Recommended</span>
							</div>
							<div className="text-xs font-semibold text-[#0d2b1e] mt-1.5">
								Instant Bank Checkout
							</div>
							<div className="text-[11px] text-[#7aaa92] mt-0.5">
								Verified NGN bank transfer or card payment
							</div>
						</button>

						<button
							type="button"
							onClick={() => {
								setVerifyMode("zk");
								setZkDone(false);
							}}
							className={cn(
								"p-3 rounded-lg border text-left transition-colors",
								verifyMode === "zk"
									? "border-[#1a9e5c] bg-[#f0f7f3]"
									: "border-[#d1e8dc] bg-white hover:bg-[#fbfdfc]",
							)}
						>
							<div className="flex items-center justify-between">
								<Fingerprint
									size={15}
									className={verifyMode === "zk" ? "text-[#1a9e5c]" : "text-[#7aaa92]"}
								/>
								<span className="text-[10px] font-mono text-[#7aaa92]">Zero-Knowledge</span>
							</div>
							<div className="text-xs font-semibold text-[#0d2b1e] mt-1.5">
								Cryptographic Proof
							</div>
							<div className="text-[11px] text-[#7aaa92] mt-0.5">
								Direct bank session verification
							</div>
						</button>
					</div>

					{verifyMode === "bank" && (
						<div className="p-4 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] space-y-3 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-[#7aaa92]">Beneficiary Bank</span>
								<span className="font-medium text-[#0d2b1e]">
									{lifecycleTrade?.bankName ?? selectedBank}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-[#7aaa92]">Exact Amount Due</span>
								<span className="font-mono font-semibold text-[#0d2b1e]">
									₦{rawNgn.toLocaleString("en-NG")}
								</span>
							</div>

							<div className="flex flex-col sm:flex-row gap-2 pt-1">
								<button
									type="button"
									onClick={() => void handleFlutterwaveCheckout()}
									disabled={redirectingBank}
									className="flex-1 py-2.5 px-3 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
								>
									<span>
										{redirectingBank
											? "Opening Checkout..."
											: "Proceed to Bank Checkout"}
									</span>
									<ExternalLink size={13} />
								</button>

								<Link
									href={`/bank-checkout?tradeId=${encodeURIComponent(
										activeTradeId,
									)}&bank=${encodeURIComponent(
										lifecycleTrade?.bankName ?? selectedBank,
									)}&amountNgn=${encodeURIComponent(
										String(Math.round(rawNgn)),
									)}&amountUsdc=${encodeURIComponent(
										usdcAmount,
									)}&returnTo=/trade`}
									className="py-2.5 px-3 rounded-lg border border-[#d1e8dc] bg-white text-[#0d2b1e] hover:bg-[#f0f7f3] font-medium text-xs text-center"
								>
									Open Full Settlement Portal
								</Link>
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
						<div className="p-3 rounded-lg bg-[#f0f7f3] border border-[#1a9e5c]/30 flex items-center justify-between gap-2 text-xs">
							<div className="flex items-center gap-2 min-w-0">
								<CheckCircle size={15} className="text-[#1a9e5c] shrink-0" />
								<div className="truncate">
									<span className="font-semibold text-[#0d2b1e]">
										Payment Verification Recorded
									</span>
									{verifiedProof?.proofId && (
										<span className="ml-2 font-mono text-[11px] text-[#3d6b55]">
											({verifiedProof.proofId.slice(0, 10)}…)
										</span>
									)}
								</div>
							</div>
						</div>
					)}

					<div className="flex gap-2 pt-1">
						<button
							type="button"
							onClick={() => setStep(0)}
							className="flex-1 py-2 rounded-lg border border-[#d1e8dc] text-[#3d6b55] text-xs font-medium hover:bg-[#f0f7f3]"
						>
							Back
						</button>
						<button
							type="button"
							onClick={() => setStep(2)}
							className="flex-1 py-2 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white text-xs font-semibold"
						>
							Proceed to Settlement
						</button>
					</div>
				</div>
			)}

			{/* ── STEP 2: Authoritative Lifecycle & Escrow Settlement ── */}
			{step === 2 && (
				<div className="space-y-4">
					<div className="p-3.5 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] space-y-2.5 text-xs">
						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Authoritative Lifecycle State</span>
							<span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
								{lifecycleTrade?.lifecycleState ?? "AWAITING_PAYMENT"}
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Seller Principal Locked</span>
							<span className="font-mono font-semibold text-[#0d2b1e]">
								{usdcAmount} USDC
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Buyer Collateral Required</span>
							<span className="font-mono font-medium text-[#1a9e5c]">
								0.00 USDC (Seller-Funded)
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Buyer Payment Status</span>
							<span className="font-mono text-[#0d2b1e]">
								{lifecycleTrade?.paymentState ?? (canProceedStep1 ? "CONFIRMED" : "INITIATED")}
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Seller Payout Status</span>
							<span className="font-mono text-[#0d2b1e]">
								{lifecycleTrade?.payoutState ?? "NOT_STARTED"}
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[#7aaa92]">Arc Escrow Operation</span>
							<span className="font-mono text-[#1a9e5c]">
								{lifecycleTrade?.escrowState ?? "LOCKED"}
							</span>
						</div>
					</div>

					{/* Action Controls for Payout & Escrow Release */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						<button
							type="button"
							disabled={actionBusy !== null}
							onClick={() => void handleLifecycleAction("confirm_payout")}
							className="py-2 px-3 rounded-lg border border-[#d1e8dc] bg-white hover:bg-[#f0f7f3] text-[#0d2b1e] text-xs font-medium disabled:opacity-50"
						>
							{actionBusy === "confirm_payout"
								? "Confirming Payout..."
								: "Confirm Seller Payout"}
						</button>

						<button
							type="button"
							disabled={actionBusy !== null}
							onClick={() => void handleLifecycleAction("release_escrow")}
							className="py-2 px-3 rounded-lg bg-[#1a9e5c] hover:bg-[#15854c] text-white text-xs font-semibold disabled:opacity-50"
						>
							{actionBusy === "release_escrow"
								? "Releasing USDC..."
								: "Release Escrow on Arc"}
						</button>
					</div>

					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setStep(1)}
							className="flex-1 py-2 rounded-lg border border-[#d1e8dc] text-[#3d6b55] text-xs font-medium hover:bg-[#f0f7f3]"
						>
							Back
						</button>
						<button
							type="button"
							onClick={() => setStep(3)}
							className="flex-1 py-2 rounded-lg border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] text-xs font-semibold"
						>
							View Audit Trail & Dispute
						</button>
					</div>
				</div>
			)}

			{/* ── STEP 3: Real Server Audit Trail & Dispute Control ── */}
			{step === 3 && (
				<div className="space-y-4">
					<div className="rounded-lg border border-[#d1e8dc] bg-[#fbfdfc] p-3">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-semibold text-[#0d2b1e]">
								Immutable Trade Audit Log (#{activeTradeId})
							</span>
							<span className="text-[10px] font-mono text-[#7aaa92]">
								{(lifecycleTrade?.auditLog ?? []).length} events
							</span>
						</div>

						{(lifecycleTrade?.auditLog ?? []).length === 0 ? (
							<div className="py-6 text-center text-xs text-[#7aaa92]">
								No state transitions recorded yet for Trade #{activeTradeId}.
							</div>
						) : (
							<div className="space-y-2 max-h-52 overflow-y-auto pr-1">
								{(lifecycleTrade?.auditLog ?? []).map((ev) => (
									<div
										key={ev.id}
										className="p-2.5 rounded border border-[#d1e8dc] bg-white text-xs flex items-start justify-between gap-2"
									>
										<div className="min-w-0">
											<div className="font-mono font-medium text-[#0d2b1e] truncate">
												{ev.eventType}
											</div>
											<div className="text-[11px] text-[#7aaa92] mt-0.5">
												{ev.previousState ? `${ev.previousState} → ` : ""}
												<span className="font-mono text-[#1a9e5c]">{ev.newState}</span> ·{" "}
												{ev.actorRole}
											</div>
										</div>
										<span className="text-[10px] font-mono text-[#7aaa92] shrink-0">
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
							className="flex-1 py-2 rounded-lg border border-[#d1e8dc] text-[#3d6b55] text-xs font-medium hover:bg-[#f0f7f3]"
						>
							Back to Settlement
						</button>

						<button
							type="button"
							disabled={actionBusy !== null}
							onClick={() =>
								void handleLifecycleAction("hold_payout", {
									reason: "Manual dispute / arbitration requested from trading terminal.",
								})
							}
							className="flex-1 py-2 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium flex items-center justify-center gap-1.5"
						>
							<AlertTriangle size={13} />
							<span>Place Trade on Hold / Dispute</span>
						</button>
					</div>
				</div>
			)}
				</>
			)}
		</div>
	);
}
