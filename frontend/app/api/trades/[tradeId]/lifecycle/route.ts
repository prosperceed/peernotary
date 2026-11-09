import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { oracleSettleToBuyer } from "@/lib/oracle/escrow";
import {
	cancelPeerTradeUser,
	getPaymentAttemptByRef,
	getSharedTrade,
	getOrHydrateSharedTrade,
	getTradeAuditEvents,
	reconcileExpiredTrades,
	resolveParentListingId,
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
				let resolvedTxHash = body.txHash;
				let resolvedProofId = body.proofId;
				const sharedTrade =
					(await getOrHydrateSharedTrade(tradeId, user.walletAddress)) ??
					getSharedTrade(tradeId);

				if (
					!resolvedTxHash &&
					sharedTrade?.proofId &&
					sharedTrade?.txHash &&
					/^0x[a-fA-F0-9]{64}$/.test(sharedTrade.txHash)
				) {
					resolvedTxHash = sharedTrade.txHash;
					resolvedProofId = resolvedProofId || sharedTrade.proofId;
				}

				if (!resolvedTxHash && sharedTrade) {
					const proof =
						resolvedProofId && ethers.isHexString(resolvedProofId, 32)
							? resolvedProofId
							: sharedTrade.proofId &&
								  ethers.isHexString(sharedTrade.proofId, 32)
								? sharedTrade.proofId
								: ethers.keccak256(
										ethers.toUtf8Bytes(`PN-RELEASE-${tradeId}-${Date.now()}`),
									);
					resolvedProofId = proof;
					const parentId = resolveParentListingId(tradeId);
					const numericId = /^\d+$/.test(parentId)
						? BigInt(parentId)
						: BigInt(tradeId.replace(/[^0-9]/g, "") || "1001");
					const amtUnits = BigInt(
						sharedTrade.usdcAmountUnits ||
							Math.round(
								(parseFloat(sharedTrade.usdcAmount.replace(/,/g, "") || "1") ||
									1) * 1_000_000,
							),
					);
					const settled = await oracleSettleToBuyer({
						listingId: numericId,
						buyerAddress: sharedTrade.buyerAddress ?? user.walletAddress,
						amountUnits: amtUnits,
						proofId: proof,
					});
					if (settled.transactionHash) {
						resolvedTxHash = settled.transactionHash;
					}
					if (settled.proofIdUsed) {
						resolvedProofId = settled.proofIdUsed;
					}
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
