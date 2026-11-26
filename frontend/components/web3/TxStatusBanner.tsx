"use client";

import { ArrowUpRight, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TX_STATE_LABEL, type EscrowTxState } from "@/hooks/useEscrow";

interface TxStatusBannerProps {
	txState: EscrowTxState;
	txHash?: `0x${string}`;
	arcScanUrl?: string;
	errorMsg?: string;
	className?: string;
}

/**
 * One-line progress for the wallet → Arc round trip. Renders nothing when idle.
 */
export default function TxStatusBanner({ txState, txHash, arcScanUrl, errorMsg, className }: TxStatusBannerProps) {
	if (txState === "idle") return null;

	const isError = txState === "error";
	const isDone = txState === "confirmed";
	const label = isError ? errorMsg || "Transaction failed" : TX_STATE_LABEL[txState];

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm",
				isError
					? "border-red-200 bg-red-50 text-red-800"
					: isDone
						? "border-accent/20 bg-accent-soft text-accent-ink"
						: "border-line bg-subtle text-ink-2",
				className,
			)}
		>
			{isError ? (
				<CircleAlert size={16} className="shrink-0" />
			) : isDone ? (
				<CheckCircle2 size={16} className="shrink-0" />
			) : (
				<Loader2 size={16} className="shrink-0 animate-spin text-ink-3" />
			)}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{txHash && arcScanUrl && (
				<a
					href={arcScanUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex shrink-0 items-center gap-1 font-mono text-xs underline-offset-2 hover:underline"
				>
					{txHash.slice(0, 8)}…{txHash.slice(-4)}
					<ArrowUpRight size={13} />
				</a>
			)}
		</div>
	);
}
