import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { oracleSettleToBuyer, paymentProofId, verifyEscrowTx } from "@/lib/oracle/escrow";
import { settleAndReleaseEscrowAfterPaymentConfirmed } from "@/lib/payments/flutterwaveServer";
import { reconcilePayments } from "@/lib/payments/watcher";
import {
	cancelPeerTradeUser,
	getProviderConfirmedPayment,
	getPaymentAttemptByRef,
	getSharedTrade,
	getOrHydrateSharedTrade,
	getTradeAuditEvents,
	reconcileExpiredTrades,
	resolveOnChainListingId,
	transitionEscrowReleaseState,
	transitionSellerPayoutState,
	transitionTradeRefundState,
} from "@/lib/trades/tradeStore";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		if (expectedAddress) {
			try {
				await getAuthenticatedUser(expectedAddress);
			} catch {
				// Proceed with trade lookup even if session challenge signature is pending
			}
		}
		const { tradeId } = await params;

		reconcileExpiredTrades();
		const trade = await getOrHydrateSharedTrade(tradeId, expectedAddress);
		if (!trade) {
			return NextResponse.json({ error: "TRADE_NOT_FOUND" }, { status: 404 });
		}

		// Nudge the payment watcher for this order (throttled, non-blocking) so a
		// completed payment is picked up even if the webhook is late or missing.
		if (trade.activeTxRef && trade.lifecycleState !== "COMPLETED") {
			void reconcilePayments({ tradeId }).catch(() => {});
		}

		const attempt = trade.activeTxRef
			? getPaymentAttemptByRef(trade.activeTxRef)
			: undefined;

		return NextResponse.json({
			trade,
			attempt: attempt ?? null,
			auditEvents: getTradeAuditEvents(tradeId),
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to load trade lifecycle";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ tradeId: string }> },
) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		const { tradeId } = await params;

		const body = (await request.json().catch(() => ({}))) as {
			operation?:
				| "payout_initiate"
				| "payout_confirm"
				| "payout_hold"
				| "refund_request"
				| "refund_complete"
				| "escrow_request_release"
				| "escrow_confirm_on_chain"
				| "escrow_hold_revert"
				| "reconcile_deadline"
				| "cancel";
			txHash?: string;
			proofId?: string;
			reason?: string;
			flwTransferId?: number;
			flwRefundId?: number;
		};

		let updatedTrade = await getOrHydrateSharedTrade(
			tradeId,
			user.walletAddress,
		);

		// Only the order's buyer or seller may act on it, and only through the
		// operations a person legitimately performs. Payout, refund completion and
		// release bookkeeping are driven by the server (webhook / payment watcher).
		const callerAddr = user.walletAddress.toLowerCase();
		const callerIsSeller = updatedTrade?.sellerAddress.toLowerCase() === callerAddr;
		const callerIsBuyer = updatedTrade?.buyerAddress?.toLowerCase() === callerAddr;
		const SERVER_ONLY = new Set(["refund_complete", "escrow_request_release", "escrow_hold_revert", "payout_hold"]);
		const SELLER_ONLY = new Set(["payout_initiate", "payout_confirm"]);
		if (body.operation && body.operation !== "cancel") {
			if (!updatedTrade) throw new Error("TRADE_NOT_FOUND");
			if (!callerIsSeller && !callerIsBuyer) {
				throw new Error("Authentication mismatch: not a party to this trade");
			}
			if (SERVER_ONLY.has(body.operation)) {
				return NextResponse.json({ error: "OPERATION_NOT_ALLOWED" }, { status: 403 });
			}
			if (SELLER_ONLY.has(body.operation) && !callerIsSeller) {
				return NextResponse.json({ error: "OPERATION_NOT_ALLOWED" }, { status: 403 });
			}
		}

		switch (body.operation) {
			case "cancel":
				updatedTrade = cancelPeerTradeUser(
					tradeId,
					user.walletAddress,
					body.reason,
				);
				break;
			case "payout_initiate":
				updatedTrade = transitionSellerPayoutState(tradeId, "initiate");
				break;
			case "payout_confirm":
				updatedTrade = transitionSellerPayoutState(tradeId, "confirm", {
					flwTransferId: body.flwTransferId,
				});
				break;
			case "payout_hold":
				updatedTrade = transitionSellerPayoutState(tradeId, "hold", {
					failureReason: body.reason,
				});
				break;
			case "refund_request":
				updatedTrade = transitionTradeRefundState(
					tradeId,
					"request",
					user.walletAddress,
					{ reason: body.reason },
				);
				break;
			case "refund_complete":
				updatedTrade = transitionTradeRefundState(
					tradeId,
					"approve_and_complete",
					user.walletAddress,
					{ flwRefundId: body.flwRefundId },
				);
				break;
			case "escrow_request_release":
				updatedTrade = transitionEscrowReleaseState(
					tradeId,
					"request_release",
					{ txHash: body.txHash, proofId: body.proofId },
				);
				break;
			case "escrow_confirm_on_chain": {
				const sharedTrade =
					(await getOrHydrateSharedTrade(tradeId, user.walletAddress)) ??
					getSharedTrade(tradeId);
				if (!sharedTrade) throw new Error("TRADE_NOT_FOUND");

				const caller = user.walletAddress.toLowerCase();
				const isSeller = sharedTrade.sellerAddress.toLowerCase() === caller;
				const isBuyer = sharedTrade.buyerAddress?.toLowerCase() === caller;
				if (!isSeller && !isBuyer) throw new Error("Authentication mismatch: not a party to this trade");

				let resolvedTxHash: string | undefined;
				let resolvedProofId = sharedTrade.proofId;

				if (body.txHash) {
					// Client says it released on-chain itself: prove it on Arc.
					if (!(await verifyEscrowTx(body.txHash, ["TradeCompleted"]))) {
						throw new Error("TX_NOT_VERIFIED: transaction is not a confirmed escrow release on Arc");
					}
					resolvedTxHash = body.txHash;
				} else if (sharedTrade.txHash && sharedTrade.lifecycleState === "COMPLETED") {
					resolvedTxHash = sharedTrade.txHash;
				} else {
					const confirmed = getProviderConfirmedPayment(tradeId);
					if (confirmed) {
						// Provider-confirmed payment: same idempotent settlement the
						// webhook and payment watcher use (one proof id per payment).
						updatedTrade = await settleAndReleaseEscrowAfterPaymentConfirmed({
							tradeId,
							txRef: confirmed.txRef,
							flwTxId: confirmed.flwTxId ?? 0,
						});
						break;
					}
					if (!isSeller) {
						throw new Error(
							"PAYMENT_NOT_CONFIRMED_BY_PROVIDER: the payment provider hasn't confirmed this payment yet",
						);
					}
					// The seller chose to release their own USDC without a provider payment.
					const listingId = resolveOnChainListingId(tradeId);
					if (listingId === null || !sharedTrade.buyerAddress) {
						throw new Error("This trade has no on-chain escrow to release");
					}
					const proof = paymentProofId("SELLER-RELEASE", tradeId, sharedTrade.activeTxRef ?? sharedTrade.id);
					const settled = await oracleSettleToBuyer({
						listingId,
						buyerAddress: sharedTrade.buyerAddress,
						amountUnits: BigInt(sharedTrade.usdcAmountUnits),
						proofId: proof,
					});
					resolvedTxHash = settled.transactionHash ?? sharedTrade.txHash;
					resolvedProofId = settled.proofIdUsed ?? proof;
				}

				updatedTrade = transitionEscrowReleaseState(
					tradeId,
					"confirm_on_chain",
					{ txHash: resolvedTxHash, proofId: resolvedProofId },
				);
				break;
			}
			case "escrow_hold_revert":
				updatedTrade = transitionEscrowReleaseState(tradeId, "hold_revert", {
					txHash: body.txHash,
					failureReason: body.reason,
				});
				break;
			case "reconcile_deadline":
				reconcileExpiredTrades();
				updatedTrade = getSharedTrade(tradeId);
				break;
			default:
				return NextResponse.json(
					{ error: "INVALID_LIFECYCLE_OPERATION" },
					{ status: 400 },
				);
		}

		return NextResponse.json({
			ok: true,
			trade: updatedTrade ?? null,
			auditEvents: getTradeAuditEvents(tradeId),
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Lifecycle operation failed";
		const status =
			message.includes("Authentication") || message.includes("mismatch")
				? 401
				: message.includes("NOT_FOUND")
					? 404
					: 409;
		return NextResponse.json({ error: message }, { status });
	}
}
