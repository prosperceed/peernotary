"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
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
import { useEscrow } from "@/hooks/useEscrow";
import {
	arcTestnet,
	ARCSCAN_ADDR,
	ARCSCAN_TX,
	ESCROW_ADDRESS,
	USDC_ABI,
	USDC_ADDRESS,
	formatUsdc,
	signWalletMessage,
	switchToArcTestnet,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";
import { cn, RATE } from "@/lib/utils";
import type {
	PeerTradeOffer,
	TxCategory,
	TxStatus,
	UserTransaction,
} from "@/types";

type DashboardTab = "overview" | "escrows" | "transactions" | "peers" | "create";

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

export default function UserDashboard() {
	const { address, chainId, isConnected } = useAccount();
	const { connectAsync, connectors } = useConnect();
	const { signMessageAsync } = useSignMessage();
	const { switchChainAsync } = useSwitchChain();
	const escrow = useEscrow();

	const [checkingSession, setCheckingSession] = useState(true);
	const [authenticated, setAuthenticated] = useState(false);
	const [authBusy, setAuthBusy] = useState(false);
	const [authError, setAuthError] = useState<string | null>(null);

	// Optional username onboarding state
	const [username, setUsername] = useState<string | null>(null);
	const [onboardingCompleted, setOnboardingCompleted] = useState(true);
	const [usernameInput, setUsernameInput] = useState("");
	const [usernameBusy, setUsernameBusy] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);

	const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	const [transactions, setTransactions] = useState<UserTransaction[]>([]);
	const [peerOffers, setPeerOffers] = useState<PeerTradeOffer[]>([]);
	const [loadingData, setLoadingData] = useState(false);
	const [actionFeedback, setActionFeedback] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [copiedAddr, setCopiedAddr] = useState(false);
	const previousAddressRef = useRef<string | undefined>(undefined);

	// Immediately invalidate stale session and wipe previous wallet data on address change
	useEffect(() => {
		const current = address?.toLowerCase();
		if (previousAddressRef.current && previousAddressRef.current !== current) {
			setAuthenticated(false);
			setUsername(null);
			setOnboardingCompleted(true);
			setTransactions([]);
			setPeerOffers([]);
			setActionFeedback(null);
			setAuthError(null);
			void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
		}
		previousAddressRef.current = current;
	}, [address]);

	// Filters for Transactions tab
	const [txTypeFilter, setTxTypeFilter] = useState<TxCategory | "all">("all");
	const [txStatusFilter, setTxStatusFilter] = useState<TxStatus | "all">("all");
	const [txSearch, setTxSearch] = useState("");

	// Filters for Peer Market tab
	const [peerSideFilter, setPeerSideFilter] = useState<"all" | "buy" | "sell">("all");
	const [peerBankFilter, setPeerBankFilter] = useState<string>("all");
	const [peerSearch, setPeerSearch] = useState("");
	const [joiningTradeId, setJoiningTradeId] = useState<string | null>(null);
	const [verifyingTradeId, setVerifyingTradeId] = useState<string | null>(null);

	// Create Offer form state
	const [offerSide, setOfferSide] = useState<"sell" | "buy">("sell");
	const [offerUsdc, setOfferUsdc] = useState("250.00");
	const [offerBank, setOfferBank] = useState("GTBank");
	const [offerAccountNo, setOfferAccountNo] = useState("");
	const [creatingOffer, setCreatingOffer] = useState(false);

	// Real on-chain balance tracking
	const { data: nativeBalance, refetch: refetchNative } = useBalance({
		address,
		chainId: arcTestnet.id,
	});

	const { data: erc20BalanceRaw, refetch: refetchErc20 } = useReadContract(
		address
			? {
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "balanceOf",
					args: [address],
				}
			: undefined,
	);

	// Track real wallet USDC balance (prioritize ERC-20 contract balance if set; fallback to native USDC)
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
			};

			if (
				data.authenticated &&
				data.user?.walletAddress?.toLowerCase() === address.toLowerCase()
			) {
				setAuthenticated(true);
				setUsername(data.user?.username ?? null);
				setOnboardingCompleted(Boolean(data.user?.onboardingCompleted || data.user?.username));
				setTransactions(data.transactions ?? []);
				setPeerOffers(data.peerOffers ?? []);
			} else {
				setAuthenticated(false);
				setUsername(null);
				setTransactions([]);
				setPeerOffers(data.peerOffers ?? []);
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
		};
		window.addEventListener("peernotary-auth-change", onAuthChange);
		return () => window.removeEventListener("peernotary-auth-change", onAuthChange);
	}, [fetchDashboardData]);

	const authenticateWallet = async (targetAddress: `0x${string}`) => {
		if (chainId && chainId !== arcTestnet.id) {
			setAuthError(`Switch to ${arcTestnet.name} before signing in.`);
			return;
		}
		setAuthBusy(true);
		setAuthError(null);
		try {
			const challengeRes = await fetch("/api/auth/nonce", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address: targetAddress }),
			});
			if (!challengeRes.ok) throw new Error("Could not initialize sign-in request. Please try again.");
			const challenge = (await challengeRes.json()) as { nonce: string; message: string };
			const signature = await signWalletMessage(
				challenge.message,
				targetAddress,
				signMessageAsync,
			);

			const verifyRes = await fetch("/api/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address: targetAddress, nonce: challenge.nonce, signature }),
			});
			if (!verifyRes.ok) throw new Error("Signature verification failed. Please sign in again.");

			window.dispatchEvent(
				new CustomEvent("peernotary-auth-change", { detail: { authenticated: true } }),
			);
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
			const targetConnector = connectors[0] ?? injected();
			const res = await connectAsync({ connector: targetConnector });
			const connectedAddr = res.accounts[0];
			if (connectedAddr) await authenticateWallet(connectedAddr);
		} catch (err) {
			setAuthError(
				formatUserFriendlyWalletError(
					err,
					"Could not connect to your wallet. Please make sure your wallet extension is unlocked.",
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
				formatUserFriendlyWalletError(
					err,
					"Could not switch to Arc Testnet. Please switch networks in your wallet.",
				),
			);
		} finally {
			setAuthBusy(false);
		}
	};

	const copyWalletAddress = () => {
		if (!address) return;
		navigator.clipboard.writeText(address).catch(() => {});
		setCopiedAddr(true);
		setTimeout(() => setCopiedAddr(false), 1500);
	};

	const handleSaveUsername = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!usernameInput.trim()) return;
		setUsernameBusy(true);
		setUsernameError(null);
		try {
			const res = await fetch("/api/user/username", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({ username: usernameInput.trim() }),
			});
			const data = (await res.json()) as {
				error?: string;
				username?: string | null;
				onboardingCompleted?: boolean;
			};
			if (!res.ok) {
				throw new Error(data.error || "Could not save username.");
			}
			setUsername(data.username ?? usernameInput.trim());
			setOnboardingCompleted(true);
			setUsernameInput("");
			setActionFeedback({
				type: "success",
				text: `Username @${data.username ?? usernameInput.trim()} linked to your wallet profile.`,
			});
		} catch (err) {
			setUsernameError(err instanceof Error ? err.message : "Could not save username.");
		} finally {
			setUsernameBusy(false);
		}
	};

	const handleSkipUsername = async () => {
		setUsernameBusy(true);
		setUsernameError(null);
		try {
			const res = await fetch("/api/user/username", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({ skip: true }),
			});
			if (res.ok) {
				setOnboardingCompleted(true);
			}
		} catch {
			setOnboardingCompleted(true);
		} finally {
			setUsernameBusy(false);
		}
	};

	// Active Escrows calculation
	const activeEscrows = useMemo(
		() => transactions.filter((tx) => tx.status === "escrow"),
		[transactions],
	);

	// Trades requiring manual recovery / review
	const tradesRequiringAttention = useMemo(
		() =>
			transactions.filter(
				(tx) =>
					tx.lifecycleState === "PAYOUT_ON_HOLD" ||
					tx.lifecycleState === "RELEASE_ON_HOLD" ||
					tx.lifecycleState === "LATE_PAYMENT_REVIEW" ||
					tx.lifecycleState === "REFUND_PENDING" ||
					tx.status === "disputed",
			),
		[transactions],
	);

	// Portfolio metrics based on real wallet balance and actual transactions
	const stats = useMemo(() => {
		let totalVolumeUsdc = 0;
		let lockedEscrowUsdc = 0;
		let lockedCollateralUsdc = 0;
		let completedCount = 0;

		for (const tx of transactions) {
			const amt = parseNumericUsdc(tx.usdcAmount);
			if (tx.status === "completed" && tx.type !== "collateral") {
				totalVolumeUsdc += amt;
				completedCount += 1;
			}
			if (tx.status === "escrow" && tx.type !== "collateral") {
				lockedEscrowUsdc += amt;
			}
			if (tx.type === "collateral" && tx.status === "escrow") {
				lockedCollateralUsdc += amt;
			}
		}

		return {
			walletUsdc,
			walletNgn: Math.round(walletUsdc * RATE),
			lockedEscrowUsdc,
			lockedCollateralUsdc,
			totalVolumeUsdc,
			totalVolumeNgn: Math.round(totalVolumeUsdc * RATE),
			completedCount,
		};
	}, [transactions, walletUsdc]);

	// Join peer trade with real collateral locking
	const handleTakePeerOffer = async (offer: PeerTradeOffer) => {
		if (address && offer.peerAddress.toLowerCase() === address.toLowerCase()) {
			setActionFeedback({
				type: "error",
				text: "You cannot buy or take an offer that you published.",
			});
			return;
		}

		setJoiningTradeId(offer.tradeId);
		setActionFeedback(null);
		try {
			let txHash: `0x${string}` | undefined;

			// If escrow contract is configured, execute on-chain transaction
			if (ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" && /^\d+$/.test(offer.tradeId)) {
				txHash = await escrow.fundBuyerCollateral({
					tradeId: BigInt(offer.tradeId),
					collateralUsdc: offer.requiredCollateralUsdc,
				});
			}

			// Record state only after successful transaction confirmation
			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "take_offer",
					tradeId: offer.tradeId,
					txHash,
				}),
			});

			if (!res.ok) throw new Error("Failed to record trade joining on server.");
			const data = (await res.json()) as {
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
			};
			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);

			setActionFeedback({
				type: "success",
				text: `Locked ${offer.requiredCollateralUsdc} USDC collateral for Trade #${offer.tradeId}.`,
			});
			setActiveTab("escrows");
			await refetchNative();
			await refetchErc20();
			void fetchDashboardData();
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(err, "Failed to join peer trade."),
			});
		} finally {
			setJoiningTradeId(null);
		}
	};

	// Post trade offer on-chain
	const handleCreateOffer = async (e: React.FormEvent) => {
		e.preventDefault();
		const numeric = parseNumericUsdc(offerUsdc);
		if (numeric < 10) {
			setActionFeedback({ type: "error", text: "Minimum offer size is 10.00 USDC." });
			return;
		}
		if (offerAccountNo.trim().length < 10) {
			setActionFeedback({ type: "error", text: "Enter a valid 10-digit NUBAN bank account number." });
			return;
		}

		setCreatingOffer(true);
		setActionFeedback(null);
		try {
			let txHash: `0x${string}` | undefined;

			if (ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000") {
				txHash = await escrow.initiateTrade({
					cryptoAmountUsdc: numeric.toFixed(2),
					bankName: offerBank,
					accountNo: offerAccountNo.trim(),
				});
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
					usdcAmount: numeric.toFixed(2),
					bankName: offerBank,
					accountNumber: offerAccountNo.trim(),
					txHash,
				}),
			});

			if (!res.ok) throw new Error("Failed to publish peer trade offer.");
			const data = (await res.json()) as {
				offer?: PeerTradeOffer;
				transactions?: UserTransaction[];
				peerOffers?: PeerTradeOffer[];
			};

			if (data.transactions) setTransactions(data.transactions);
			if (data.peerOffers) setPeerOffers(data.peerOffers);

			setOfferAccountNo("");
			setActionFeedback({
				type: "success",
				text: `Published ${numeric.toFixed(2)} USDC ${offerSide} offer on Arc Escrow.`,
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

	// Verify TLSNotary proof and release escrow
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
					expectedAccountNo: "0123456789",
					cryptoAmountUsdc: trade.usdcAmount,
				}),
			});

			const sessionData = (await sessionRes.json()) as {
				error?: string;
				session?: { session_id: string };
				sessionId?: string;
			};
			const activeSessionId = sessionData.session?.session_id ?? sessionData.sessionId;
			if (!sessionRes.ok || !activeSessionId) {
				throw new Error(sessionData.error || "Failed to initialize TLSNotary session.");
			}

			const execRes = await fetch(`/api/tlsn/trades/${tradeId}/verify`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "execute_proof",
					sessionId: activeSessionId,
					bankName: trade.bankName,
					amountNgn: cleanNgn,
					recipientAccount: "0123456789",
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

			const proofId =
				execData.proofSummary?.on_chain_proof_id_bytes32 ||
				`0x${Date.now().toString(16).padStart(64, "0")}`;

			let releaseTxHash: `0x${string}` | undefined;
			if (ESCROW_ADDRESS !== "0x0000000000000000000000000000000000000000" && /^\d+$/.test(tradeId)) {
				releaseTxHash = await escrow.markFiatSent(BigInt(tradeId));
			}

			const res = await fetch("/api/user/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(address ? { "x-wallet-address": address } : {}),
				},
				body: JSON.stringify({
					action: "update_status",
					tradeId,
					status: "completed",
					proofId,
					txHash: releaseTxHash,
				}),
			});

			if (res.ok) {
				const updated = (await res.json()) as {
					transactions?: UserTransaction[];
					peerOffers?: PeerTradeOffer[];
				};
				if (updated.transactions) setTransactions(updated.transactions);
				if (updated.peerOffers) setPeerOffers(updated.peerOffers);
			}

			setActionFeedback({
				type: "success",
				text: `TLSNotary proof verified for Trade #${tradeId}. Escrow released.`,
			});
			await refetchNative();
			await refetchErc20();
			void fetchDashboardData();
		} catch (err) {
			setActionFeedback({
				type: "error",
				text: formatUserFriendlyWalletError(
					err,
					`Verification failed for Trade #${tradeId}.`,
				),
			});
		} finally {
			setVerifyingTradeId(null);
		}
	};

	// Filtered transactions for Order History
	const filteredTransactions = useMemo(() => {
		return transactions.filter((tx) => {
			if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
			if (txStatusFilter !== "all" && tx.status !== txStatusFilter) return false;
			if (txSearch.trim()) {
				const q = txSearch.toLowerCase();
				const matchId = tx.tradeId.toLowerCase().includes(q) || tx.id.toLowerCase().includes(q);
				const matchCounterparty = tx.counterparty.toLowerCase().includes(q);
				const matchBank = tx.bankName.toLowerCase().includes(q);
				if (!matchId && !matchCounterparty && !matchBank) return false;
			}
			return true;
		});
	}, [transactions, txTypeFilter, txStatusFilter, txSearch]);

	// Filtered peer offers
	const filteredPeerOffers = useMemo(() => {
		return peerOffers.filter((offer) => {
			if (peerSideFilter !== "all" && offer.side !== peerSideFilter) return false;
			if (peerBankFilter !== "all" && offer.bankName !== peerBankFilter) return false;
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

	// Gate: wallet must be connected on Arc Testnet and signed in
	if (checkingSession) {
		return (
			<div className="py-20 flex items-center justify-center">
				<div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-[#d1e8dc] bg-white text-xs text-[#3d6b55]">
					<RefreshCw size={14} className="animate-spin text-[#1a9e5c]" />
					<span>Verifying wallet session...</span>
				</div>
			</div>
		);
	}

	if (!isConnected || !address || isWrongChain || !authenticated) {
		return (
			<div className="max-w-md mx-auto my-12">
				<div className="rounded-lg border border-[#d1e8dc] bg-white p-6 text-center">
					<div className="w-10 h-10 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc] flex items-center justify-center mx-auto mb-3">
						<Lock size={18} className="text-[#1a9e5c]" />
					</div>

					<h2 className="text-base font-semibold text-[#0d2b1e]">
						{!isConnected
							? "Connect Wallet to Access Dashboard"
							: isWrongChain
							? "Switch to Arc Testnet"
							: "Sign In to Verify Ownership"}
					</h2>

					<p className="text-xs text-[#7aaa92] mt-1.5 leading-relaxed">
						{!isConnected
							? "Connect your Web3 wallet and complete a signature check to view your real USDC balance and escrow trades."
							: isWrongChain
							? `Switch network to ${arcTestnet.name} (Chain ID ${arcTestnet.id}) to continue.`
							: "Sign a message with your connected wallet to unlock your dashboard session."}
					</p>

					{address && (
						<div className="mt-4 px-3 py-2 rounded-lg bg-[#f8fcfa] border border-[#d1e8dc] flex items-center justify-between text-xs">
							<span className="text-[#7aaa92]">Wallet</span>
							<span className="font-mono text-[#0d2b1e]">
								{address.slice(0, 6)}…{address.slice(-4)}
							</span>
						</div>
					)}

					<div className="mt-4">
						{!isConnected || !address ? (
							<button
								onClick={() => void handleConnectAndSignIn()}
								disabled={authBusy}
								className="w-full py-2.5 rounded-lg font-medium text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
							>
								<Wallet size={14} />
								<span>{authBusy ? "Connecting..." : "Connect & Sign In"}</span>
							</button>
						) : isWrongChain ? (
							<button
								onClick={() => void handleSwitchNetwork()}
								disabled={authBusy}
								className="w-full py-2.5 rounded-lg font-medium text-xs text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-60"
							>
								{authBusy ? "Switching Network..." : "Switch to Arc Testnet"}
							</button>
						) : (
							<button
								onClick={() => void authenticateWallet(address)}
								disabled={authBusy}
								className="w-full py-2.5 rounded-lg font-medium text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60"
							>
								{authBusy ? "Waiting for Signature..." : "Sign Message to Unlock"}
							</button>
						)}
					</div>

					{authError && (
						<div className="mt-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs text-left flex items-start gap-1.5">
							<AlertCircle size={13} className="shrink-0 mt-0.5" />
							<span>{authError}</span>
						</div>
					)}
				</div>
			</div>
		);
	}

	const navItems: { id: DashboardTab; label: string; icon: React.ReactNode; count?: number }[] = [
		{ id: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
		{
			id: "escrows",
			label: "Escrow Positions",
			icon: <Layers size={16} />,
			count: activeEscrows.length,
		},
		{
			id: "transactions",
			label: "Order History",
			icon: <Receipt size={16} />,
			count: transactions.length,
		},
		{
			id: "peers",
			label: "Peer Market",
			icon: <Users size={16} />,
			count: peerOffers.length,
		},
		{ id: "create", label: "Post Offer", icon: <PlusCircle size={16} /> },
	];

	return (
		<div className="rounded-xl border border-[#d1e8dc] bg-[#fbfdfc] overflow-hidden flex flex-col lg:flex-row min-h-[640px]">
			{/* Mobile Header Bar */}
			<div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[#d1e8dc] bg-white">
				<div className="flex items-center gap-2">
					<button
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						className="p-1.5 rounded-lg border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3]"
						aria-label="Toggle navigation menu"
					>
						{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
					</button>
					<span className="text-xs font-semibold text-[#0d2b1e]">
						{navItems.find((n) => n.id === activeTab)?.label}
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span className="font-mono text-xs font-semibold text-[#0d2b1e]">
						{stats.walletUsdc.toFixed(2)} USDC
					</span>
					<button
						onClick={() => {
							void fetchDashboardData();
							void refetchNative();
							void refetchErc20();
						}}
						disabled={loadingData}
						className="p-1.5 rounded-lg border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3]"
						title="Refresh data"
					>
						<RefreshCw size={13} className={loadingData ? "animate-spin text-[#1a9e5c]" : ""} />
					</button>
				</div>
			</div>

			{/* Responsive Sidebar (Desktop & Mobile Drawer) */}
			<div
				className={cn(
					"lg:w-60 shrink-0 border-r border-[#d1e8dc] bg-white flex flex-col justify-between transition-all duration-200",
					mobileMenuOpen ? "block" : "hidden lg:flex",
				)}
			>
				{/* Top Sidebar: Navigation */}
				<div className="p-3 space-y-1">
					<div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#7aaa92]">
						Account Navigation
					</div>
					{navItems.map((item) => {
						const active = activeTab === item.id;
						return (
							<button
								key={item.id}
								onClick={() => {
									setActiveTab(item.id);
									setMobileMenuOpen(false);
								}}
								className={cn(
									"w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
									active
										? "bg-[#1a9e5c] text-white"
										: "text-[#3d6b55] hover:bg-[#f0f7f3] hover:text-[#0d2b1e]",
								)}
							>
								<div className="flex items-center gap-2.5">
									<span className={active ? "text-white" : "text-[#7aaa92]"}>{item.icon}</span>
									<span>{item.label}</span>
								</div>
								{item.count !== undefined && item.count > 0 && (
									<span
										className={cn(
											"px-1.5 py-0.5 text-[10px] font-mono rounded",
											active ? "bg-white/20 text-white" : "bg-[#f0f7f3] text-[#3d6b55]",
										)}
									>
										{item.count}
									</span>
								)}
							</button>
						);
					})}
				</div>

				{/* Bottom Sidebar: Network and Account */}
				<div className="p-3 border-t border-[#d1e8dc] space-y-2 bg-[#fbfdfc]">
					{username && (
						<div className="flex items-center justify-between text-[11px]">
							<span className="text-[#7aaa92]">Handle</span>
							<span className="font-mono font-semibold text-[#1a9e5c]">@{username}</span>
						</div>
					)}
					<div className="flex items-center justify-between text-[11px]">
						<span className="text-[#7aaa92]">Network</span>
						<span className="font-medium text-[#0d2b1e]">Arc Testnet</span>
					</div>

					<div className="flex items-center justify-between text-[11px]">
						<span className="text-[#7aaa92]">Wallet</span>
						<div className="flex items-center gap-1">
							<span className="font-mono text-[#0d2b1e]">
								{address.slice(0, 6)}…{address.slice(-4)}
							</span>
							<button
								onClick={copyWalletAddress}
								className="text-[#7aaa92] hover:text-[#1a9e5c]"
								title="Copy address"
							>
								{copiedAddr ? <Check size={11} /> : <Copy size={11} />}
							</button>
							<a
								href={ARCSCAN_ADDR(address)}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#7aaa92] hover:text-[#1a9e5c]"
								title="View on ArcScan"
							>
								<ExternalLink size={11} />
							</a>
						</div>
					</div>

					<Link
						href="/trade"
						className="mt-2 block w-full py-1.5 px-2 rounded-lg text-center text-xs font-medium border border-[#d1e8dc] bg-white text-[#3d6b55] hover:bg-[#f0f7f3] transition-colors"
					>
						Open Trading Widget
					</Link>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col min-w-0 bg-white">
				{/* Desktop Header Bar */}
				<div className="hidden lg:flex items-center justify-between px-6 py-3.5 border-b border-[#d1e8dc] bg-white">
					<div>
						<h2 className="text-sm font-semibold text-[#0d2b1e]">
							{navItems.find((n) => n.id === activeTab)?.label}
						</h2>
						<p className="text-xs text-[#7aaa92]">
							{activeTab === "overview" && "Summary of your balances, collateral, and escrow activity"}
							{activeTab === "escrows" && "Active trades waiting for payment or TLSNotary verification"}
							{activeTab === "transactions" && "Complete ledger of your executed peer transactions"}
							{activeTab === "peers" && "Liquidity offers posted by peers on Arc Network"}
							{activeTab === "create" && "Lock USDC and publish an escrow offer"}
						</p>
					</div>

					<div className="flex items-center gap-3">
						<div className="text-right">
							<div className="text-[11px] text-[#7aaa92]">Wallet Balance</div>
							<div className="font-mono font-semibold text-xs text-[#0d2b1e]">
								{stats.walletUsdc.toFixed(2)} USDC
							</div>
						</div>

						<button
							onClick={() => {
								void fetchDashboardData();
								void refetchNative();
								void refetchErc20();
							}}
							disabled={loadingData}
							className="p-2 rounded-lg border border-[#d1e8dc] text-[#3d6b55] hover:bg-[#f0f7f3] transition-colors"
							title="Refresh data"
						>
							<RefreshCw size={13} className={loadingData ? "animate-spin text-[#1a9e5c]" : ""} />
						</button>
					</div>
				</div>

				{/* Feedback Alert */}
				{actionFeedback && (
					<div
						className={cn(
							"mx-4 sm:mx-6 mt-4 p-3 rounded-lg border text-xs flex items-center justify-between",
							actionFeedback.type === "success"
								? "bg-[#f0f7f3] border-[#1a9e5c]/30 text-[#0d2b1e]"
								: "bg-red-50 border-red-200 text-red-700",
						)}
					>
						<div className="flex items-center gap-2 min-w-0">
							{actionFeedback.type === "success" ? (
								<CheckCircle size={14} className="text-[#1a9e5c] shrink-0" />
							) : (
								<AlertCircle size={14} className="text-red-500 shrink-0" />
							)}
							<span className="truncate">{actionFeedback.text}</span>
						</div>
						<button
							onClick={() => setActionFeedback(null)}
							className="text-[11px] font-medium ml-2 underline text-[#7aaa92] hover:text-[#0d2b1e]"
						>
							Dismiss
						</button>
					</div>
				)}

				{/* Tab Content Body */}
				<div className="p-4 sm:p-6 flex-1 space-y-6 overflow-y-auto">
					{/* Optional Username Onboarding Card */}
					{!onboardingCompleted && !username && (
						<div className="p-4 rounded-lg border border-[#1a9e5c]/30 bg-[#f0f7f3] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
							<div className="space-y-1">
								<div className="text-xs font-semibold text-[#0d2b1e]">
									Claim your PeerNotary handle (optional)
								</div>
								<p className="text-[11px] text-[#3d6b55]">
									Set a unique username (3 to 24 chars, letters, numbers, or underscore) so counterparties recognize your offers. Your wallet address remains your cryptographic identity.
								</p>
								{usernameError && (
									<p className="text-[11px] font-medium text-red-600">{usernameError}</p>
								)}
							</div>

							<form onSubmit={handleSaveUsername} className="flex flex-wrap items-center gap-2 shrink-0">
								<input
									type="text"
									value={usernameInput}
									onChange={(e) => setUsernameInput(e.target.value)}
									placeholder="e.g. lagos_desk"
									maxLength={24}
									className="px-3 py-1.5 rounded-lg border border-[#d1e8dc] bg-white text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
								/>
								<button
									type="submit"
									disabled={usernameBusy || usernameInput.trim().length < 3}
									className="px-3 py-1.5 rounded-lg bg-[#1a9e5c] text-white text-xs font-semibold hover:bg-[#15854c] disabled:opacity-50"
								>
									{usernameBusy ? "Saving..." : "Claim Handle"}
								</button>
								<button
									type="button"
									onClick={() => void handleSkipUsername()}
									disabled={usernameBusy}
									className="px-2.5 py-1.5 rounded-lg border border-[#d1e8dc] bg-white text-[#7aaa92] hover:text-[#0d2b1e] text-xs font-medium"
								>
									Skip for now
								</button>
							</form>
						</div>
					)}

					{/* Trades Requiring Attention Banner */}
					{tradesRequiringAttention.length > 0 && (
						<div className="p-4 rounded-lg border border-amber-300 bg-amber-50/70 space-y-2.5">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
									<AlertCircle size={14} className="text-amber-700" />
									<span>
										Trades Requiring Attention ({tradesRequiringAttention.length})
									</span>
								</div>
								<span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
									Hold / Recovery Protection Active
								</span>
							</div>
							<div className="divide-y divide-amber-200/60">
								{tradesRequiringAttention.map((attTrade) => (
									<div
										key={attTrade.id}
										className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
									>
										<div>
											<span className="font-mono font-semibold text-amber-950">
												Trade #{attTrade.tradeId}
											</span>{" "}
											<span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white border border-amber-300 text-amber-800">
												{attTrade.lifecycleState ?? "ON_HOLD"}
											</span>
											{attTrade.holdReason && (
												<p className="text-[11px] text-amber-800 mt-0.5">
													{attTrade.holdReason}
												</p>
											)}
										</div>
										<Link
											href={`/bank-checkout?tradeId=${encodeURIComponent(
												attTrade.tradeId,
											)}&bank=${encodeURIComponent(
												attTrade.bankName,
											)}&amountNgn=${encodeURIComponent(
												attTrade.ngnAmount.replace(/[^0-9]/g, ""),
											)}&amountUsdc=${encodeURIComponent(
												attTrade.usdcAmount,
											)}&accountNo=${encodeURIComponent(
												attTrade.sellerAccountNumber || "0123456789",
											)}&returnTo=/dashboard`}
											className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-800 shrink-0 text-center"
										>
											Resolve in Settlement Portal
										</Link>
									</div>
								))}
							</div>
						</div>
					)}

					{/* TAB 1: OVERVIEW */}
					{activeTab === "overview" && (
						<div className="space-y-6">
							{/* Portfolio Metrics Grid */}
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
								<div className="p-4 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
									<div className="text-[11px] font-medium text-[#7aaa92]">Available Balance</div>
									<div className="mt-1 font-mono text-xl font-semibold text-[#0d2b1e]">
										{stats.walletUsdc.toFixed(2)} USDC
									</div>
									<div className="text-[11px] text-[#7aaa92] font-mono mt-0.5">
										≈ ₦{stats.walletNgn.toLocaleString("en-NG")}
									</div>
								</div>

								<div className="p-4 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
									<div className="text-[11px] font-medium text-[#7aaa92]">Locked in Escrow</div>
									<div className="mt-1 font-mono text-xl font-semibold text-[#0d2b1e]">
										{stats.lockedEscrowUsdc.toFixed(2)} USDC
									</div>
									<div className="text-[11px] text-[#7aaa92] mt-0.5">
										{activeEscrows.length} active trade{activeEscrows.length === 1 ? "" : "s"}
									</div>
								</div>

								<div className="p-4 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
									<div className="text-[11px] font-medium text-[#7aaa92]">Bonded Collateral</div>
									<div className="mt-1 font-mono text-xl font-semibold text-[#0d2b1e]">
										{stats.lockedCollateralUsdc.toFixed(2)} USDC
									</div>
									<div className="text-[11px] text-[#7aaa92] mt-0.5">Anti-fraud guarantee</div>
								</div>

								<div className="p-4 rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
									<div className="text-[11px] font-medium text-[#7aaa92]">Total Settled Volume</div>
									<div className="mt-1 font-mono text-xl font-semibold text-[#0d2b1e]">
										{stats.totalVolumeUsdc.toFixed(2)} USDC
									</div>
									<div className="text-[11px] text-[#7aaa92] mt-0.5">
										{stats.completedCount} completed trade{stats.completedCount === 1 ? "" : "s"}
									</div>
								</div>
							</div>

							{/* Active Escrow Section */}
							<div className="rounded-lg border border-[#d1e8dc] bg-white overflow-hidden">
								<div className="px-4 py-3 border-b border-[#d1e8dc] flex items-center justify-between">
									<div>
										<h3 className="text-xs font-semibold text-[#0d2b1e]">Active Escrow Positions</h3>
										<p className="text-[11px] text-[#7aaa92]">Trades currently in settlement</p>
									</div>
									{activeEscrows.length > 0 && (
										<button
											onClick={() => setActiveTab("escrows")}
											className="text-xs font-medium text-[#1a9e5c] hover:underline"
										>
											View All ({activeEscrows.length})
										</button>
									)}
								</div>

								{activeEscrows.length === 0 ? (
									<div className="p-6 text-center text-xs text-[#7aaa92]">
										No active escrow positions. Explore open peer offers to start a trade.
									</div>
								) : (
									<div className="divide-y divide-[#d1e8dc]/60">
										{activeEscrows.slice(0, 3).map((trade) => (
											<div
												key={trade.id}
												className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
											>
												<div>
													<div className="flex items-center gap-2">
														<span className="font-mono font-semibold text-[#0d2b1e]">
															Trade #{trade.tradeId}
														</span>
														<span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200">
															{trade.lifecycleState ?? "AWAITING_PAYMENT"}
														</span>
														<span className="text-[#7aaa92]">· {trade.bankName}</span>
													</div>
													<div className="text-[11px] text-[#7aaa92] mt-1">
														Counterparty: {trade.counterparty}
													</div>
												</div>

												<div className="flex items-center gap-3">
													<div className="text-right">
														<div className="font-mono font-semibold text-[#0d2b1e]">
															{trade.usdcAmount} USDC
														</div>
														<div className="text-[11px] text-[#7aaa92]">{trade.ngnAmount}</div>
													</div>

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
															trade.sellerAccountNumber || "0123456789",
														)}&returnTo=/dashboard`}
														className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] transition-colors"
													>
														{trade.role === "buyer" ? "Flutterwave Checkout" : "Manage Settlement"}
													</Link>
													<button
														onClick={() => void handleVerifyAndRelease(trade)}
														disabled={verifyingTradeId === trade.tradeId}
														className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60"
													>
														{verifyingTradeId === trade.tradeId ? "Verifying..." : "Verify & Release"}
													</button>
												</div>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Recent Activity Table Preview */}
							<div className="rounded-lg border border-[#d1e8dc] bg-white overflow-hidden">
								<div className="px-4 py-3 border-b border-[#d1e8dc] flex items-center justify-between">
									<h3 className="text-xs font-semibold text-[#0d2b1e]">Recent Orders</h3>
									<button
										onClick={() => setActiveTab("transactions")}
										className="text-xs font-medium text-[#1a9e5c] hover:underline"
									>
										View Ledger
									</button>
								</div>

								{transactions.length === 0 ? (
									<div className="p-6 text-center text-xs text-[#7aaa92]">
										No transactions recorded on your account yet.
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-xs text-left">
											<thead>
												<tr className="border-b border-[#d1e8dc] text-[#7aaa92] bg-[#fbfdfc]">
													<th className="py-2.5 px-4 font-medium">Trade</th>
													<th className="py-2.5 px-4 font-medium">Type</th>
													<th className="py-2.5 px-4 font-medium">Bank</th>
													<th className="py-2.5 px-4 font-medium text-right">Amount</th>
													<th className="py-2.5 px-4 font-medium text-center">Status</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-[#d1e8dc]/60">
												{transactions.slice(0, 4).map((tx) => (
													<tr key={tx.id} className="hover:bg-[#fbfdfc]">
														<td className="py-2.5 px-4 font-mono font-medium text-[#0d2b1e]">
															#{tx.tradeId}
														</td>
														<td className="py-2.5 px-4 capitalize text-[#3d6b55]">{tx.type}</td>
														<td className="py-2.5 px-4 text-[#0d2b1e]">{tx.bankName}</td>
														<td className="py-2.5 px-4 font-mono font-medium text-right text-[#0d2b1e]">
															{tx.usdcAmount} USDC
														</td>
														<td className="py-2.5 px-4 text-center">
															<span
																className={cn(
																	"px-2 py-0.5 rounded text-[10px] font-medium capitalize",
																	tx.status === "completed" && "bg-green-50 text-green-700",
																	tx.status === "escrow" && "bg-amber-50 text-amber-700",
																	tx.status === "disputed" && "bg-red-50 text-red-700",
																	tx.status === "pending" && "bg-zinc-100 text-zinc-700",
																)}
															>
																{tx.status}
															</span>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>
						</div>
					)}

					{/* TAB 2: ACTIVE ESCROWS */}
					{activeTab === "escrows" && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="text-xs font-semibold text-[#0d2b1e]">Escrow Positions</h3>
									<p className="text-[11px] text-[#7aaa92]">
										Trades locked in Arc smart contract awaiting fiat settlement
									</p>
								</div>
								<span className="text-xs font-mono text-[#7aaa92]">{activeEscrows.length} Active</span>
							</div>

							{activeEscrows.length === 0 ? (
								<div className="p-8 text-center rounded-lg border border-[#d1e8dc] bg-[#fbfdfc]">
									<p className="text-xs text-[#7aaa92]">No open escrow trades found.</p>
									<button
										onClick={() => setActiveTab("peers")}
										className="mt-3 px-3 py-1.5 rounded-lg bg-[#1a9e5c] text-white text-xs font-medium hover:bg-[#15854c] transition-colors"
									>
										Browse Peer Offers
									</button>
								</div>
							) : (
								<div className="space-y-3">
									{activeEscrows.map((trade) => (
										<div
											key={trade.id}
											className="p-4 rounded-lg border border-[#d1e8dc] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
										>
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<span className="font-mono font-semibold text-[#0d2b1e]">
														Trade #{trade.tradeId}
													</span>
													<span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200">
														{trade.lifecycleState ?? "AWAITING_PAYMENT"}
													</span>
													<span className="text-[#7aaa92]">· {trade.bankName}</span>
												</div>
												<div className="text-[11px] text-[#7aaa92]">
													Counterparty: {trade.counterparty} ({trade.counterpartyAddress.slice(0, 6)}…
													{trade.counterpartyAddress.slice(-4)})
												</div>
												<div className="font-mono text-[#0d2b1e]">
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
														trade.sellerAccountNumber || "0123456789",
													)}&returnTo=/dashboard`}
													className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] transition-colors"
												>
													{trade.role === "buyer" ? "Flutterwave Checkout" : "Settlement Portal"}
												</Link>

												<button
													onClick={() => void handleVerifyAndRelease(trade)}
													disabled={verifyingTradeId === trade.tradeId}
													className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60"
												>
													{verifyingTradeId === trade.tradeId ? "Verifying Proof..." : "Verify & Release"}
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* TAB 3: ORDER HISTORY / TRANSACTIONS */}
					{activeTab === "transactions" && (
						<div className="space-y-4">
							{/* Filters Bar */}
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<div className="flex flex-wrap items-center gap-1.5">
									{(["all", "buy", "sell", "collateral", "release"] as const).map((t) => (
										<button
											key={t}
											onClick={() => setTxTypeFilter(t)}
											className={cn(
												"px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize",
												txTypeFilter === t
													? "bg-[#1a9e5c] text-white"
													: "bg-[#f0f7f3] text-[#3d6b55] hover:bg-[#e4f2eb]",
											)}
										>
											{t}
										</button>
									))}
								</div>

								<div className="relative w-full sm:w-60">
									<Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7aaa92]" />
									<input
										type="text"
										value={txSearch}
										onChange={(e) => setTxSearch(e.target.value)}
										placeholder="Search trade ID, bank..."
										className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-[#d1e8dc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c]"
									/>
								</div>
							</div>

							{/* Transactions Table */}
							<div className="rounded-lg border border-[#d1e8dc] bg-white overflow-hidden">
								<div className="overflow-x-auto">
									<table className="w-full text-xs text-left">
										<thead>
											<tr className="border-b border-[#d1e8dc] text-[#7aaa92] bg-[#fbfdfc]">
												<th className="py-2.5 px-4 font-medium">Trade</th>
												<th className="py-2.5 px-4 font-medium">Type</th>
												<th className="py-2.5 px-4 font-medium">Counterparty</th>
												<th className="py-2.5 px-4 font-medium">Rail</th>
												<th className="py-2.5 px-4 font-medium text-right">Amount</th>
												<th className="py-2.5 px-4 font-medium text-center">Status</th>
												<th className="py-2.5 px-4 font-medium text-right">Explorer</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-[#d1e8dc]/60">
											{filteredTransactions.length === 0 ? (
												<tr>
													<td colSpan={7} className="py-8 text-center text-[#7aaa92]">
														No transactions found matching your filter criteria.
													</td>
												</tr>
											) : (
												filteredTransactions.map((tx) => (
													<tr key={tx.id} className="hover:bg-[#fbfdfc] transition-colors">
														<td className="py-2.5 px-4 font-mono font-medium text-[#0d2b1e]">
															#{tx.tradeId}
														</td>
														<td className="py-2.5 px-4 capitalize text-[#3d6b55]">{tx.type}</td>
														<td className="py-2.5 px-4 text-[#0d2b1e]">
															<div>{tx.counterparty}</div>
															<div className="text-[10px] text-[#7aaa92] font-mono">
																{tx.counterpartyAddress.slice(0, 6)}…{tx.counterpartyAddress.slice(-4)}
															</div>
														</td>
														<td className="py-2.5 px-4 text-[#0d2b1e]">{tx.bankName}</td>
														<td className="py-2.5 px-4 font-mono font-medium text-right text-[#0d2b1e]">
															<div>{tx.usdcAmount} USDC</div>
															<div className="text-[10px] text-[#7aaa92]">{tx.ngnAmount}</div>
														</td>
														<td className="py-2.5 px-4 text-center">
															<span
																className={cn(
																	"px-2 py-0.5 rounded text-[10px] font-medium capitalize",
																	tx.status === "completed" && "bg-green-50 text-green-700",
																	tx.status === "escrow" && "bg-amber-50 text-amber-700",
																	tx.status === "disputed" && "bg-red-50 text-red-700",
																	tx.status === "pending" && "bg-zinc-100 text-zinc-700",
																)}
															>
																{tx.status}
															</span>
														</td>
														<td className="py-2.5 px-4 text-right">
															<a
																href={ARCSCAN_TX(tx.txHash)}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex items-center gap-1 font-mono text-[11px] text-[#1a9e5c] hover:underline"
															>
																<span>{tx.txHash.slice(0, 6)}…</span>
																<ArrowUpRight size={11} />
															</a>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					)}

					{/* TAB 4: PEER MARKET */}
					{activeTab === "peers" && (
						<div className="space-y-4">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<div className="flex flex-wrap items-center gap-1.5">
									{(["all", "sell", "buy"] as const).map((side) => (
										<button
											key={side}
											onClick={() => setPeerSideFilter(side)}
											className={cn(
												"px-2.5 py-1 rounded text-xs font-medium transition-colors",
												peerSideFilter === side
													? "bg-[#1a9e5c] text-white"
													: "bg-[#f0f7f3] text-[#3d6b55] hover:bg-[#e4f2eb]",
											)}
										>
											{side === "all" ? "All" : side === "sell" ? "Buy USDC" : "Sell USDC"}
										</button>
									))}

									<select
										value={peerBankFilter}
										onChange={(e) => setPeerBankFilter(e.target.value)}
										className="px-2 py-1 rounded border border-[#d1e8dc] text-xs text-[#0d2b1e] bg-white focus:outline-none"
									>
										<option value="all">All Banks</option>
										{NIGERIAN_BANKS.map((b) => (
											<option key={b} value={b}>
												{b}
											</option>
										))}
									</select>
								</div>

								<div className="relative w-full sm:w-60">
									<Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7aaa92]" />
									<input
										type="text"
										value={peerSearch}
										onChange={(e) => setPeerSearch(e.target.value)}
										placeholder="Filter peer or bank..."
										className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-[#d1e8dc] text-xs text-[#0d2b1e] placeholder:text-[#7aaa92] focus:outline-none focus:border-[#1a9e5c]"
									/>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{filteredPeerOffers.map((offer) => (
									<div
										key={offer.tradeId}
										className="p-4 rounded-lg border border-[#d1e8dc] bg-white flex flex-col justify-between gap-3 text-xs"
									>
										<div className="flex items-start justify-between">
											<div>
												<div className="flex items-center gap-2">
													<span className="font-semibold text-[#0d2b1e]">{offer.peerHandle}</span>
													<span
														className={cn(
															"px-1.5 py-0.5 rounded text-[10px] font-medium",
															offer.side === "sell"
																? "bg-green-50 text-green-700"
																: "bg-blue-50 text-blue-700",
														)}
													>
														{offer.side === "sell" ? "Selling USDC" : "Buying USDC"}
													</span>
												</div>
												<div className="text-[11px] text-[#7aaa92] mt-0.5">
													{offer.bankName} · {offer.completionRate} completion
												</div>
											</div>

											<div className="text-right">
												<div className="text-[11px] text-[#7aaa92]">Rate</div>
												<div className="font-mono font-semibold text-[#0d2b1e]">
													₦{offer.rateNgn.toLocaleString("en-NG")}
												</div>
											</div>
										</div>

										<div className="p-2.5 rounded bg-[#fbfdfc] border border-[#d1e8dc] flex items-center justify-between text-xs">
											<div>
												<div className="text-[10px] text-[#7aaa92]">Available</div>
												<div className="font-mono font-semibold text-[#0d2b1e]">
													{offer.availableUsdc} USDC
												</div>
											</div>
											<div className="text-right">
												<div className="text-[10px] text-[#7aaa92]">Collateral Bond</div>
												<div className="font-mono font-medium text-amber-700">
													{offer.requiredCollateralUsdc} USDC
												</div>
											</div>
										</div>

										<div className="flex items-center justify-between pt-1">
											<span className="text-[11px] font-mono text-[#7aaa92]">
												Offer #{offer.tradeId}
											</span>
											{address && offer.peerAddress.toLowerCase() === address.toLowerCase() ? (
												<span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#f0f7f3] text-[#1a9e5c] border border-[#d1e8dc]">
													Your Published {offer.side === "sell" ? "Sale" : "Offer"}
												</span>
											) : (
												<button
													onClick={() => void handleTakePeerOffer(offer)}
													disabled={joiningTradeId === offer.tradeId}
													className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60"
												>
													{joiningTradeId === offer.tradeId
														? "Locking Collateral..."
														: offer.side === "sell"
														? "Lock Collateral & Buy"
														: "Take Offer"}
												</button>
											)}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* TAB 5: POST OFFER */}
					{activeTab === "create" && (
						<div className="max-w-md mx-auto rounded-lg border border-[#d1e8dc] bg-white p-5 space-y-4">
							<div>
								<h3 className="text-xs font-semibold text-[#0d2b1e]">Publish Peer Trade Offer</h3>
								<p className="text-[11px] text-[#7aaa92] mt-0.5">
									Lock USDC in ArcP2PEscrowService. Bank account is hashed client side with keccak256.
								</p>
							</div>

							<form onSubmit={(e) => void handleCreateOffer(e)} className="space-y-3.5">
								<div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#f0f7f3] border border-[#d1e8dc]">
									{(["sell", "buy"] as const).map((side) => (
										<button
											type="button"
											key={side}
											onClick={() => setOfferSide(side)}
											className={cn(
												"py-1.5 rounded text-xs font-medium transition-colors",
												offerSide === side
													? "bg-white text-[#1a9e5c] font-semibold"
													: "text-[#3d6b55] hover:text-[#0d2b1e]",
											)}
										>
											{side === "sell" ? "Sell USDC" : "Buy USDC"}
										</button>
									))}
								</div>

								<div>
									<label className="block text-[11px] font-medium text-[#7aaa92] mb-1">
										USDC Amount
									</label>
									<div className="relative">
										<input
											type="text"
											value={offerUsdc}
											onChange={(e) => setOfferUsdc(e.target.value)}
											className="w-full px-3 py-2 rounded-lg border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
											placeholder="250.00"
										/>
										<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#7aaa92]">
											≈ ₦{Math.round(parseNumericUsdc(offerUsdc) * RATE).toLocaleString("en-NG")}
										</span>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div>
										<label className="block text-[11px] font-medium text-[#7aaa92] mb-1">
											Settlement Bank
										</label>
										<select
											value={offerBank}
											onChange={(e) => setOfferBank(e.target.value)}
											className="w-full px-2.5 py-2 rounded-lg border border-[#d1e8dc] text-xs text-[#0d2b1e] bg-white focus:outline-none"
										>
											{NIGERIAN_BANKS.map((bank) => (
												<option key={bank} value={bank}>
													{bank}
												</option>
											))}
										</select>
									</div>

									<div>
										<label className="block text-[11px] font-medium text-[#7aaa92] mb-1">
											Account Number
										</label>
										<input
											type="text"
											maxLength={10}
											value={offerAccountNo}
											onChange={(e) => setOfferAccountNo(e.target.value.replace(/\D/g, ""))}
											placeholder="0123456789"
											className="w-full px-3 py-2 rounded-lg border border-[#d1e8dc] text-xs font-mono text-[#0d2b1e] focus:outline-none focus:border-[#1a9e5c]"
										/>
									</div>
								</div>

								<div className="p-3 rounded-lg bg-[#fbfdfc] border border-[#d1e8dc] text-xs space-y-1">
									<div className="flex justify-between text-[#7aaa92]">
										<span>Rate</span>
										<span className="font-mono text-[#0d2b1e]">1 USDC = ₦{RATE.toLocaleString("en-NG")}</span>
									</div>
									<div className="flex justify-between text-[#7aaa92]">
										<span>Buyer Collateral</span>
										<span className="font-mono text-[#0d2b1e]">50.00 USDC</span>
									</div>
								</div>

								<button
									type="submit"
									disabled={creatingOffer}
									className="w-full py-2.5 rounded-lg font-medium text-xs text-white bg-[#1a9e5c] hover:bg-[#15854c] transition-colors disabled:opacity-60"
								>
									{creatingOffer ? "Publishing on Chain..." : "Approve & Publish Offer"}
								</button>
							</form>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
