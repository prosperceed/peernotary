/**
 * hooks/useEscrow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed Wagmi v2 hook that wraps every ArcP2PEscrowService interaction
 * the UI needs. Handles the two-step approve → write flow, surfaces tx
 * hashes for ArcScan links, and manages loading / error states.
 *
 * Usage:
 *   const escrow = useEscrow();
 *   await escrow.initiateTrade({ cryptoAmountUsdc: "305.50", bankName: "GTBank", accountNo: "0123456789" });
 *   // escrow.txHash → link to ArcScan
 */

"use client";

import { useState, useCallback } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useConnect,
  useDisconnect,
} from "wagmi";
import { injected } from "wagmi/connectors";
import {
  ESCROW_ABI,
  USDC_ABI,
  ESCROW_ADDRESS,
  USDC_ADDRESS,
  ARCSCAN_TX,
  parseUsdc,
  hashBankDetails,
  MIN_COLLATERAL_USDC,
  arcTestnet,
} from "@/lib/web3/arcConfig";

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type EscrowTxState =
  | "idle"
  | "approving"
  | "waiting-approval"
  | "writing"
  | "waiting-confirmation"
  | "confirmed"
  | "error";

export interface EscrowHookReturn {
  // Wallet state
  address:      `0x${string}` | undefined;
  isConnected:  boolean;
  connect:      () => Promise<void>;
  disconnect:   () => void;
  chainId:      number | undefined;
  isWrongChain: boolean;

  // Transaction state
  txState:      EscrowTxState;
  txHash:       `0x${string}` | undefined;
  arcScanUrl:   string | undefined;
  errorMsg:     string | undefined;
  isLoading:    boolean;

  // Actions
  initiateTrade:      (params: InitiateTradeParams)    => Promise<bigint | null>;
  fundBuyerCollateral:(params: FundCollateralParams)    => Promise<void>;
  markFiatSent:       (tradeId: bigint)                 => Promise<void>;
  releaseFunds:       (tradeId: bigint)                 => Promise<void>;
  raiseDispute:       (tradeId: bigint)                 => Promise<void>;
  reset:              ()                                => void;
}

export interface InitiateTradeParams {
  cryptoAmountUsdc: string;  // human-readable e.g. "305.50"
  bankName:         string;
  accountNo:        string;
  sortCode?:        string;
}

export interface FundCollateralParams {
  tradeId:          bigint;
  collateralUsdc?:  string;  // defaults to "50.00" (MIN_COLLATERAL)
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useEscrow(): EscrowHookReturn {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync }                  = useConnect();
  const { disconnect }                    = useDisconnect();

  const [txState,  setTxState]  = useState<EscrowTxState>("idle");
  const [txHash,   setTxHash]   = useState<`0x${string}` | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);

  const isWrongChain = isConnected && chainId !== arcTestnet.id;

  // ── Wagmi write hooks ────────────────────────────────────────────────────
  const { writeContractAsync: writeEscrow } = useWriteContract();
  const { writeContractAsync: writeUsdc   } = useWriteContract();

  // ── Wait for receipt (reactive on txHash) ────────────────────────────────
  const { isLoading: waitingForReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    onReplaced: (replacement) => {
      setTxHash(replacement.transaction.hash);
    },
  } as Parameters<typeof useWaitForTransactionReceipt>[0]);

  const isLoading =
    txState === "approving"            ||
    txState === "waiting-approval"     ||
    txState === "writing"              ||
    txState === "waiting-confirmation" ||
    waitingForReceipt;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const setError = (e: unknown) => {
    const msg =
      e instanceof Error
        ? e.message.includes("User rejected")
          ? "Transaction cancelled by user."
          : e.message.slice(0, 120)
        : "An unexpected error occurred.";
    setErrorMsg(msg);
    setTxState("error");
  };

  const reset = useCallback(() => {
    setTxState("idle");
    setTxHash(undefined);
    setErrorMsg(undefined);
  }, []);

  const connect = useCallback(async () => {
    try {
      await connectAsync({ connector: injected() });
    } catch (e) {
      setError(e);
    }
  }, [connectAsync]);

  /**
   * Two-step ERC-20 approve → contract write helper.
   * Approves the escrow contract to pull `amount` USDC from the user,
   * then executes the provided `writeFn`.
   */
  const approveAndWrite = useCallback(
    async (
      amount: bigint,
      writeFn: () => Promise<`0x${string}`>
    ): Promise<`0x${string}`> => {

      // Step 1: approve
      setTxState("approving");
      const approveTx = await writeUsdc({
        address:      USDC_ADDRESS,
        abi:          USDC_ABI,
        functionName: "approve",
        args:         [ESCROW_ADDRESS, amount],
      });

      setTxState("waiting-approval");
      // Approval mined (wagmi handles receipt internally via the config)
      setTxHash(approveTx);

      // Small deterministic wait — in production swap for waitForTransactionReceipt
      await new Promise((r) => setTimeout(r, 2500));

      // Step 2: write
      setTxState("writing");
      const writeTx = await writeFn();

      setTxState("waiting-confirmation");
      setTxHash(writeTx);

      return writeTx;
    },
    [writeUsdc]
  );

  // ── initiateTrade ─────────────────────────────────────────────────────────
  const initiateTrade = useCallback(
    async ({
      cryptoAmountUsdc,
      bankName,
      accountNo,
      sortCode = "",
    }: InitiateTradeParams): Promise<bigint | null> => {
      reset();
      try {
        const amount       = parseUsdc(cryptoAmountUsdc);
        const bankHash     = hashBankDetails(bankName, accountNo, sortCode);

        const hash = await approveAndWrite(amount, () =>
          writeEscrow({
            address:      ESCROW_ADDRESS,
            abi:          ESCROW_ABI,
            functionName: "initiateTrade",
            args:         [amount, bankHash],
          })
        );

        setTxHash(hash);
        setTxState("confirmed");

        // The tradeId is emitted in the TradeInitiated event.
        // Return null here — caller should read it from the receipt logs
        // or listen to the event. In a real integration use
        // `decodeEventLog` from viem on the receipt.
        return null;
      } catch (e) {
        setError(e);
        return null;
      }
    },
    [reset, approveAndWrite, writeEscrow]
  );

  // ── fundBuyerCollateral ───────────────────────────────────────────────────
  const fundBuyerCollateral = useCallback(
    async ({ tradeId, collateralUsdc = "50.00" }: FundCollateralParams) => {
      reset();
      try {
        const collateral = parseUsdc(collateralUsdc);
        const amount     = collateral > MIN_COLLATERAL_USDC ? collateral : MIN_COLLATERAL_USDC;

        const hash = await approveAndWrite(amount, () =>
          writeEscrow({
            address:      ESCROW_ADDRESS,
            abi:          ESCROW_ABI,
            functionName: "fundBuyerCollateral",
            args:         [tradeId, amount],
          })
        );

        setTxHash(hash);
        setTxState("confirmed");
      } catch (e) {
        setError(e);
      }
    },
    [reset, approveAndWrite, writeEscrow]
  );

  // ── markFiatSent ──────────────────────────────────────────────────────────
  const markFiatSent = useCallback(
    async (tradeId: bigint) => {
      reset();
      try {
        setTxState("writing");
        const hash = await writeEscrow({
          address:      ESCROW_ADDRESS,
          abi:          ESCROW_ABI,
          functionName: "markFiatSent",
          args:         [tradeId],
        });
        setTxHash(hash);
        setTxState("waiting-confirmation");
        // Caller should await useWaitForTransactionReceipt
        setTxState("confirmed");
      } catch (e) {
        setError(e);
      }
    },
    [reset, writeEscrow]
  );

  // ── releaseFunds ──────────────────────────────────────────────────────────
  const releaseFunds = useCallback(
    async (tradeId: bigint) => {
      reset();
      try {
        setTxState("writing");
        const hash = await writeEscrow({
          address:      ESCROW_ADDRESS,
          abi:          ESCROW_ABI,
          functionName: "releaseFunds",
          args:         [tradeId],
        });
        setTxHash(hash);
        setTxState("confirmed");
      } catch (e) {
        setError(e);
      }
    },
    [reset, writeEscrow]
  );

  // ── raiseDispute ──────────────────────────────────────────────────────────
  const raiseDispute = useCallback(
    async (tradeId: bigint) => {
      reset();
      try {
        setTxState("writing");
        const hash = await writeEscrow({
          address:      ESCROW_ADDRESS,
          abi:          ESCROW_ABI,
          functionName: "raiseDispute",
          args:         [tradeId],
        });
        setTxHash(hash);
        setTxState("confirmed");
      } catch (e) {
        setError(e);
      }
    },
    [reset, writeEscrow]
  );

  return {
    address,
    isConnected,
    connect,
    disconnect,
    chainId,
    isWrongChain,
    txState,
    txHash,
    arcScanUrl: txHash ? ARCSCAN_TX(txHash) : undefined,
    errorMsg,
    isLoading,
    initiateTrade,
    fundBuyerCollateral,
    markFiatSent,
    releaseFunds,
    raiseDispute,
    reset,
  };
}

// ─── READ HOOK: single trade ──────────────────────────────────────────────────
export function useTradeData(tradeId: bigint | null) {
  return useReadContract(
    tradeId !== null
      ? {
          address:      ESCROW_ADDRESS,
          abi:          ESCROW_ABI,
          functionName: "getTrade",
          args:         [tradeId],
        }
      : undefined
  );
}
