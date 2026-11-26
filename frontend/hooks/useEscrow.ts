/**
 * hooks/useEscrow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Every ArcP2PEscrowService write the UI performs goes through `send()`:
 *
 *   1. ensureArc()   – switch the wallet to the active Arc chain (adds the chain if needed)
 *   2. simulate      – dry-run against Arc RPC so reverts surface *before* the
 *                      wallet prompt, with the decoded contract error
 *   3. write         – `chainId` is pinned, so wagmi refuses to broadcast on any
 *                      other network (previously txs silently went to whatever
 *                      chain the wallet happened to be on)
 *   4. receipt       – wait on Arc with a timeout; reverted receipts throw
 *
 * Nothing in here fabricates a hash. A failed step throws.
 */

"use client";

import { useState, useCallback } from "react";
import { decodeEventLog, type Abi } from "viem";
import {
	useAccount,
	useWriteContract,
	useConnect,
	useDisconnect,
	usePublicClient,
	useSwitchChain,
	useReadContract,
} from "wagmi";
import { injected } from "wagmi/connectors";
import {
	ESCROW_ABI,
	USDC_ABI,
	ESCROW_ADDRESS,
	USDC_ADDRESS,
	ARCSCAN_TX,
	ZERO_ADDRESS,
	parseUsdc,
	formatUsdc,
	hashBankDetails,
	arcChain,
	switchToArc as switchWalletToArc,
	formatUserFriendlyWalletError,
} from "@/lib/web3/arcConfig";

type Hex = `0x${string}`;

export type EscrowTxState =
	| "idle"
	| "switching-network"
	| "approving"
	| "waiting-approval"
	| "writing"
	| "waiting-confirmation"
	| "confirmed"
	| "error";

export const TX_STATE_LABEL: Record<EscrowTxState, string> = {
	idle: "",
	"switching-network": `Switching wallet to ${arcChain.name}…`,
	approving: "Approve USDC spending in your wallet…",
	"waiting-approval": "Waiting for approval to confirm…",
	writing: "Confirm the transaction in your wallet…",
	"waiting-confirmation": "Waiting for Arc to confirm…",
	confirmed: "Confirmed on Arc",
	error: "",
};

export interface InitiateTradeParams {
	cryptoAmountUsdc: string;
	bankName: string;
	accountNo: string;
	sortCode?: string;
}

export interface InitiateTradeResult {
	txHash: Hex;
	tradeId: string;
}

export interface EscrowHookReturn {
	address: Hex | undefined;
	isConnected: boolean;
	connect: () => Promise<void>;
	disconnect: () => void;
	chainId: number | undefined;
	isWrongChain: boolean;
	switchToArc: () => Promise<void>;

	txState: EscrowTxState;
	txHash: Hex | undefined;
	arcScanUrl: string | undefined;
	errorMsg: string | undefined;
	isLoading: boolean;

	/** Seller locks USDC into a new escrow listing. */
	initiateTrade: (params: InitiateTradeParams) => Promise<InitiateTradeResult>;
	/** Buyer claims the *entire* remaining listing on-chain (0 collateral). */
	acceptListing: (listingId: bigint, expectedUnits?: bigint) => Promise<Hex>;
	/** Seller pulls back unallocated USDC from a listing. */
	withdrawInventory: (listingId: bigint, amountUnits: bigint) => Promise<Hex>;
	/** Withdraws everything still available in a listing; null if nothing is left. */
	withdrawAllAvailable: (listingId: bigint) => Promise<Hex | null>;
	markFiatSent: (tradeId: bigint) => Promise<Hex>;
	releaseFunds: (tradeId: bigint) => Promise<Hex>;
	raiseDispute: (tradeId: bigint) => Promise<Hex>;
	/**
	 * Seller-signed release when the on-chain trade is Funded/FiatSent and this
	 * wallet is its seller. Returns `null` when the trade must be settled by the
	 * oracle instead (partial fills, buyer-side views). Throws on real failures.
	 */
	releaseIfSellerCan: (tradeId: string) => Promise<Hex | null>;
	reset: () => void;
}

const RECEIPT_TIMEOUT_MS = 120_000;
const escrowAbi = ESCROW_ABI as unknown as Abi;

export function useEscrow(): EscrowHookReturn {
	const { address, isConnected, chainId } = useAccount();
	const { connectAsync, connectors } = useConnect();
	const { disconnect } = useDisconnect();
	const { switchChainAsync } = useSwitchChain();
	const publicClient = usePublicClient({ chainId: arcChain.id });
	const { writeContractAsync } = useWriteContract();

	const [txState, setTxState] = useState<EscrowTxState>("idle");
	const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
	const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);

	const isWrongChain = isConnected && chainId !== arcChain.id;

	const isLoading =
		txState === "switching-network" ||
		txState === "approving" ||
		txState === "waiting-approval" ||
		txState === "writing" ||
		txState === "waiting-confirmation";

	const reset = useCallback(() => {
		setTxState("idle");
		setTxHash(undefined);
		setErrorMsg(undefined);
	}, []);

	const fail = useCallback((e: unknown): never => {
		setErrorMsg(
			formatUserFriendlyWalletError(e, "Transaction could not be completed. Please try again."),
		);
		setTxState("error");
		throw e;
	}, []);

	const connect = useCallback(async () => {
		try {
			await connectAsync({ connector: connectors[0] ?? injected() });
		} catch (e) {
			setErrorMsg(formatUserFriendlyWalletError(e));
			setTxState("error");
		}
	}, [connectAsync, connectors]);

	const switchToArc = useCallback(async () => {
		await switchWalletToArc(switchChainAsync);
	}, [switchChainAsync]);

	const requireWallet = useCallback((): Hex => {
		if (!address || !isConnected) throw new Error("Connect your wallet first.");
		if (!publicClient) throw new Error("Arc RPC client is not ready. Reload and try again.");
		return address;
	}, [address, isConnected, publicClient]);

	const ensureArc = useCallback(async () => {
		if (chainId === arcChain.id) return;
		setTxState("switching-network");
		await switchWalletToArc(switchChainAsync);
	}, [chainId, switchChainAsync]);

	const waitFor = useCallback(
		async (hash: Hex, what: string) => {
			const receipt = await publicClient!.waitForTransactionReceipt({
				hash,
				timeout: RECEIPT_TIMEOUT_MS,
			});
			if (receipt.status !== "success") {
				throw new Error(`${what} reverted on Arc (tx ${hash.slice(0, 10)}…).`);
			}
			return receipt;
		},
		[publicClient],
	);

	/** Simulate → write (chain-pinned) → wait. */
	const send = useCallback(
		async (
			functionName: string,
			args: readonly unknown[],
			what: string,
			target: { address: Hex; abi: Abi } = { address: ESCROW_ADDRESS, abi: escrowAbi },
		) => {
			const account = requireWallet();
			await publicClient!.simulateContract({
				address: target.address,
				abi: target.abi,
				functionName,
				args,
				account,
			});
			setTxState("writing");
			const hash = await writeContractAsync({
				address: target.address,
				abi: target.abi,
				functionName,
				args,
				account,
				chainId: arcChain.id,
			});
			setTxHash(hash);
			setTxState("waiting-confirmation");
			const receipt = await waitFor(hash, what);
			return { hash, receipt };
		},
		[publicClient, requireWallet, waitFor, writeContractAsync],
	);

	/** Approve only when the current allowance is short. */
	const ensureAllowance = useCallback(
		async (amount: bigint) => {
			const account = requireWallet();
			const [balance, allowance] = await Promise.all([
				publicClient!.readContract({
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "balanceOf",
					args: [account],
				}),
				publicClient!.readContract({
					address: USDC_ADDRESS,
					abi: USDC_ABI,
					functionName: "allowance",
					args: [account, ESCROW_ADDRESS],
				}),
			]);
			if (balance < amount) {
				throw new Error(
					`You need ${formatUsdc(amount)} USDC but this wallet holds ${formatUsdc(balance)} USDC on Arc.`,
				);
			}
			if (allowance >= amount) return;

			setTxState("approving");
			const hash = await writeContractAsync({
				address: USDC_ADDRESS,
				abi: USDC_ABI,
				functionName: "approve",
				args: [ESCROW_ADDRESS, amount],
				account,
				chainId: arcChain.id,
			});
			setTxHash(hash);
			setTxState("waiting-approval");
			await waitFor(hash, "USDC approval");
		},
		[publicClient, requireWallet, waitFor, writeContractAsync],
	);

	const readListing = useCallback(
		async (listingId: bigint) =>
			publicClient!.readContract({
				address: ESCROW_ADDRESS,
				abi: ESCROW_ABI,
				functionName: "getListingInventory",
				args: [listingId],
			}),
		[publicClient],
	);

	// ── Seller: lock USDC into a new listing ─────────────────────────────────
	const initiateTrade = useCallback(
		async ({ cryptoAmountUsdc, bankName, accountNo, sortCode = "" }: InitiateTradeParams) => {
			reset();
			try {
				requireWallet();
				const amount = parseUsdc(cryptoAmountUsdc);
				const bankHash = hashBankDetails(bankName, accountNo, sortCode);
				await ensureArc();
				await ensureAllowance(amount);
				const { hash, receipt } = await send(
					"initiateTrade",
					[amount, bankHash],
					"Escrow deposit",
				);

				let tradeId: string | undefined;
				for (const log of receipt.logs) {
					if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
					try {
						const decoded = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
						if (decoded.eventName === "TradeInitiated") {
							tradeId = decoded.args.tradeId.toString();
							break;
						}
					} catch {
						/* not one of ours */
					}
				}
				if (!tradeId) {
					throw new Error(
						`Deposit confirmed (tx ${hash.slice(0, 10)}…) but no TradeInitiated event was found. Check ArcScan before retrying.`,
					);
				}
				setTxState("confirmed");
				return { txHash: hash, tradeId };
			} catch (e) {
				return fail(e);
			}
		},
		[reset, requireWallet, ensureArc, ensureAllowance, send, fail],
	);

	// ── Buyer: take the full remaining listing on-chain ──────────────────────
	const acceptListing = useCallback(
		async (listingId: bigint, expectedUnits?: bigint) => {
			reset();
			try {
				const account = requireWallet();
				const inv = await readListing(listingId);
				if (!inv.active || inv.seller === ZERO_ADDRESS) {
					throw new Error(`Listing #${listingId} has no USDC locked on Arc.`);
				}
				if (inv.seller.toLowerCase() === account.toLowerCase()) {
					throw new Error("You can't take your own listing.");
				}
				if (inv.activeChildTradeId !== 0n) {
					throw new Error("This listing already has an active order on-chain.");
				}
				if (expectedUnits !== undefined && inv.availableAmount < expectedUnits) {
					throw new Error(
						`Only ${formatUsdc(inv.availableAmount)} USDC is still available on-chain.`,
					);
				}
				await ensureArc();
				const { hash } = await send("fundBuyerCollateral", [listingId, 0n], "Order acceptance");
				setTxState("confirmed");
				return hash;
			} catch (e) {
				return fail(e);
			}
		},
		[reset, requireWallet, readListing, ensureArc, send, fail],
	);

	const withdrawInventory = useCallback(
		async (listingId: bigint, amountUnits: bigint) => {
			reset();
			try {
				requireWallet();
				await ensureArc();
				const { hash } = await send(
					"withdrawAvailableInventory",
					[listingId, amountUnits],
					"Inventory withdrawal",
				);
				setTxState("confirmed");
				return hash;
			} catch (e) {
				return fail(e);
			}
		},
		[reset, requireWallet, ensureArc, send, fail],
	);

	const withdrawAllAvailable = useCallback(
		async (listingId: bigint): Promise<Hex | null> => {
			const account = requireWallet();
			const inv = await readListing(listingId);
			if (!inv.active || inv.availableAmount === 0n) return null;
			if (inv.seller.toLowerCase() !== account.toLowerCase()) {
				throw new Error(`Listing #${listingId} belongs to a different wallet.`);
			}
			return withdrawInventory(listingId, inv.availableAmount);
		},
		[requireWallet, readListing, withdrawInventory],
	);

	const simpleWrite = useCallback(
		(functionName: string, what: string) => async (tradeId: bigint) => {
			reset();
			try {
				requireWallet();
				await ensureArc();
				const { hash } = await send(functionName, [tradeId], what);
				setTxState("confirmed");
				return hash;
			} catch (e) {
				return fail(e);
			}
		},
		[reset, requireWallet, ensureArc, send, fail],
	);

	const releaseFunds = simpleWrite("releaseFunds", "Escrow release");

	const releaseIfSellerCan = useCallback(
		async (tradeId: string): Promise<Hex | null> => {
			if (!/^[1-9]\d*$/.test(tradeId) || !address || !publicClient) return null;
			const trade = await publicClient.readContract({
				address: ESCROW_ADDRESS,
				abi: ESCROW_ABI,
				functionName: "getTrade",
				args: [BigInt(tradeId)],
			});
			const releasable = trade.status === 1 || trade.status === 2; // Funded | FiatSent
			if (
				!releasable ||
				trade.buyer === ZERO_ADDRESS ||
				trade.seller.toLowerCase() !== address.toLowerCase()
			) {
				return null;
			}
			return releaseFunds(BigInt(tradeId));
		},
		[address, publicClient, releaseFunds],
	);

	return {
		address,
		isConnected,
		connect,
		disconnect,
		chainId,
		isWrongChain,
		switchToArc,
		txState,
		txHash,
		arcScanUrl: txHash ? ARCSCAN_TX(txHash) : undefined,
		errorMsg,
		isLoading,
		initiateTrade,
		acceptListing,
		withdrawInventory,
		withdrawAllAvailable,
		markFiatSent: simpleWrite("markFiatSent", "Mark fiat sent"),
		releaseFunds,
		raiseDispute: simpleWrite("raiseDispute", "Dispute"),
		releaseIfSellerCan,
		reset,
	};
}

export function useTradeData(tradeId: bigint | null) {
	return useReadContract({
		address: ESCROW_ADDRESS,
		abi: ESCROW_ABI,
		functionName: "getTrade",
		args: tradeId !== null ? [tradeId] : undefined,
		chainId: arcChain.id,
		query: { enabled: tradeId !== null },
	});
}
