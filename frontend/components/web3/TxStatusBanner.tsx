"use client";

import { ExternalLink, CheckCircle, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EscrowTxState } from "@/hooks/useEscrow";

interface TxStatusBannerProps {
  txState:    EscrowTxState;
  txHash?:    `0x${string}`;
  arcScanUrl?: string;
  errorMsg?:  string;
  className?: string;
}

const STATE_COPY: Record<EscrowTxState, { label: string; sub: string }> = {
  idle:                  { label: "",                          sub: "" },
  approving:             { label: "Approving USDC spend…",    sub: "Confirm in your wallet" },
  "waiting-approval":    { label: "Broadcasting approval…",   sub: "Waiting for Arc Network" },
  writing:               { label: "Sending transaction…",     sub: "Confirm in your wallet" },
  "waiting-confirmation":{ label: "Awaiting confirmation…",   sub: "Indexing on Arc Chain" },
  confirmed:             { label: "Transaction confirmed ✓",  sub: "View on ArcScan" },
  error:                 { label: "Transaction failed",        sub: "" },
};

export default function TxStatusBanner({
  txState,
  txHash,
  arcScanUrl,
  errorMsg,
  className,
}: TxStatusBannerProps) {
  if (txState === "idle") return null;

  const isLoading  = !["confirmed", "error"].includes(txState);
  const isError    = txState === "error";
  const isSuccess  = txState === "confirmed";
  const { label, sub } = STATE_COPY[txState];

  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-center gap-3 text-xs transition-all duration-300",
        isError
          ? "bg-red-500/8 border-red-500/25 text-red-300"
          : isSuccess
          ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-300"
          : "bg-violet-500/8 border-violet-500/25 text-violet-300",
        className
      )}
    >
      {/* Icon */}
      <div className="shrink-0">
        {isLoading && (
          <Loader2 size={16} className="animate-spin text-violet-400" />
        )}
        {isSuccess && (
          <CheckCircle size={16} className="text-emerald-400" />
        )}
        {isError && (
          <AlertTriangle size={16} className="text-red-400" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="font-medium leading-none mb-1">{label}</div>
        {isError && errorMsg ? (
          <div className="text-red-400/70 text-[10px] truncate">{errorMsg}</div>
        ) : sub ? (
          <div className="opacity-70 text-[10px]">{sub}</div>
        ) : null}
        {txHash && (
          <div className="font-mono text-[10px] opacity-50 truncate mt-0.5">
            {txHash.slice(0, 22)}…{txHash.slice(-6)}
          </div>
        )}
      </div>

      {/* ArcScan link */}
      {arcScanUrl && isSuccess && (
        <a
          href={arcScanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          ArcScan <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

// ─── INLINE TX LOADER (compact, for inside a button area) ────────────────────
interface InlineTxLoaderProps {
  txState:    EscrowTxState;
  arcScanUrl?: string;
  onClose?:   () => void;
}

export function InlineTxLoader({ txState, arcScanUrl, onClose }: InlineTxLoaderProps) {
  if (txState === "idle" || txState === "error") return null;

  const stepLabels: Partial<Record<EscrowTxState, string>> = {
    approving:              "1/3 · Approving USDC…",
    "waiting-approval":     "1/3 · Confirming approval…",
    writing:                "2/3 · Submitting to Arc Chain…",
    "waiting-confirmation": "3/3 · Waiting for block…",
    confirmed:              "✓ Confirmed on Arc Testnet",
  };

  const isSuccess = txState === "confirmed";
  const label     = stepLabels[txState] ?? "";

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {isSuccess ? (
        <CheckCircle size={13} className="text-emerald-400 shrink-0" />
      ) : (
        <Loader2 size={13} className="animate-spin text-violet-400 shrink-0" />
      )}
      <span className={isSuccess ? "text-emerald-300" : "text-violet-300"}>{label}</span>
      {isSuccess && arcScanUrl && (
        <a
          href={arcScanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          View <ArrowRight size={10} />
        </a>
      )}
      {isSuccess && onClose && (
        <button
          onClick={onClose}
          className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
