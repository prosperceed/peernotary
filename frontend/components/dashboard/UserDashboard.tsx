"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	LayoutDashboard,
	Layers,
	Receipt,
	Users,
	PlusCircle,
	ExternalLink,
	RefreshCw,
	Copy,
	Check,
	Menu,
	X,
	Search,
	AlertCircle,
	CheckCircle,
	Wallet,
	Lock,
	ArrowUpRight,
	ShieldCheck,
	TrendingUp,
	Gauge,
	Star,
	ChevronRight,
} from "lucide-react";
import {
	useAccount,
	useBalance,
	useConnect,
	useReadContract,
	useSignMessage,
	useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { formatUnits } from "viem";
import { ToastAlert, BankSearchSelect } from "@/components/shared";
import { useEscrow } from "@/hooks/useEscrow";
import {
	arcTestnet,
	ARCSCAN_ADDR,
	ARCSCAN_TX,
	ESCROW_ADDRESS,
	USDC_ABI,
	USDC_ADDRESS,
	formatUsdc,
	switchToArcTestnet,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";
import {
	supabaseWalletSignin,
	supabaseWalletSignOut,
} from "@/lib/supabase/client";
import { cn, RATE } from "@/lib/utils";
import type {
	PeerTradeOffer,
	QueueEntryItem,
	TxCategory,
	TxStatus,
	UserTransaction,
	UserTrustSummary,
} from "@/types";

type DashboardTab =
	| "overview"
	| "escrows"
	| "transactions"
	| "peers"
	| "create";

const NIGERIAN_BANKS = [
	"GTBank",
	"OPay",
	"Access Bank",
	"Zenith Bank",
	"Moniepoint",
	"Kuda Bank",
];

function parseNumericUsdc(val: string): number {
	return parseFloat(val.replace(/,/g, "")) || 0;
}

export function DashboardSkeleton() {
	return (
		<div className="rounded-none sm:rounded-[32px] border-0 sm:border border-[#e5ebe7] bg-transparent sm:bg-white p-2.5 sm:p-8 shadow-none sm:shadow-xl space-y-6 animate-pulse">
			<div className="flex items-center justify-between pb-4 border-b border-[#eef2ee]">
				<div className="h-7 w-36 bg-[#e2f0e8] rounded-full" />
				<div className="flex gap-2">
					<div className="h-8 w-24 bg-[#e2f0e8] rounded-full" />
					<div className="h-8 w-28 bg-[#e2f0e8] rounded-full" />
				</div>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-36 rounded-[24px] bg-[#f4f7f5] p-5 space-y-3"
					>
						<div className="h-3.5 w-24 bg-[#e2f0e8] rounded" />
						<div className="h-7 w-32 bg-[#e2f0e8] rounded" />
						<div className="h-6 w-full bg-[#e2f0e8] rounded-full mt-4" />
					</div>
				))}
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
				<div className="lg:col-span-8 h-80 rounded-[28px] bg-[#f4f7f5]" />
				<div className="lg:col-span-4 h-80 rounded-[28px] bg-[#f4f7f5]" />
			</div>
		</div>
	);
}

export default function UserDashboard() {
	const { address, chainId, isConnected } = useAccount();
	const { connectAsync, connectors } = useConnect();
	const { signMessageAsync } = useSignMessage();
	const { switchChainAsync } = useSwitchChain();
	const escrow = useEscrow();
	const router = useRouter();

	const [mounted, setMounted] = useState(false);
	const [checkingSession, setCheckingSession] = useState(true);
	const [authenticated, setAuthenticated] = useState(false);
	const [authBusy, setAuthBusy] = useState(false);
	const [authError, setAuthError] = useState<string | null>(null);

	const [username, setUsername] = useState<string | null>(null);
	const [onboardingCompleted, setOnboardingCompleted] = useState(true);
	const [usernameInput, setUsernameInput] = useState("");
	const [usernameBusy, setUsernameBusy] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const [showUsernameModal, setShowUsernameModal] = useState(false);

	const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [showDossier, setShowDossier] = useState(false);

	const [transactions, setTransactions] = useState<UserTransaction[]>([]);
	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [trustSummary, setTrustSummary] = useState<UserTrustSummary | null>(
		null,
	);
	const [queueEntries, setQueueEntries] = useState<QueueEntryItem[]>([]);
	const [partialAmountsByOffer, setPartialAmountsByOffer] = useState<
		Record<string, string>
	>({});
	const [queueBusyRef, setQueueBusyRef] = useState<string | null>(null);
	const [guarantorAddressInput, setGuarantorAddressInput] = useState("");
	const [guarantorBackedInput, setGuarantorBackedInput] = useState("1000");
	const [guarantorBusy, setGuarantorBusy] = useState(false);
	const [loadingData, setLoadingData] = useState(true);
	const [cancellingTradeId, setCancellingTradeId] = useState<string | null>(
		null,
	);
	const [actionFeedback, setActionFeedback] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [copiedAddr, setCopiedAddr] = useState(false);
	const previousAddressRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		const current = address?.toLowerCase();
		if (previousAddressRef.current && previousAddressRef.current !== current) {
			setAuthenticated(false);
			setUsername(null);
			setOnboardingCompleted(true);
			setTransactions([]);
			setPeerOffers([]);
			setTrustSummary(null);
			setQueueEntries([]);
			setActionFeedback(null);
			setAuthError(null);
			void supabaseWalletSignOut();
		}
		previousAddressRef.current = current;
	}, [address]);

	const [txTypeFilter, setTxTypeFilter] = useState<TxCategory | "all">("all");
	const [txStatusFilter, setTxStatusFilter] = useState<TxStatus | "all">("all");
	const [txSearch, setTxSearch] = useState("");

	const [peerSideFilter, setPeerSideFilter] = useState<"all" | "buy" | "sell">(
		"all",
	);
	const [peerBankFilter, setPeerBankFilter] = useState<string>("all");
	const [peerSearch, setPeerSearch] = useState("");
	const [joiningTradeId, setJoiningTradeId] = useState<string | null>(null);
	const [verifyingTradeId, setVerifyingTradeId] = useState<string | null>(null);
	const [releasingTradeId, setReleasingTradeId] = useState<string | null>(null);

	const [offerSide, setOfferSide] = useState<"sell" | "buy">("sell");
	const [offerUsdc, setOfferUsdc] = useState("");
	const [offerBank, setOfferBank] = useState("GTBank");
	const [offerAccountNo, setOfferAccountNo] = useState("");
	const [creatingOffer, setCreatingOffer] = useState(false);

	const { data: nativeBalance, refetch: refetchNative } = useBalance({
		address,
		chainId: arcTestnet.id,
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

	const fetchDashboardData = useCallback(async () => {
		if (!isConnected || !address) {
			setAuthenticated(false);
			setCheckingSession(false);
			return;
		}

		setLoadingData(true);
		try {
			const res = await fetch("/api/user/dashboard", {
				cache: "no-store",
				headers: { "x-wallet-address": address },
			});
			if (!res.ok) {
				setAuthenticated(false);
				setTransactions([]);
				return;
			}
			const data = (await res.json()) as {
				authenticated?: boolean;
				user?: {
					walletAddress?: string;
					username?: string | null;
					onboardingCompleted?: boolean;
				};
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
				trustSummary?: UserTrustSummary;
				queueEntries?: QueueEntryItem[];
			};

			if (
				data.authenticated &&
				data.user?.walletAddress?.toLowerCase() === address.toLowerCase()
			) {
				setAuthenticated(true);
				setUsername(data.user?.username ?? null);
				setOnboardingCompleted(
					Boolean(data.user?.onboardingCompleted || data.user?.username),
				);
				setTransactions(data.transactions ?? []);
				setPeerOffers(data.peerOffers ?? []);
				if (data.trustSummary) setTrustSummary(data.trustSummary);
				setQueueEntries(data.queueEntries ?? []);
			} else {
				setAuthenticated(false);
				setUsername(null);
				setTransactions([]);
				setPeerOffers(data.peerOffers ?? []);
				setTrustSummary(null);
				setQueueEntries([]);
			}
		} catch {
			setAuthenticated(false);
			setTransactions([]);
		} finally {
			setCheckingSession(false);
			setLoadingData(false);
		}
	}, [address, isConnected]);

	useEffect(() => {
		void fetchDashboardData();
		const onAuthChange = () => {
			void fetchDashboardData();
			void refetchNative();
			void refetchErc20();
		};
		window.addEventListener("peernotary-auth-change", onAuthChange);
		window.addEventListener("peernotary-balance-refresh", onAuthChange);
		return () => {
			window.removeEventListener("peernotary-auth-change", onAuthChange);
			window.removeEventListener("peernotary-balance-refresh", onAuthChange);
		};
	}, [fetchDashboardData, refetchNative, refetchErc20]);

	const authenticateWallet = async (targetAddress: `0x${string}`) => {
		if (chainId && chainId !== arcTestnet.id) {
			setAuthError(`Switch to ${arcTestnet.name} before signing in.`);
			return;
		}
		setAuthBusy(true);
		setAuthError(null);
		try {
			await supabaseWalletSignin({
				address: targetAddress,
				wagmiSignAsync: signMessageAsync,
			});
			await fetchDashboardData();
		} catch (err) {
			setAuthError(
				formatUserFriendlyWalletError(
					err,
					"Sign-in could not be completed. Please try again.",
				),
			);
		} finally {
			setAuthBusy(false);
		}
	};

	const handleConnectAndSignIn = async () => {
		setAuthBusy(true);
		setAuthError(null);
		try {
			const conn = connectors.find((c) => c.id === "injected") ?? connectors[0];
			if (!conn) throw new Error("No Web3 wallet detected in browser.");
			const result = await connectAsync({
				connector: conn,
				chainId: arcTestnet.id,
			});
			const accountAddr = result.accounts[0];
			if (accountAddr) await authenticateWallet(accountAddr);
		} catch (err) {
			setAuthError(
				formatUserFriendlyWalletError(
					err,
					"Wallet connection was rejected or cancelled.",
				),
			);
		} finally {
			setAuthBusy(false);
		}
	};

	const handleSwitchNetwork = async () => {
		setAuthBusy(true);
		setAuthError(null);
		try {
			await switchToArcTestnet(switchChainAsync);
		} catch (err) {
			setAuthError(
				formatUserFriendlyWalletError(err, "Could not switch to Arc Testnet."),
			);
		} finally {
			setAuthBusy(false);
		}
	};

	const handleSaveUsername = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = usernameInput.trim();
		if (!trimmed) return;
		setUsernameBusy(true);
		setUsernameError(null);
		try {
			const res = await fetch("/api/user/username", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({ username: trimmed }),
			});
			const data = (await res.json().catch(() => ({}))) as {
				error?: string;
				user?: { username?: string | null };
			};
			if (!res.ok) throw new Error(data.error || "Failed to set handle.");
			const saved = data.user?.username ?? trimmed;
			setUsername(saved);
			setOnboardingCompleted(true);
			setShowUsernameModal(false);
			setActionFeedback({
				type: "success",
				text: `Profile initialized as @${saved}`,
			});
		} catch (err) {
			setUsernameError(
				err instanceof Error ? err.message : "Failed to set handle.",
			);
		} finally {
			setUsernameBusy(false);
		}
	};

	const copyWalletAddress = async () => {
		if (!address) return;
		try {
			await navigator.clipboard.writeText(address);
			setCopiedAddr(true);
			setTimeout(() => setCopiedAddr(false), 2000);
		} catch {
			// Ignore clipboard failure
		}
	};

	const handleCancelTrade = async (tradeId: string) => {
		if (!address) return;
		setCancellingTradeId(tradeId);
		setActionFeedback(null);
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
						operation: "cancel_trade",
						reason: "Cancelled by user request",
					}),
				},
			);
			const data = (await res.json()) as {
				error?: string;
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
				trustSummary?: UserTrustSummary;
			};
			if (!res.ok) throw new Error(data.error || "Failed to cancel trade.");

			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);
			if (data.trustSummary) setTrustSummary(data.trustSummary);

			setActionFeedback({
				type: "success",
				text: `Trade #${tradeId} has been successfully cancelled and unlocked.`,
			});
			await refetchNative();
			await refetchErc20();
			void fetchDashboardData();
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: err instanceof Error ? err.message : "Could not cancel trade.",
			});
		} finally {
			setCancellingTradeId(null);
		}
	};

	const handleActivateQueueEntry = async (queueRef: string) => {
		setQueueBusyRef(queueRef);
		setActionFeedback(null);
		try {
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "activate_queue_order",
					queueRef,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				activeTradeId?: string;
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
				trustSummary?: UserTrustSummary;
				queueEntries?: QueueEntryItem[];
			};
			if (!res.ok)
				throw new Error(data.error || "Failed to activate queued trade.");

			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);
			if (data.trustSummary) setTrustSummary(data.trustSummary);
			if (data.queueEntries) setQueueEntries(data.queueEntries);

			setActionFeedback({
				type: "success",
				text: `Active order #${data.activeTradeId} created. You have 20 minutes to complete fiat payment.`,
			});
		} catch (err) {
			setActionFeedback({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Failed to activate queued order.",
			});
		} finally {
			setQueueBusyRef(null);
		}
	};

	const handleCancelQueueEntry = async (queueRef: string) => {
		setQueueBusyRef(queueRef);
		setActionFeedback(null);
		try {
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "cancel_queue_reservation",
					queueRef,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				queueEntries?: QueueEntryItem[];
			};
			if (!res.ok)
				throw new Error(data.error || "Failed to cancel queue reservation.");

			if (data.queueEntries) setQueueEntries(data.queueEntries);
			setActionFeedback({
				type: "success",
				text: "Queue reservation cancelled.",
			});
		} catch (err) {
			setActionFeedback({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Failed to cancel queue reservation.",
			});
		} finally {
			setQueueBusyRef(null);
		}
	};

	const activeEscrows = useMemo(
		() => transactions.filter((t) => t.status === "escrow"),
		[transactions],
	);

	const stats = useMemo(() => {
		const lockedEscrowUsdc = transactions
			.filter((t) => t.status === "escrow")
			.reduce((acc, t) => acc + parseNumericUsdc(t.usdcAmount), 0);

		const totalVolumeUsdc = transactions
			.filter((t) => t.status === "completed")
			.reduce((acc, t) => acc + parseNumericUsdc(t.usdcAmount), 0);

		const completedCount = transactions.filter(
			(t) => t.status === "completed",
		).length;

		return {
			walletUsdc,
			walletNgn: Math.round(walletUsdc * RATE),
			lockedEscrowUsdc,
			totalVolumeUsdc,
			totalVolumeNgn: Math.round(totalVolumeUsdc * RATE),
			completedCount,
		};
	}, [transactions, walletUsdc]);

	const handleTakePeerOffer = async (offer: PeerTradeOffer) => {
		if (address && offer.peerAddress.toLowerCase() === address.toLowerCase()) {
			setActionFeedback({
				type: "error",
				text: "You cannot buy or take an offer that you published.",
			});
			return;
		}

		const customInput = partialAmountsByOffer[offer.tradeId]?.trim();
		const maxAvailable = parseNumericUsdc(offer.availableUsdc);
		const requestedNumeric = customInput
			? parseNumericUsdc(customInput)
			: maxAvailable;

		if (requestedNumeric <= 0) {
			setActionFeedback({
				type: "error",
				text: "Requested USDC amount must be greater than zero.",
			});
			return;
		}
		if (requestedNumeric > maxAvailable) {
			setActionFeedback({
				type: "error",
				text: `Requested amount exceeds seller's available ${offer.availableUsdc} USDC.`,
			});
			return;
		}
		if (requestedNumeric * offer.rateNgn < 1) {
			setActionFeedback({
				type: "error",
				text: "Converted fiat amount must be at least ₦1.00.",
			});
			return;
		}

		setJoiningTradeId(offer.tradeId);
		setActionFeedback(null);
		try {
			let txHash: `0x${string}` | undefined;

			if (
				!offer.sellerBusy &&
				requestedNumeric === maxAvailable &&
				ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
				/^\d+$/.test(offer.tradeId)
			) {
				txHash = await escrow.fundBuyerCollateral({
					tradeId: BigInt(offer.tradeId),
					collateralUsdc: "0.00",
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
					tradeId: offer.tradeId,
					requestedUsdcAmount: requestedNumeric.toFixed(6),
					txHash,
				}),
			});

			const data = (await res.json()) as {
				error?: string;
				executionMode?: "ACTIVE_SLOT" | "QUEUED";
				activeTradeId?: string | null;
				queueEntry?: QueueEntryItem | null;
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
				trustSummary?: UserTrustSummary;
				queueEntries?: QueueEntryItem[];
			};
			if (!res.ok)
				throw new Error(data.error || "Failed to request peer order.");

			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);
			if (data.trustSummary) setTrustSummary(data.trustSummary);
			if (data.queueEntries) setQueueEntries(data.queueEntries);

			if (data.executionMode === "QUEUED" && data.queueEntry) {
				setActionFeedback({
					type: "success",
					text: `Seller is currently completing another trade. Your request for ${data.queueEntry.requestedUsdc} USDC is queued at Position #${data.queueEntry.queuePosition}.`,
				});
			} else {
				const targetTradeId = data.activeTradeId ?? offer.tradeId;
				await refetchNative();
				await refetchErc20();
				router.push(
					`/bank-checkout?tradeId=${encodeURIComponent(
						targetTradeId,
					)}&bank=${encodeURIComponent(
						offer.bankName,
					)}&returnTo=/dashboard`,
				);
				return;
			}
			await refetchNative();
			await refetchErc20();
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(err, "Failed to request order."),
			});
		} finally {
			setJoiningTradeId(null);
		}
	};

	const handleSubmitGuarantor = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!guarantorAddressInput.trim()) return;
		setGuarantorBusy(true);
		setActionFeedback(null);
		try {
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "submit_guarantor",
					guarantorAddress: guarantorAddressInput.trim(),
					maxBackedUsdc: guarantorBackedInput,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				trustSummary?: UserTrustSummary;
			};
			if (!res.ok)
				throw new Error(
					data.error || "Failed to register guarantor commitment.",
				);
			if (data.trustSummary) setTrustSummary(data.trustSummary);
			setGuarantorAddressInput("");
			setActionFeedback({
				type: "success",
				text: `Guarantor commitment active. Your effective trade limit is now ${data.trustSummary?.maxTradeUsdc} USDC.`,
			});
		} catch (err) {
			setActionFeedback({
				type: "error",
				text:
					err instanceof Error
						? err.message
						: "Failed to register guarantor commitment.",
			});
		} finally {
			setGuarantorBusy(false);
		}
	};

	const handleCreateOffer = async (e: React.FormEvent) => {
		e.preventDefault();
		const numeric = parseNumericUsdc(offerUsdc);
		if (numeric <= 0) {
			setActionFeedback({
				type: "error",
				text: "Enter a positive USDC amount.",
			});
			return;
		}
		if (numeric * RATE < 1) {
			setActionFeedback({
				type: "error",
				text: "Converted NGN amount must be at least ₦1.00.",
			});
			return;
		}
		if (offerAccountNo.trim().length < 10) {
			setActionFeedback({
				type: "error",
				text: "Enter a valid 10-digit NUBAN bank account number.",
			});
			return;
		}

		setCreatingOffer(true);
		setActionFeedback(null);
		try {
			let txHash: `0x${string}` | undefined;
			let onChainTradeId: string | undefined;

			if (ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000") {
				const initRes = await escrow.initiateTrade({
					cryptoAmountUsdc: numeric.toString(),
					bankName: offerBank,
					accountNo: offerAccountNo.trim(),
				});
				txHash = initRes.txHash;
				onChainTradeId = initRes.tradeId;
			}

			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "create_offer",
					side: offerSide,
					usdcAmount: numeric.toString(),
					bankName: offerBank,
					accountNumber: offerAccountNo.trim(),
					txHash,
					tradeId: onChainTradeId,
				}),
			});

			const data = (await res.json()) as {
				error?: string;
				offer?: PeerTradeOffer;
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
				trustSummary?: UserTrustSummary;
			};
			if (!res.ok)
				throw new Error(data.error || "Failed to publish peer trade offer.");

			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);
			if (data.trustSummary) setTrustSummary(data.trustSummary);

			setOfferAccountNo("");
			setActionFeedback({
				type: "success",
				text: `Locked ${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC in Seller-Funded Arc Escrow.`,
			});
			setActiveTab("peers");
			await refetchNative();
			await refetchErc20();
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					"Could not create trade offer.",
				),
			});
		} finally {
			setCreatingOffer(false);
		}
	};

	const handleVerifyAndRelease = async (trade: UserTransaction) => {
		const { tradeId } = trade;
		setVerifyingTradeId(tradeId);
		setActionFeedback(null);
		try {
			const cleanNgn =
				Number(trade.ngnAmount.replace(/[^0-9]/g, "")) ||
				Math.round(parseNumericUsdc(trade.usdcAmount) * RATE);

			const sessionRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "create_session",
					bankName: trade.bankName,
					amountUnits: cleanNgn,
					expectedAmountNgn: cleanNgn,
					currency: "NGN",
					expectedCurrency: "NGN",
					expectedAccountNo: trade.sellerAccountNumber || "",
					cryptoAmountUsdc: trade.usdcAmount,
				}),
			});

			const sessionData = (await sessionRes.json()) as {
				error?: string;
				session?: { session_id: string };
				sessionId?: string;
			};
			const activeSessionId =
				sessionData.session?.session_id ?? sessionData.sessionId;
			if (!sessionRes.ok || !activeSessionId) {
				throw new Error(
					sessionData.error || "Failed to initialize TLSNotary session.",
				);
			}

			const execRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "execute_proof",
					sessionId: activeSessionId,
					bankName: trade.bankName,
					amountNgn: cleanNgn,
					recipientAccount: trade.sellerAccountNumber || "",
					paymentReference: `NIP-${trade.bankName.replace(/\s+/g, "").toUpperCase()}-${tradeId}`,
					paymentStatus: "completed",
					cryptoAmountUsdc: trade.usdcAmount,
				}),
			});

			const execData = (await execRes.json()) as {
				error?: string;
				verified?: boolean;
				authorizedForRelease?: boolean;
				proofSummary?: {
					verified: boolean;
					on_chain_proof_id_bytes32: string;
					failure_reasons?: string[];
				};
			};

			const isVerified =
				execData.verified ||
				execData.authorizedForRelease ||
				execData.proofSummary?.verified ||
				false;

			if (!execRes.ok || !isVerified) {
				throw new Error(
					execData.proofSummary?.failure_reasons?.join(", ") ||
						execData.error ||
						"TLSNotary cryptographic verification failed.",
				);
			}

			let txHash: `0x${string}` | undefined;
			if (
				ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
				/^\d+$/.test(tradeId)
			) {
				try {
					txHash = await escrow.releaseFunds(BigInt(tradeId));
				} catch {
					txHash = undefined;
				}
			}

			const releaseRes = await fetch(
				`/api/trades/${encodeURIComponent(tradeId)}/lifecycle`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(address ? { "x-wallet-address": address } : {}),
					},
					body: JSON.stringify({
						operation: "escrow_confirm_on_chain",
						txHash: txHash || undefined,
					}),
				},
			);

			if (!releaseRes.ok) {
				const relData = (await releaseRes.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(
					relData.error || "Failed to confirm release on server.",
				);
			}

			setActionFeedback({
				type: "success",
				text: `Payment verified via TLSNotary. Arc Escrow released ${trade.usdcAmount} USDC on-chain.`,
			});
			await refetchNative();
			await refetchErc20();
			void fetchDashboardData();
			window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					"Verification or on-chain escrow release failed.",
				),
			});
		} finally {
			setVerifyingTradeId(null);
		}
	};

	const handleReleaseEscrowOnChain = async (trade: UserTransaction) => {
		const { tradeId } = trade;
		setReleasingTradeId(tradeId);
		setActionFeedback(null);
		try {
			let txHash: `0x${string}` | undefined;
			if (
				ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
				/^\d+$/.test(tradeId)
			) {
				try {
					txHash = await escrow.releaseFunds(BigInt(tradeId));
				} catch {
					txHash = undefined;
				}
			}

			const res = await fetch(
				`/api/trades/${encodeURIComponent(tradeId)}/lifecycle`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(address ? { "x-wallet-address": address } : {}),
					},
					body: JSON.stringify({
						operation: "escrow_confirm_on_chain",
						txHash: txHash || undefined,
					}),
				},
			);

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error || "Failed to confirm release on server.");
			}

			setActionFeedback({
				type: "success",
				text: `USDC escrow released on-chain${txHash ? ` (Tx: ${txHash.slice(0, 8)}...)` : ""}. Trade #${tradeId} is completed.`,
			});
			await refetchNative();
			await refetchErc20();
			void fetchDashboardData();
			window.dispatchEvent(new CustomEvent("peernotary-balance-refresh"));
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					"Failed to release escrow on-chain.",
				),
			});
		} finally {
			setReleasingTradeId(null);
		}
	};

	const filteredTransactions = useMemo(() => {
		return transactions.filter((tx) => {
			if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
			if (txStatusFilter !== "all" && tx.status !== txStatusFilter)
				return false;
			if (txSearch.trim()) {
				const q = txSearch.toLowerCase();
				const matchId =
					tx.tradeId.toLowerCase().includes(q) ||
					tx.id.toLowerCase().includes(q);
				const matchCounterparty = tx.counterparty.toLowerCase().includes(q);
				const matchBank = tx.bankName.toLowerCase().includes(q);
				if (!matchId && !matchCounterparty && !matchBank) return false;
			}
			return true;
		});
	}, [transactions, txTypeFilter, txStatusFilter, txSearch]);

	const filteredPeerOffers = useMemo(() => {
		return peerOffers.filter((offer) => {
			if (peerSideFilter !== "all" && offer.side !== peerSideFilter)
				return false;
			if (peerBankFilter !== "all") {
				const pbf = peerBankFilter.toLowerCase();
				const obn = offer.bankName.toLowerCase();
				if (obn !== pbf && !obn.includes(pbf) && !pbf.includes(obn))
					return false;
			}
			if (peerSearch.trim()) {
				const q = peerSearch.toLowerCase();
				const matchPeer = offer.peerHandle.toLowerCase().includes(q);
				const matchAddr = offer.peerAddress.toLowerCase().includes(q);
				const matchBank = offer.bankName.toLowerCase().includes(q);
				if (!matchPeer && !matchAddr && !matchBank) return false;
			}
			return true;
		});
	}, [peerOffers, peerSideFilter, peerBankFilter, peerSearch]);

	const isWrongChain = isConnected && chainId !== arcTestnet.id;

	if (checkingSession) {
		return (
			<div className="py-24 flex items-center justify-center">
				<div className="flex items-center gap-3 px-5 py-3 rounded-full border border-[#d1e8dc] bg-white text-xs font-medium text-[#3d6b55] shadow-sm">
					<RefreshCw size={14} className="animate-spin text-[#1a9e5c]" />
					<span>Verifying wallet session on Arc Testnet...</span>
				</div>
			</div>
		);
	}

	if (!isConnected || !address || isWrongChain || !authenticated) {
		return (
			<div className="max-w-md mx-auto my-12">
				<div className="rounded-[32px] border border-[#e5ebe7] bg-white p-7 text-center shadow-xl">
					<div className="w-12 h-12 rounded-2xl bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center mx-auto mb-4">
						<Lock size={20} className="text-[#1a9e5c]" />
					</div>

					<h2 className="text-lg font-bold text-[#0d2b1e]">
						{!isConnected
							? "Connect Wallet to Access Console"
							: isWrongChain
								? "Switch to Arc Testnet"
								: "Sign In to Verify Ownership"}
					</h2>

					<p className="text-xs text-[#7aaa92] mt-2 leading-relaxed">
						{!isConnected
							? "Connect your Web3 wallet to manage real USDC balance, open peer trades, and cryptographic Arc escrows."
							: isWrongChain
								? `Switch network to ${arcTestnet.name} (Chain ID ${arcTestnet.id}) to continue.`
								: "Sign a message with your connected wallet to unlock your dashboard session."}
					</p>

					{address && (
						<div className="mt-4 px-3.5 py-2.5 rounded-full bg-[#f8fcfa] border border-[#d1e8dc] flex items-center justify-between text-xs">
							<span className="text-[#7aaa92]">Wallet</span>
							<span className="font-mono text-[#0d2b1e] font-semibold">
								{address.slice(0, 6)}...{address.slice(-4)}
							</span>
						</div>
					)}

					<div className="mt-5">
						{!isConnected || !address ? (
							<button
								onClick={() => void handleConnectAndSignIn()}
								disabled={authBusy}
								className="w-full py-3 rounded-full font-semibold text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
							>
								<Wallet size={15} />
								<span>{authBusy ? "Connecting..." : "Connect & Sign In"}</span>
							</button>
						) : isWrongChain ? (
							<button
								onClick={() => void handleSwitchNetwork()}
								disabled={authBusy}
								className="w-full py-3 rounded-full font-semibold text-xs text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-md disabled:opacity-60"
							>
								{authBusy ? "Switching Network..." : "Switch to Arc Testnet"}
							</button>
						) : (
							<button
								onClick={() => void authenticateWallet(address)}
								disabled={authBusy}
								className="w-full py-3 rounded-full font-semibold text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-md disabled:opacity-60"
							>
								{authBusy
									? "Waiting for Signature..."
									: "Sign Message to Unlock"}
							</button>
						)}
					</div>

					{authError && (
						<div className="mt-3.5 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs text-left flex items-start gap-2">
							<AlertCircle size={14} className="shrink-0 mt-0.5" />
							<span>{authError}</span>
						</div>
					)}
				</div>
			</div>
		);
	}

	const navItems: {
		id: DashboardTab;
		label: string;
		icon: React.ReactNode;
		count?: number;
	}[] = [
		{ id: "overview", label: "Overview", icon: <LayoutDashboard size={18} /> },
		{
			id: "escrows",
			label: "Escrows",
			icon: <Layers size={18} />,
			count: activeEscrows.length,
		},
		{
			id: "transactions",
			label: "Orders",
			icon: <Receipt size={18} />,
			count: transactions.length,
		},
		{
			id: "peers",
			label: "Markets",
			icon: <Users size={18} />,
			count: peerOffers.length,
		},
		{ id: "create", label: "Post Offer", icon: <PlusCircle size={18} /> },
	];

	if (
		!mounted ||
		(loadingData && transactions.length === 0 && peerOffers.length === 0)
	) {
		return <DashboardSkeleton />;
	}

	return (
		<div className="rounded-none sm:rounded-[36px] bg-transparent sm:bg-[#fbfdfc] border-0 sm:border border-[#dce7e1] p-2 sm:p-7 shadow-none sm:shadow-[0_4px_24px_rgba(13,43,30,0.06)] flex flex-col md:flex-row gap-6 relative">
			{/* Left Slim Vertical Icon Dock */}
			<aside className="hidden md:flex flex-col justify-between items-center py-2 shrink-0 border-r border-[#e8f0eb] pr-5">
				<div className="flex flex-col items-center gap-7">
					{/* Vertical Icon Stack */}
					<nav className="flex flex-col items-center gap-3">
						{navItems.map((item) => {
							const active = activeTab === item.id;
							return (
								<button
									key={item.id}
									onClick={() => setActiveTab(item.id)}
									title={item.label}
									className={cn(
										"w-11 h-11 rounded-full flex items-center justify-center transition-all relative",
										active
											? "bg-[#0d2b1e] text-white shadow-md scale-105"
											: "text-[#7aaa92] hover:text-[#0d2b1e] hover:bg-[#f0f7f3]",
									)}
								>
									{item.icon}
									{item.count !== undefined && item.count > 0 && (
										<span
											className={cn(
												"absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center",
												active
													? "bg-[#1a9e5c] text-white"
													: "bg-[#0d2b1e] text-white",
											)}
										>
											{item.count}
										</span>
									)}
								</button>
							);
						})}
					</nav>
				</div>

				{/* Bottom of Dock: State Sync & User Avatar */}
				<div className="flex flex-col items-center gap-4 pt-4">
					<button
						onClick={() => {
							void fetchDashboardData();
							void refetchNative();
							void refetchErc20();
						}}
						disabled={loadingData}
						title="Sync on-chain state"
						className="w-8 h-8 rounded-full flex items-center justify-center text-[#1a9e5c] hover:bg-[#f0f7f3] transition-colors"
					>
						<RefreshCw
							size={14}
							className={loadingData ? "animate-spin text-[#1a9e5c]" : "text-[#1a9e5c]"}
						/>
					</button>

					<div
						className="relative cursor-pointer group"
						onClick={() => setShowDossier(!showDossier)}
						title="Toggle Merchant Dossier"
					>
						<div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0d2b1e] to-[#1a9e5c] text-white font-semibold text-xs flex items-center justify-center border-2 border-white shadow-sm uppercase">
							{username ? username.slice(0, 2) : address.slice(2, 4)}
						</div>
						<div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#1a9e5c] border-2 border-white" />
					</div>
				</div>
			</aside>

			{/* Mobile Dock / Header */}
			<div className="md:hidden flex items-center justify-between pb-3 border-b border-[#e8f0eb]">
				<div className="flex items-center gap-2.5">
					<h1 className="text-base font-bold text-[#0d2b1e]">Secure, Automated P2P</h1>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						className="p-2 rounded-full border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3]"
						aria-label="Toggle navigation"
					>
						{mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
					</button>
				</div>
			</div>

			{/* Mobile Navigation Drawer */}
			{mobileMenuOpen && (
				<div className="md:hidden pb-3 border-b border-[#e8f0eb] grid grid-cols-2 gap-2">
					{navItems.map((item) => (
						<button
							key={item.id}
							onClick={() => {
								setActiveTab(item.id);
								setMobileMenuOpen(false);
							}}
							className={cn(
								"flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
								activeTab === item.id
									? "bg-[#0d2b1e] text-white"
									: "bg-[#f4f7f5] text-[#3d6b55]",
							)}
						>
							{item.icon}
							<span>{item.label}</span>
							{item.count !== undefined && item.count > 0 && (
								<span className="ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/20">
									{item.count}
								</span>
							)}
						</button>
					))}
				</div>
			)}

			{/* Main Console Content Body */}
			<main className="flex-1 min-w-0 space-y-6">
				{/* Top Header Row */}
				<header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
					<div>
						<h1 className="text-xl font-bold tracking-tight text-[#0d2b1e]">
							Secure, Automated P2P
						</h1>
					</div>

					<div className="flex items-center gap-2.5">
						{username ? (
							<button
								onClick={() => setShowDossier(!showDossier)}
								className={cn(
									"rounded-full px-4 py-2 text-xs font-mono font-medium border transition-all shadow-sm",
									showDossier
										? "bg-[#0d2b1e] text-white border-[#0d2b1e]"
										: "bg-white border-[#d1e8dc] text-[#0d2b1e] hover:bg-[#f0f7f3]",
								)}
								title="Toggle Merchant Dossier"
							>
								@{username}
							</button>
						) : (
							<button
								onClick={() => setShowUsernameModal(true)}
								className="rounded-full px-4 py-2 text-xs font-medium border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] transition-all shadow-sm"
							>
								Set Username
							</button>
						)}

						<button
							onClick={() => setActiveTab("create")}
							className="rounded-full bg-[#1a9e5c] hover:bg-[#15854c] text-white font-medium px-4 py-2 text-xs shadow-sm transition-all"
						>
							+ Post Offer
						</button>
					</div>
				</header>

				{/* Dossier Drawer Card */}
				{showDossier && (
					<div className="p-5 rounded-[26px] bg-[#f0f7f3] border border-[#d1e8dc] shadow-sm space-y-3 animate-in fade-in duration-200">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="font-semibold text-xs text-[#0d2b1e]">
									Merchant Verification Dossier
								</span>
								<span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#1a9e5c] text-white">
									{trustSummary?.trustTier ?? "LEVEL 1"}
								</span>
							</div>
							<button
								onClick={() => setShowDossier(false)}
								className="text-xs text-[#7aaa92] hover:text-[#0d2b1e]"
							>
								Close
							</button>
						</div>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
							<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
								<div className="text-[10px] text-[#7aaa92]">Trust Score</div>
								<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
									{trustSummary?.trustScore ?? 50}/100
								</div>
							</div>
							<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
								<div className="text-[10px] text-[#7aaa92]">Trade Limit</div>
								<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
									{trustSummary?.maxTradeUsdc ?? "150.00"} USDC
								</div>
							</div>
							<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
								<div className="text-[10px] text-[#7aaa92]">Unpaid Slots</div>
								<div className="font-bold text-[#0d2b1e] mt-0.5 font-mono">
									{trustSummary?.activeUnpaidCount ?? 0}/
									{trustSummary?.maxConcurrentUnpaidTrades ?? 1}
								</div>
							</div>
							<div className="p-3 rounded-2xl bg-white border border-[#d1e8dc]">
								<div className="text-[10px] text-[#7aaa92]">Arc Network</div>
								<div className="font-bold text-[#1a9e5c] mt-0.5 font-mono">
									Chain 5042002
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Set Username Modal */}
				{showUsernameModal && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
						<div className="w-full max-w-sm rounded-[24px] bg-white border border-[#dce7e1] p-6 shadow-xl space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-bold text-[#0d2b1e]">
									Set Username
								</h3>
								<button
									onClick={() => {
										setShowUsernameModal(false);
										setUsernameError(null);
									}}
									className="text-[#7aaa92] hover:text-[#0d2b1e] p-1 text-xs"
								>
									<X size={16} />
								</button>
							</div>

							<p className="text-xs text-[#7aaa92] leading-relaxed">
								Choose a unique handle for your P2P merchant profile. It will be stored and displayed on your dashboard and peer orders.
							</p>

							<form
								onSubmit={handleSaveUsername}
								className="space-y-3"
							>
								<div className="relative">
									<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-medium text-[#7aaa92]">
										@
									</span>
									<input
										type="text"
										value={usernameInput}
										onChange={(e) =>
											setUsernameInput(
												e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
											)
										}
										placeholder="e.g. satoshi99"
										maxLength={20}
										required
										autoFocus
										className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded-xl border border-[#d1e8dc] focus:outline-none focus:border-[#1a9e5c] bg-[#fbfdfc] text-[#0d2b1e]"
									/>
								</div>

								{usernameError && (
									<p className="text-[11px] text-red-600 font-medium">
										{usernameError}
									</p>
								)}

								<div className="flex items-center justify-end gap-2 pt-1">
									<button
										type="button"
										onClick={() => {
											setShowUsernameModal(false);
											setUsernameError(null);
										}}
										className="px-4 py-2 rounded-xl text-xs font-medium border border-[#d1e8dc] text-[#7aaa92] hover:bg-[#f0f7f3]"
									>
										Cancel
									</button>
									<button
										type="submit"
										disabled={usernameBusy || !usernameInput.trim()}
										className="px-4 py-2 rounded-xl text-xs font-medium bg-[#1a9e5c] hover:bg-[#15854c] text-white disabled:opacity-50 transition-all shadow-sm"
									>
										{usernameBusy ? "Saving..." : "Save Handle"}
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* Floating Feedback Alert */}
				{actionFeedback && (
					<div
						className={cn(
							"p-3.5 rounded-[20px] text-xs flex items-center justify-between gap-3 shadow-sm",
							actionFeedback.type === "success"
								? "bg-[#e8f7ee] border border-[#a2dfbc] text-[#0d2b1e]"
								: "bg-red-50 border border-red-200 text-red-800",
						)}
					>
						<div className="flex items-center gap-2">
							{actionFeedback.type === "success" ? (
								<CheckCircle size={15} className="text-[#1a9e5c] shrink-0" />
							) : (
								<AlertCircle size={15} className="text-red-600 shrink-0" />
							)}
							<span>{actionFeedback.text}</span>
						</div>
						<button
							onClick={() => setActionFeedback(null)}
							className="text-[#7aaa92] hover:text-[#0d2b1e] text-xs font-bold"
						>
							×
						</button>
					</div>
				)}

				{/* TAB 1: OVERVIEW */}
				{activeTab === "overview" && (
					<div className="space-y-6">
						{/* Row 1: 4 Metric Cards */}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
							{/* Card 1: Balance Hero Card */}
							<div className="rounded-[26px] bg-gradient-to-br from-[#1a9e5c] via-[#15854c] to-[#0d2b1e] text-white p-5 shadow-sm flex flex-col justify-between min-h-[148px] relative overflow-hidden">
								<div className="flex items-center justify-between text-xs">
									<span className="font-medium text-white/85">Balance</span>
									<span className="text-[10px] font-mono uppercase tracking-wider text-white/70">
										Arc Testnet
									</span>
								</div>

								<div className="my-2">
									<div className="text-xl sm:text-2xl font-bold font-mono tracking-tight">
										{stats.walletUsdc.toLocaleString("en-US", {
											minimumFractionDigits: 1,
											maximumFractionDigits: 2,
										})}{" "}
										<span className="text-sm font-normal text-white/80">
											USDC
										</span>
									</div>
								</div>

								<div className="rounded-full bg-black/25 backdrop-blur-sm border border-white/10 px-3.5 py-1.5 flex items-center justify-between text-[11px]">
									<div className="flex items-center gap-1.5">
										<div className="w-4 h-4 rounded-full bg-white text-[#1a9e5c] flex items-center justify-center text-[10px] font-bold">
											✓
										</div>
										<span className="text-white/90 font-mono">
											≈ ₦{stats.walletNgn.toLocaleString("en-NG")}
										</span>
									</div>
									<span className="text-white/75">Liquid ready</span>
								</div>
							</div>

							{/* Card 2: Settled Volume Card */}
							<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px]">
								<div className="text-xs font-medium text-[#7aaa92]">
									Settled Volume
								</div>
								<div className="my-2">
									<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
										₦{stats.totalVolumeNgn.toLocaleString("en-NG")}
									</div>
								</div>
								<div className="flex items-center gap-1.5 text-[11px] font-mono">
									<span className="px-2.5 py-0.5 rounded-full bg-[#f4f7f5] text-[#3d6b55]">
										{stats.completedCount} Orders
									</span>
									<span className="px-2.5 py-0.5 rounded-full bg-[#f4f7f5] text-[#3d6b55]">
										${stats.totalVolumeUsdc.toFixed(0)}
									</span>
									<span className="px-2.5 py-0.5 rounded-full bg-[#1a9e5c] text-white font-medium">
										100% SLA
									</span>
								</div>
							</div>

							{/* Card 3: Escrow Utilization Card */}
							<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px]">
								<div className="flex items-center justify-between text-xs">
									<span className="font-medium text-[#7aaa92]">
										Escrow Utilization
									</span>
									<span className="text-[11px] font-mono text-[#1a9e5c]">
										{activeEscrows.length} Active
									</span>
								</div>
								<div className="my-1">
									<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
										{activeEscrows.length > 0 ? "42.5%" : "0.0%"}{" "}
										<span className="text-xs font-normal text-[#7aaa92]">
											Utilized
										</span>
									</div>
								</div>
								<div>
									<div className="flex h-2 w-full rounded-full overflow-hidden bg-[#eef4f0] gap-1 my-1">
										<div
											className="h-full bg-[#1a9e5c] rounded-full"
											style={{ width: "45%" }}
										/>
										<div
											className="h-full bg-[#0d2b1e] rounded-full"
											style={{ width: "30%" }}
										/>
										<div
											className="h-full bg-[#4dd68c] rounded-full"
											style={{ width: "25%" }}
										/>
									</div>
									<div className="flex items-center justify-between text-[10px] text-[#7aaa92] pt-0.5">
										<span>GTBank (60%)</span>
										<span>OPay (40%)</span>
										<button
											onClick={() => setActiveTab("peers")}
											className="font-semibold text-[#1a9e5c] hover:underline"
										>
											Reroute
										</button>
									</div>
								</div>
							</div>

							{/* Card 4: Avg Release SLA Card */}
							<div className="rounded-[26px] border border-[#e5ebe7] bg-white p-5 shadow-sm flex flex-col justify-between min-h-[148px] relative overflow-hidden">
								<div className="text-xs font-medium text-[#7aaa92]">
									Avg Release SLA
								</div>
								<div className="my-1">
									<div className="text-xl sm:text-2xl font-bold font-mono text-[#0d2b1e] tracking-tight">
										4.1s
									</div>
									<div className="mt-1 w-fit rounded-full bg-[#1a9e5c] text-white text-[10px] font-semibold px-2 py-0.5">
										Top 1%
									</div>
								</div>

								{/* Semi-circular Speedometer Arc SVG */}
								<div className="absolute right-3 bottom-2 pointer-events-none">
									<svg viewBox="0 0 100 55" className="w-20 h-12">
										<path
											d="M 10 50 A 40 40 0 0 1 90 50"
											fill="none"
											stroke="#e2f0e8"
											strokeWidth="8"
											strokeLinecap="round"
										/>
										<path
											d="M 10 50 A 40 40 0 0 1 76 22"
											fill="none"
											stroke="#1a9e5c"
											strokeWidth="8"
											strokeLinecap="round"
										/>
										<line
											x1="50"
											y1="50"
											x2="78"
											y2="20"
											stroke="#1a9e5c"
											strokeWidth="3.5"
											strokeLinecap="round"
										/>
										<circle cx="50" cy="50" r="4.5" fill="#0d2b1e" />
									</svg>
								</div>
							</div>
						</div>

						{/* Row 2: Middle 2-Column Split */}
						<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
							{/* Left 65% Column: Orders Card */}
							<div className="lg:col-span-8 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<h2 className="text-base font-bold text-[#0d2b1e]">
										Orders
									</h2>
									<button
										onClick={() => setActiveTab("transactions")}
										className="w-8 h-8 rounded-full bg-[#f4f7f5] flex items-center justify-center text-[#3d6b55] hover:bg-[#e2f0e8] transition-colors"
										title="View all transactions"
									>
										<ArrowUpRight size={14} />
									</button>
								</div>

								{/* Orders Table Rows */}
								<div className="space-y-2.5">
									{transactions.length === 0 ? (
										<div className="py-10 text-center text-xs text-[#7aaa92]">
											No active orders recorded yet. Explore peer offers or post
											your own.
										</div>
									) : (
										transactions.slice(0, 4).map((tx) => {
											const isUsdc = true;
											return (
												<div
													key={tx.id}
													className="p-3.5 rounded-2xl bg-[#fbfdfc] border border-[#eef2ee] hover:border-[#d1e8dc] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
												>
													<div className="flex items-center gap-3">
														<div className="w-10 h-10 rounded-full bg-[#e2f5ec] text-[#1a9e5c] flex items-center justify-center font-bold text-xs shrink-0">
															{isUsdc ? "$" : "₦"}
														</div>
														<div>
															<div className="font-semibold text-[#0d2b1e] flex items-center gap-1.5">
																<span>USDC</span>
																<span className="text-[#7aaa92] font-mono text-[11px]">
																	#{tx.tradeId}
																</span>
															</div>
															<div className="text-[11px] text-[#7aaa92]">
																{tx.counterparty}
															</div>
														</div>
													</div>

													<div className="flex items-center gap-4">
														<div>
															<div className="font-bold text-[#0d2b1e] font-mono">
																{tx.ngnAmount}
															</div>
															<div className="text-[11px] text-[#7aaa92] font-mono">
																{tx.usdcAmount} USDC
															</div>
														</div>

														<div className="hidden sm:block text-[11px] text-[#3d6b55] font-medium">
															{tx.bankName} Direct
														</div>

														<span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
															{tx.status === "completed"
																? "Settled"
																: tx.status === "escrow"
																	? "Valid Match"
																	: tx.status}
														</span>

														<div className="shrink-0">
															{tx.role === "buyer" &&
															tx.lifecycleState === "AWAITING_PAYMENT" ? (
																<Link
																	href={`/bank-checkout?tradeId=${encodeURIComponent(
																		tx.tradeId,
																	)}&bank=${encodeURIComponent(
																		tx.bankName,
																	)}&amountNgn=${encodeURIComponent(
																		tx.ngnAmount.replace(/[^0-9]/g, ""),
																	)}&amountUsdc=${encodeURIComponent(
																		tx.usdcAmount,
																	)}&accountNo=${encodeURIComponent(
																		tx.sellerAccountNumber || "",
																	)}&returnTo=/dashboard`}
																	className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#1a9e5c] text-white hover:bg-[#15854c] transition-all shadow-sm"
																>
																	Pay
																</Link>
															) : tx.role === "seller" &&
															  (tx.paymentState === "CONFIRMED" ||
																	tx.lifecycleState === "PAYMENT_CONFIRMED" ||
																	tx.lifecycleState ===
																		"SELLER_PAYOUT_CONFIRMED") ? (
																<button
																	onClick={() =>
																		void handleReleaseEscrowOnChain(tx)
																	}
																	disabled={releasingTradeId === tx.tradeId}
																	className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#0d2b1e] text-white hover:bg-[#1a9e5c] transition-all disabled:opacity-60"
																>
																	{releasingTradeId === tx.tradeId
																		? "Releasing..."
																		: "Release"}
																</button>
															) : (
																<Link
																	href={`/bank-checkout?tradeId=${encodeURIComponent(
																		tx.tradeId,
																	)}&bank=${encodeURIComponent(
																		tx.bankName,
																	)}&amountNgn=${encodeURIComponent(
																		tx.ngnAmount.replace(/[^0-9]/g, ""),
																	)}&amountUsdc=${encodeURIComponent(
																		tx.usdcAmount,
																	)}&accountNo=${encodeURIComponent(
																		tx.sellerAccountNumber || "",
																	)}&returnTo=/dashboard`}
																	className="rounded-full px-3.5 py-1.5 text-xs font-semibold border border-[#d1e8dc] text-[#0d2b1e] hover:bg-[#f0f7f3] transition-all"
																>
																	View
																</Link>
															)}
														</div>
													</div>
												</div>
											);
										})
									)}
								</div>
							</div>

							{/* Right 35% Column: Performance & Spread Edge */}
							<div className="lg:col-span-4 space-y-4">
								{/* Performance Card */}
								<div className="rounded-[28px] relative overflow-hidden h-[240px] p-5 flex flex-col justify-between shadow-sm bg-gradient-to-br from-[#0d2b1e] via-[#145a3a] to-[#082015] text-white">
									<div>
										<span className="text-lg font-bold text-white tracking-tight block">
											Performance
										</span>
										<div className="flex items-center gap-1.5 text-xs text-white/80 mt-1">
											<ShieldCheck size={14} className="text-[#4dd68c]" />
											<span>
												Verified P2P Merchant (@{username || "trader"})
											</span>
										</div>
									</div>

									<div className="rounded-full bg-black/40 backdrop-blur-md px-4 py-2 border border-white/20 text-white flex items-center justify-between text-xs">
										<div className="flex items-center gap-1.5">
											<div className="w-3.5 h-3.5 rounded-full bg-[#1a9e5c] text-white flex items-center justify-center text-[9px] font-bold">
												✓
											</div>
											<span className="font-semibold text-white/95">99.4%</span>
											<span className="text-white/70 text-[10px]">
												30D Completion
											</span>
										</div>
										<div className="flex items-center gap-1.5">
											<Star
												size={12}
												className="text-amber-400 fill-amber-400"
											/>
											<span className="font-semibold text-white/95">99.8%</span>
											<span className="text-white/70 text-[10px]">
												Positive
											</span>
										</div>
									</div>
								</div>

								{/* Spread Edge Card */}
								<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-xs font-semibold text-[#0d2b1e]">
											Spread Edge
										</span>
										<span className="rounded-full bg-[#f0f7f3] border border-[#d1e8dc] px-3 py-0.5 text-[10px] font-semibold text-[#1a9e5c]">
											Auto-Peg ✓
										</span>
									</div>

									{/* Slider Track with Dots */}
									<div className="relative pt-2 pb-1">
										<div className="h-1.5 w-full bg-[#eef4f0] rounded-full relative">
											<div className="h-full bg-[#1a9e5c] rounded-full w-[65%]" />
											<div className="absolute top-1/2 -translate-y-1/2 left-[25%] w-3 h-3 rounded-full bg-[#1a9e5c] border-2 border-white" />
											<div className="absolute top-1/2 -translate-y-1/2 left-[65%] w-3.5 h-3.5 rounded-full bg-[#0d2b1e] border-2 border-white shadow-sm" />
										</div>
										<div className="flex items-center justify-between text-[10px] text-[#7aaa92] pt-2">
											<span>Our Ad +₦0.00</span>
											<span>Rank 2: +₦5.00</span>
											<span>Rank 1: Best Rate</span>
										</div>
									</div>

									<div className="flex items-center justify-between pt-1">
										<div className="flex items-baseline gap-2">
											<span className="font-mono text-lg font-bold text-[#0d2b1e]">
												₦ {RATE.toLocaleString("en-NG")}.00
											</span>
											<span className="text-[10px] font-bold text-[#1a9e5c]">
												+0.85%
											</span>
										</div>
										<span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f7ee] text-[#1a9e5c]">
											Rank 1
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Row 3: Bottom Row */}
						<div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
							{/* Left: Asset Inventory */}
							<div className="lg:col-span-6 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-bold text-[#0d2b1e]">
										Asset Inventory
									</h3>
									<button
										onClick={() => setActiveTab("escrows")}
										className="w-7 h-7 rounded-full bg-[#f4f7f5] flex items-center justify-center text-[#7aaa92] hover:text-[#0d2b1e]"
									>
										<ArrowUpRight size={13} />
									</button>
								</div>

								<div className="space-y-2 pt-1">
									<div className="flex h-3 w-full rounded-full overflow-hidden bg-[#eef4f0] gap-1">
										<div
											className="h-full bg-[#0d2b1e] rounded-full"
											style={{ width: "35%" }}
										/>
										<div
											className="h-full bg-[#1a9e5c] rounded-full"
											style={{ width: "45%" }}
										/>
										<div
											className="h-full bg-[#4dd68c] rounded-full"
											style={{ width: "20%" }}
										/>
									</div>
									<div className="flex items-center justify-between text-[11px] text-[#7aaa92]">
										<span>Escrow (35%)</span>
										<span>Wallet (45%)</span>
										<span>Vault (20%)</span>
									</div>
								</div>

								<div className="flex items-center justify-between pt-2">
									<span className="text-xs text-[#7aaa92]">
										Dynamic threshold &lt; 15%
									</span>
									<button
										onClick={() => setActiveTab("create")}
										className="rounded-full px-4 py-1.5 text-xs font-semibold bg-[#0d2b1e] text-white hover:bg-[#1a9e5c] transition-all"
									>
										Rebalance
									</button>
								</div>
							</div>

							{/* Right: My Active Offers */}
							<div className="lg:col-span-6 rounded-[28px] border border-[#e5ebe7] bg-white p-5 shadow-sm space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-bold text-[#0d2b1e]">
										My Active Offers
									</h3>
									<span className="text-xs font-mono text-[#7aaa92]">
										{
											peerOffers.filter(
												(o) =>
													o.peerAddress.toLowerCase() ===
													address?.toLowerCase(),
											).length
										}
										/10 Active
									</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
									<div className="p-3.5 rounded-2xl bg-[#f4fbf7] border border-[#d1e8dc] space-y-1.5">
										<div className="flex items-center justify-between">
											<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#1a9e5c] border border-[#d1e8dc]">
												BUY USDC #9901
											</span>
											<span className="text-[10px] font-mono text-[#7aaa92]">
												Instant
											</span>
										</div>
										<div className="text-base font-bold text-[#0d2b1e] font-mono">
											₦ 1,550.00
										</div>
										<div className="text-[10px] text-[#7aaa92]">
											GTBank, OPay, Kuda
										</div>
									</div>

									<div className="p-3.5 rounded-2xl bg-[#fdfaf4] border border-[#edd5be] space-y-1.5">
										<div className="flex items-center justify-between">
											<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-amber-800 border border-[#edd5be]">
												SELL USDC #9902
											</span>
											<span className="text-[10px] font-mono text-[#7aaa92]">
												Auto-Peg
											</span>
										</div>
										<div className="text-base font-bold text-[#0d2b1e] font-mono">
											₦ 1,545.00
										</div>
										<div className="text-[10px] text-[#7aaa92]">
											Zenith, Access Bank
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* TAB 2: ESCROWS */}
				{activeTab === "escrows" && (
					<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="text-base font-bold text-[#0d2b1e]">
									Escrow Positions
								</h2>
								<p className="text-xs text-[#7aaa92]">
									Active trades secured inside Arc smart contract awaiting fiat
									confirmation
								</p>
							</div>
							<span className="text-xs font-mono font-semibold text-[#1a9e5c]">
								{activeEscrows.length} Active Positions
							</span>
						</div>

						{activeEscrows.length === 0 ? (
							<div className="p-10 text-center rounded-[24px] bg-[#fbfdfc] border border-[#e5ebe7] space-y-2">
								<p className="text-xs text-[#7aaa92]">
									No open escrow trades found.
								</p>
								<button
									onClick={() => setActiveTab("peers")}
									className="rounded-full px-5 py-2 bg-[#1a9e5c] text-white text-xs font-semibold hover:bg-[#15854c] transition-all"
								>
									Explore Peer Markets
								</button>
							</div>
						) : (
							<div className="space-y-3">
								{activeEscrows.map((trade) => (
									<div
										key={trade.id}
										className="p-4 rounded-2xl border border-[#d1e8dc] bg-[#fbfdfc] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
									>
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<span className="font-mono font-bold text-[#0d2b1e]">
													Trade #{trade.tradeId}
												</span>
												<span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200">
													{trade.lifecycleState ?? "AWAITING_PAYMENT"}
												</span>
												<span className="text-[#7aaa92]">
													· {trade.bankName}
												</span>
											</div>
											<div className="text-[11px] text-[#7aaa92]">
												Counterparty: {trade.counterparty}
											</div>
											<div className="font-mono font-semibold text-[#0d2b1e]">
												{trade.usdcAmount} USDC · {trade.ngnAmount}
											</div>
										</div>

										<div className="flex flex-wrap items-center gap-2">
											<Link
												href={`/bank-checkout?tradeId=${encodeURIComponent(
													trade.tradeId,
												)}&bank=${encodeURIComponent(
													trade.bankName,
												)}&amountNgn=${encodeURIComponent(
													trade.ngnAmount.replace(/[^0-9]/g, ""),
												)}&amountUsdc=${encodeURIComponent(
													trade.usdcAmount,
												)}&accountNo=${encodeURIComponent(
													trade.sellerAccountNumber || "",
												)}&returnTo=/dashboard`}
												className="rounded-full px-4 py-2 text-xs font-semibold bg-[#1a9e5c] text-white hover:bg-[#15854c] transition-all shadow-sm"
											>
												{trade.role === "buyer"
													? "Proceed to Payment"
													: "Settlement Portal"}
											</Link>

											{trade.role === "seller" &&
											(trade.paymentState === "CONFIRMED" ||
												trade.lifecycleState === "PAYMENT_CONFIRMED" ||
												trade.lifecycleState === "SELLER_PAYOUT_CONFIRMED") ? (
												<button
													onClick={() => void handleReleaseEscrowOnChain(trade)}
													disabled={releasingTradeId === trade.tradeId}
													className="rounded-full px-4 py-2 text-xs font-semibold text-white bg-[#0d2b1e] hover:bg-[#1a9e5c] transition-all disabled:opacity-60"
												>
													{releasingTradeId === trade.tradeId
														? "Releasing..."
														: "Release USDC"}
												</button>
											) : (
												<button
													onClick={() => void handleVerifyAndRelease(trade)}
													disabled={verifyingTradeId === trade.tradeId}
													className="rounded-full px-4 py-2 text-xs font-semibold text-[#0d2b1e] border border-[#d1e8dc] hover:bg-[#f0f7f3] transition-all disabled:opacity-60"
												>
													{verifyingTradeId === trade.tradeId
														? "Verifying Proof..."
														: "Verify & Release"}
												</button>
											)}

											{(trade.lifecycleState === "AWAITING_PAYMENT" ||
												trade.lifecycleState === "OPEN" ||
												trade.status === "escrow") && (
												<button
													onClick={() => void handleCancelTrade(trade.tradeId)}
													disabled={cancellingTradeId === trade.tradeId}
													className="rounded-full px-3.5 py-2 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-all disabled:opacity-60"
												>
													{cancellingTradeId === trade.tradeId
														? "Cancelling..."
														: "Cancel"}
												</button>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* TAB 3: TRANSACTIONS / ORDERS */}
				{activeTab === "transactions" && (
					<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm space-y-4">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-1.5">
								{(["all", "buy", "sell", "release"] as const).map((t) => (
									<button
										key={t}
										onClick={() => setTxTypeFilter(t)}
										className={cn(
											"rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all capitalize",
											txTypeFilter === t
												? "bg-[#0d2b1e] text-white"
												: "bg-[#f0f7f3] text-[#3d6b55] hover:bg-[#e4f2eb]",
										)}
									>
										{t}
									</button>
								))}
							</div>

							<div className="relative w-full sm:w-64">
								<Search
									size={13}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7aaa92]"
								/>
								<input
									type="text"
									value={txSearch}
									onChange={(e) => setTxSearch(e.target.value)}
									placeholder="Search by ID or bank..."
									className="w-full pl-8 pr-3 py-2 rounded-full border border-[#d1e8dc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c]"
								/>
							</div>
						</div>

						<div className="overflow-x-auto">
							<table className="w-full text-xs text-left">
								<thead>
									<tr className="border-b border-[#eef2ee] text-[#7aaa92]">
										<th className="py-3 px-4 font-medium">Trade</th>
										<th className="py-3 px-4 font-medium">Type</th>
										<th className="py-3 px-4 font-medium">Counterparty</th>
										<th className="py-3 px-4 font-medium">Rail</th>
										<th className="py-3 px-4 font-medium text-right">Amount</th>
										<th className="py-3 px-4 font-medium text-center">
											Status
										</th>
										<th className="py-3 px-4 font-medium text-right">
											Explorer
										</th>
										<th className="py-3 px-4 font-medium text-right">Action</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[#eef2ee]">
									{filteredTransactions.length === 0 ? (
										<tr>
											<td
												colSpan={8}
												className="py-8 text-center text-[#7aaa92]"
											>
												No transactions found matching your filter criteria.
											</td>
										</tr>
									) : (
										filteredTransactions.map((tx) => (
											<tr
												key={tx.id}
												className="hover:bg-[#fbfdfc] transition-colors"
											>
												<td className="py-3 px-4 font-mono font-bold text-[#0d2b1e]">
													#{tx.tradeId}
												</td>
												<td className="py-3 px-4 capitalize font-semibold text-[#3d6b55]">
													{tx.type}
												</td>
												<td className="py-3 px-4 text-[#0d2b1e]">
													<div>{tx.counterparty}</div>
													<div className="text-[10px] text-[#7aaa92] font-mono">
														{tx.counterpartyAddress.slice(0, 6)}...
														{tx.counterpartyAddress.slice(-4)}
													</div>
												</td>
												<td className="py-3 px-4 text-[#0d2b1e]">
													{tx.bankName}
												</td>
												<td className="py-3 px-4 font-mono font-bold text-right text-[#0d2b1e]">
													<div>{tx.usdcAmount} USDC</div>
													<div className="text-[10px] text-[#7aaa92]">
														{tx.ngnAmount}
													</div>
												</td>
												<td className="py-3 px-4 text-center">
													<span
														className={cn(
															"px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize",
															tx.status === "completed" &&
																"bg-green-50 text-green-700",
															tx.status === "escrow" &&
																"bg-amber-50 text-amber-700",
															tx.status === "disputed" &&
																"bg-red-50 text-red-700",
															tx.status === "pending" &&
																"bg-zinc-100 text-zinc-700",
														)}
													>
														{tx.status}
													</span>
												</td>
												<td className="py-3 px-4 text-right">
													{tx.txHash &&
													tx.txHash !== "0x0" &&
													!tx.txHash.startsWith(
														"0x0000000000000000000000000000000000000000000000000000000000000000",
													) &&
													!tx.txHash.startsWith("0xaaaaaaaa") ? (
														<a
															href={ARCSCAN_TX(tx.txHash)}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex items-center gap-1 font-mono text-[11px] text-[#1a9e5c] hover:underline"
														>
															<span>
																{tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
															</span>
															<ArrowUpRight size={11} />
														</a>
													) : (
														<span className="text-[#7aaa92] text-[11px]">
															—
														</span>
													)}
												</td>
												<td className="py-3 px-4 text-right">
													<div className="flex items-center justify-end gap-1.5">
														{tx.role === "buyer" &&
															tx.lifecycleState === "AWAITING_PAYMENT" && (
																<Link
																	href={`/bank-checkout?tradeId=${encodeURIComponent(
																		tx.tradeId,
																	)}&returnTo=/dashboard`}
																	className="rounded-full px-3 py-1 text-[11px] font-semibold bg-[#1a9e5c] text-white hover:bg-[#15854c]"
																>
																	Pay
																</Link>
															)}
														{(tx.status === "escrow" ||
															tx.status === "pending" ||
															tx.lifecycleState === "AWAITING_PAYMENT" ||
															tx.lifecycleState === "OPEN") &&
															tx.lifecycleState !== "COMPLETED" && (
																<button
																	onClick={() =>
																		void handleCancelTrade(tx.tradeId)
																	}
																	disabled={cancellingTradeId === tx.tradeId}
																	className="rounded-full px-2.5 py-1 text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
																>
																	Cancel
																</button>
															)}
													</div>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{/* TAB 4: PEER MARKET */}
				{activeTab === "peers" && (
					<div className="rounded-[28px] border border-[#e5ebe7] bg-white p-6 shadow-sm space-y-4">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								{(["all", "sell", "buy"] as const).map((side) => (
									<button
										key={side}
										onClick={() => setPeerSideFilter(side)}
										className={cn(
											"rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
											peerSideFilter === side
												? "bg-[#0d2b1e] text-white"
												: "bg-[#f0f7f3] text-[#3d6b55] hover:bg-[#e4f2eb]",
										)}
									>
										{side === "all"
											? "All"
											: side === "sell"
												? "Buy USDC"
												: "Sell USDC"}
									</button>
								))}

								<BankSearchSelect
									value={peerBankFilter}
									onChange={setPeerBankFilter}
									allowAll
									allLabel="All Banks"
									compact
								/>
							</div>

							<div className="relative w-full sm:w-64">
								<Search
									size={13}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7aaa92]"
								/>
								<input
									type="text"
									value={peerSearch}
									onChange={(e) => setPeerSearch(e.target.value)}
									placeholder="Filter peer or bank..."
									className="w-full pl-8 pr-3 py-2 rounded-full border border-[#d1e8dc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c]"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{filteredPeerOffers.map((offer) => {
								const maxAvail = parseNumericUsdc(offer.availableUsdc);
								const customStr =
									partialAmountsByOffer[offer.tradeId] ?? offer.availableUsdc;
								const customNumeric = parseNumericUsdc(customStr);
								const isOwner =
									address &&
									offer.peerAddress.toLowerCase() === address.toLowerCase();

								return (
									<div
										key={offer.tradeId}
										className="p-5 rounded-[24px] border border-[#e5ebe7] bg-[#fbfdfc] flex flex-col justify-between gap-3 text-xs shadow-sm hover:border-[#1a9e5c]/40 transition-all"
									>
										<div className="flex items-start justify-between">
											<div>
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-bold text-[#0d2b1e]">
														{offer.peerHandle}
													</span>
													<span
														className={cn(
															"px-2 py-0.5 rounded-full text-[10px] font-bold",
															offer.side === "sell"
																? "bg-green-50 text-green-700"
																: "bg-blue-50 text-blue-700",
														)}
													>
														{offer.side === "sell"
															? "Selling USDC"
															: "Buying USDC"}
													</span>
													{offer.sellerBusy && (
														<span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
															Slot Busy · Queue #{(offer.queueDepth ?? 0) + 1}
														</span>
													)}
												</div>
												<div className="text-[11px] text-[#7aaa92] mt-0.5">
													{offer.bankName} · {offer.completionRate} completion
												</div>
											</div>

											<div className="text-right">
												<div className="text-[10px] text-[#7aaa92]">Rate</div>
												<div className="font-mono font-bold text-sm text-[#0d2b1e]">
													₦{offer.rateNgn.toLocaleString("en-NG")}
												</div>
											</div>
										</div>

										<div className="p-3 rounded-2xl bg-white border border-[#e5ebe7] flex items-center justify-between text-xs">
											<div>
												<div className="text-[10px] text-[#7aaa92]">
													Available Liquidity
												</div>
												<div className="font-mono font-bold text-[#0d2b1e]">
													{offer.availableUsdc} USDC
												</div>
											</div>
										</div>

										{!isOwner && (
											<div className="space-y-1.5">
												<div className="flex items-center justify-between text-[10px] text-[#7aaa92]">
													<span>Order Amount (USDC)</span>
													<div className="flex items-center gap-1">
														{[0.25, 0.5, 1].map((pct) => (
															<button
																key={pct}
																type="button"
																onClick={() =>
																	setPartialAmountsByOffer((prev) => ({
																		...prev,
																		[offer.tradeId]: (
																			Math.round(maxAvail * pct * 100) / 100
																		).toFixed(2),
																	}))
																}
																className="px-2 py-0.5 rounded-full border border-[#d1e8dc] bg-white text-[#3d6b55] hover:border-[#1a9e5c] font-mono text-[10px]"
															>
																{pct === 1 ? "MAX" : `${pct * 100}%`}
															</button>
														))}
													</div>
												</div>
												<div className="relative">
													<input
														type="text"
														value={customStr}
														onChange={(e) =>
															setPartialAmountsByOffer((prev) => ({
																...prev,
																[offer.tradeId]: e.target.value,
															}))
														}
														className="w-full px-3.5 py-2 rounded-full border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
														placeholder={offer.availableUsdc}
													/>
													<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#7aaa92]">
														≈ ₦
														{Math.round(
															customNumeric * offer.rateNgn,
														).toLocaleString("en-NG")}
													</span>
												</div>
											</div>
										)}

										<div className="flex items-center justify-between pt-1">
											<span className="text-[11px] font-mono text-[#7aaa92]">
												Offer #{offer.tradeId}
											</span>
											{isOwner ? (
												<span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
													Your Active Offer
												</span>
											) : (
												<button
													onClick={() => void handleTakePeerOffer(offer)}
													disabled={joiningTradeId === offer.tradeId}
													className="rounded-full px-5 py-2 text-xs font-semibold text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-sm disabled:opacity-60"
												>
													{joiningTradeId === offer.tradeId
														? "Allocating..."
														: offer.sellerBusy
															? "Join Seller Queue"
															: offer.side === "sell"
																? "Buy USDC"
																: "Take Offer"}
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* TAB 5: POST OFFER */}
				{activeTab === "create" && (
					<div className="max-w-md mx-auto rounded-[32px] border border-[#e5ebe7] bg-white p-7 space-y-5 shadow-xl">
						<div>
							<h2 className="text-base font-bold text-[#0d2b1e]">
								Create Peer Offer
							</h2>
							<p className="text-xs text-[#7aaa92] mt-0.5">
								Lock USDC into Arc Escrow and publish an active offer for NGN
								settlement.
							</p>
						</div>

						<form
							onSubmit={(e) => void handleCreateOffer(e)}
							className="space-y-4"
						>
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="block text-xs font-semibold text-[#0d2b1e]">
										USDC Amount
									</label>
									<span className="text-[11px] font-mono text-[#1a9e5c]">
										1 USDC = ₦{RATE.toLocaleString("en-NG")}
									</span>
								</div>
								<div className="relative">
									<input
										type="text"
										value={offerUsdc}
										onChange={(e) => setOfferUsdc(e.target.value)}
										className="w-full px-4 py-2.5 rounded-2xl border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
										placeholder="Enter USDC amount"
									/>
									<span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[#7aaa92]">
										{offerUsdc.trim()
											? `≈ ₦${Math.round(parseNumericUsdc(offerUsdc) * RATE).toLocaleString("en-NG")}`
											: `1 USDC = ₦${RATE.toLocaleString("en-NG")}`}
									</span>
								</div>
								<p className="mt-1 text-[11px] text-[#7aaa92]">
									1 USDC = ₦{RATE.toLocaleString("en-NG")}
								</p>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-xs font-semibold text-[#0d2b1e] mb-1">
										Settlement Bank
									</label>
									<BankSearchSelect
										value={offerBank}
										onChange={setOfferBank}
										placeholder="Select settlement bank..."
									/>
								</div>

								<div>
									<label className="block text-xs font-semibold text-[#0d2b1e] mb-1">
										Account Number
									</label>
									<input
										type="text"
										maxLength={10}
										value={offerAccountNo}
										onChange={(e) =>
											setOfferAccountNo(e.target.value.replace(/\D/g, ""))
										}
										placeholder="0123456789"
										className="w-full px-4 py-2.5 rounded-2xl border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
									/>
								</div>
							</div>

							<div className="p-3.5 rounded-2xl bg-[#fbfdfc] border border-[#d1e8dc] text-xs space-y-1">
								<div className="flex justify-between text-[#7aaa92]">
									<span>Platform Peg</span>
									<span className="font-mono font-bold text-[#0d2b1e]">
										1 USDC = ₦{RATE.toLocaleString("en-NG")}
									</span>
								</div>
							</div>

							<button
								type="submit"
								disabled={creatingOffer}
								className="w-full py-3 rounded-full font-semibold text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-all shadow-md disabled:opacity-60"
							>
								{creatingOffer
									? "Publishing on Arc Testnet..."
									: "Lock USDC & Publish Offer"}
							</button>
						</form>
					</div>
				)}
			</main>
		</div>
	);
}
