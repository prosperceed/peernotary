"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
	LayoutDashboard,
	Layers,
	Receipt,
	Users,
	PlusCircle,
	AlertCircle,
	CheckCircle,
	Wallet,
	Lock,
	RefreshCw,
} from "lucide-react";
import {
	useAccount,
	useBalance,
	useConnect,
	useReadContract,
	useSignMessage,
	useSwitchChain,
} from "wagmi";
import { formatUnits } from "viem";
import { useEscrow } from "@/hooks/useEscrow";
import {
	arcTestnet,
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
import { useMonierateRate } from "@/hooks/useMonierateRate";
import type {
	PeerTradeOffer,
	QueueEntryItem,
	TxCategory,
	TxStatus,
	UserTransaction,
	UserTrustSummary,
} from "@/types";
import {
	DashboardSkeleton,
	DashboardSidebar,
	DashboardHeader,
	DashboardKpiCards,
	OverviewTab,
	EscrowsTab,
	TransactionsTab,
	PeersTab,
	CreateOfferTab,
	DossierModal,
	UsernameModal,
	type DashboardTab,
	type NavItem,
	type DashboardStats,
} from "./user-dashboard";

export { DashboardSkeleton };

function parseNumericUsdc(val: string): number {
	return parseFloat(val.replace(/,/g, "")) || 0;
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
	const [trustSummary, setTrustSummary] = useState<UserTrustSummary | null>(null);
	const [queueEntries, setQueueEntries] = useState<QueueEntryItem[]>([]);
	const [partialAmountsByOffer, setPartialAmountsByOffer] = useState<
		Record<string, string>
	>({});
	const [loadingData, setLoadingData] = useState(true);
	const [cancellingTradeId, setCancellingTradeId] = useState<string | null>(null);
	const [actionFeedback, setActionFeedback] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const previousAddressRef = useRef<string | undefined>(undefined);

	const { rate: monierateRate } = useMonierateRate();
	const activeRate = monierateRate || RATE;

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

	const [peerSideFilter, setPeerSideFilter] = useState<"all" | "buy" | "sell">("all");
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

	const activeEscrows = useMemo(
		() => transactions.filter((t) => t.status === "escrow"),
		[transactions],
	);

	const stats: DashboardStats = useMemo(() => {
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
			walletNgn: Math.round(walletUsdc * activeRate),
			lockedEscrowUsdc,
			totalVolumeUsdc,
			totalVolumeNgn: Math.round(totalVolumeUsdc * activeRate),
			completedCount,
		};
	}, [transactions, walletUsdc, activeRate]);

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
			if (!res.ok) throw new Error(data.error || "Failed to request peer order.");

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
					)}&bank=${encodeURIComponent(offer.bankName)}&returnTo=/dashboard`,
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
		if (numeric * activeRate < 1) {
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
					rateNgn: activeRate,
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
			if (!res.ok) throw new Error(data.error || "Failed to publish peer trade offer.");

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
				text: formatUserFriendlyWalletError(err, "Could not create trade offer."),
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
				Math.round(parseNumericUsdc(trade.usdcAmount) * activeRate);

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
				throw new Error(relData.error || "Failed to confirm release on server.");
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
			if (txStatusFilter !== "all" && tx.status !== txStatusFilter) return false;
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
			if (peerSideFilter !== "all" && offer.side !== peerSideFilter) return false;
			if (peerBankFilter !== "all") {
				const pbf = peerBankFilter.toLowerCase();
				const obn = offer.bankName.toLowerCase();
				if (obn !== pbf && !obn.includes(pbf) && !pbf.includes(obn)) return false;
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

	const navItems: NavItem[] = [
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
			{/* Left Dock / Mobile Navigation */}
			<DashboardSidebar
				navItems={navItems}
				activeTab={activeTab}
				setActiveTab={setActiveTab}
				loadingData={loadingData}
				onSync={() => {
					void fetchDashboardData();
					void refetchNative();
					void refetchErc20();
				}}
				username={username}
				address={address}
				showDossier={showDossier}
				setShowDossier={setShowDossier}
				mobileMenuOpen={mobileMenuOpen}
				setMobileMenuOpen={setMobileMenuOpen}
			/>

			{/* Main Console Content Body */}
			<main className="flex-1 min-w-0 space-y-6">
				{/* Top Header Row */}
				<DashboardHeader
					username={username}
					showDossier={showDossier}
					setShowDossier={setShowDossier}
					onOpenUsernameModal={() => setShowUsernameModal(true)}
					onOpenPostOffer={() => setActiveTab("create")}
				/>

				{/* Dossier Drawer Card */}
				{showDossier && (
					<DossierModal
						trustSummary={trustSummary}
						onClose={() => setShowDossier(false)}
					/>
				)}

				{/* Set Username Modal */}
				{showUsernameModal && (
					<UsernameModal
						usernameInput={usernameInput}
						setUsernameInput={setUsernameInput}
						usernameError={usernameError}
						usernameBusy={usernameBusy}
						onSubmit={handleSaveUsername}
						onClose={() => {
							setShowUsernameModal(false);
							setUsernameError(null);
						}}
					/>
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

				{/* Top 4 KPI Metric Cards */}
				<DashboardKpiCards
					stats={stats}
					activeEscrowsCount={activeEscrows.length}
					onReroute={() => setActiveTab("peers")}
				/>

				{/* Tab Compartments */}
				{activeTab === "overview" && (
					<OverviewTab
						transactions={transactions}
						peerOffers={peerOffers}
						address={address}
						username={username}
						releasingTradeId={releasingTradeId}
						onReleaseEscrow={(tx) => void handleReleaseEscrowOnChain(tx)}
						onViewAllTransactions={() => setActiveTab("transactions")}
						onViewEscrows={() => setActiveTab("escrows")}
						onRebalance={() => setActiveTab("create")}
					/>
				)}

				{activeTab === "escrows" && (
					<EscrowsTab
						activeEscrows={activeEscrows}
						releasingTradeId={releasingTradeId}
						verifyingTradeId={verifyingTradeId}
						cancellingTradeId={cancellingTradeId}
						onReleaseEscrow={(tx) => void handleReleaseEscrowOnChain(tx)}
						onVerifyAndRelease={(tx) => void handleVerifyAndRelease(tx)}
						onCancelTrade={(tid) => void handleCancelTrade(tid)}
						onExplorePeers={() => setActiveTab("peers")}
					/>
				)}

				{activeTab === "transactions" && (
					<TransactionsTab
						transactions={filteredTransactions}
						txTypeFilter={txTypeFilter}
						setTxTypeFilter={setTxTypeFilter}
						txSearch={txSearch}
						setTxSearch={setTxSearch}
						cancellingTradeId={cancellingTradeId}
						onCancelTrade={(tid) => void handleCancelTrade(tid)}
					/>
				)}

				{activeTab === "peers" && (
					<PeersTab
						peerOffers={filteredPeerOffers}
						peerSideFilter={peerSideFilter}
						setPeerSideFilter={setPeerSideFilter}
						peerBankFilter={peerBankFilter}
						setPeerBankFilter={setPeerBankFilter}
						peerSearch={peerSearch}
						setPeerSearch={setPeerSearch}
						partialAmountsByOffer={partialAmountsByOffer}
						setPartialAmountsByOffer={setPartialAmountsByOffer}
						address={address}
						joiningTradeId={joiningTradeId}
						onTakePeerOffer={(offer) => void handleTakePeerOffer(offer)}
					/>
				)}

				{activeTab === "create" && (
					<CreateOfferTab
						offerUsdc={offerUsdc}
						setOfferUsdc={setOfferUsdc}
						offerBank={offerBank}
						setOfferBank={setOfferBank}
						offerAccountNo={offerAccountNo}
						setOfferAccountNo={setOfferAccountNo}
						creatingOffer={creatingOffer}
						onSubmit={(e) => void handleCreateOffer(e)}
					/>
				)}
			</main>
		</div>
	);
}
