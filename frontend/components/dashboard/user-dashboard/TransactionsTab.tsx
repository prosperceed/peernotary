"use client";

import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { ARCSCAN_TX } from "@/lib/web3/arcConfig";
import { cn } from "@/lib/utils";
import type { TxCategory, UserTransaction } from "@/types";

interface TransactionsTabProps {
	transactions: UserTransaction[];
	txTypeFilter: TxCategory | "all";
	setTxTypeFilter: (filter: TxCategory | "all") => void;
	txSearch: string;
	setTxSearch: (search: string) => void;
	cancellingTradeId: string | null;
	onCancelTrade: (tradeId: string) => void;
}

export function TransactionsTab({
	transactions,
	txTypeFilter,
	setTxTypeFilter,
	txSearch,
	setTxSearch,
	cancellingTradeId,
	onCancelTrade,
}: TransactionsTabProps) {
	return (
		<div className="rounded-xl border border-line bg-surface p-6 shadow-card space-y-4">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-1.5">
					{(["all", "buy", "sell", "release"] as const).map((t) => (
						<button
							key={t}
							onClick={() => setTxTypeFilter(t)}
							className={cn(
								"rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors capitalize",
								txTypeFilter === t
									? "bg-raised text-white"
									: "bg-subtle text-ink-2 hover:bg-accent-soft",
							)}
						>
							{t}
						</button>
					))}
				</div>

				<div className="relative w-full sm:w-64">
					<Search
						size={13}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
					/>
					<input
						type="text"
						value={txSearch}
						onChange={(e) => setTxSearch(e.target.value)}
						placeholder="Search by ID or bank..."
						className="w-full pl-8 pr-3 py-2 rounded-full border border-line text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
					/>
				</div>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-xs text-left">
					<thead>
						<tr className="border-b border-subtle text-ink-3">
							<th className="py-3 px-4 font-medium">Trade</th>
							<th className="py-3 px-4 font-medium">Type</th>
							<th className="py-3 px-4 font-medium">Counterparty</th>
							<th className="py-3 px-4 font-medium">Rail</th>
							<th className="py-3 px-4 font-medium text-right">Amount</th>
							<th className="py-3 px-4 font-medium text-center">Status</th>
							<th className="py-3 px-4 font-medium text-right">Explorer</th>
							<th className="py-3 px-4 font-medium text-right">Action</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-subtle">
						{transactions.length === 0 ? (
							<tr>
								<td colSpan={8} className="py-8 text-center text-ink-3">
									No transactions found matching your filter criteria.
								</td>
							</tr>
						) : (
							transactions.map((tx) => (
								<tr
									key={tx.id}
									className="hover:bg-surface transition-colors"
								>
									<td className="py-3 px-4 font-mono font-semibold text-ink">
										#{tx.tradeId}
									</td>
									<td className="py-3 px-4 capitalize font-semibold text-ink-2">
										{tx.type}
									</td>
									<td className="py-3 px-4 text-ink">
										<div>{tx.counterparty}</div>
										<div className="text-[11px] text-ink-3 font-mono">
											{tx.counterpartyAddress ? (
												<>
													{tx.counterpartyAddress.slice(0, 6)}...
													{tx.counterpartyAddress.slice(-4)}
												</>
											) : (
												tx.counterparty
											)}
										</div>
									</td>
									<td className="py-3 px-4 text-ink">{tx.bankName}</td>
									<td className="py-3 px-4 font-mono font-semibold text-right text-ink">
										<div>{tx.usdcAmount} USDC</div>
										<div className="text-[11px] text-ink-3">
											{tx.ngnAmount}
										</div>
									</td>
									<td className="py-3 px-4 text-center">
										<span
											className={cn(
												"px-2.5 py-0.5 rounded-md text-[11px] font-semibold capitalize",
												tx.status === "completed" &&
													"bg-green-50 text-green-700",
												tx.status === "escrow" && "bg-amber-50 text-amber-700",
												tx.status === "disputed" && "bg-red-50 text-red-700",
												tx.status === "pending" && "bg-zinc-100 text-zinc-700",
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
												className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
											>
												<span>
													{tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
												</span>
												<ArrowUpRight size={11} />
											</a>
										) : (
											<span className="text-ink-3 text-xs">N/A</span>
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
														className="rounded-md px-3 py-1 text-xs font-semibold bg-accent text-white hover:bg-accent-hover"
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
														onClick={() => onCancelTrade(tx.tradeId)}
														disabled={cancellingTradeId === tx.tradeId}
														className="rounded-md px-2.5 py-1 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
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
	);
}
