import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import {
	getPaymentAttemptByRef,
	getSharedTrade,
	getTradeAuditEvents,
	reconcileExpiredTrades,
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
		await getAuthenticatedUser(expectedAddress);
		const { tradeId } = await params;

		reconcileExpiredTrades();
		const trade = getSharedTrade(tradeId);
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
	} catch {
		return NextResponse.json(
			{ error: "AUTHENTICATION_REQUIRED" },
			{ status: 401 },
		);
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
				| "reconcile_deadline";
			txHash?: string;
			proofId?: string;
			reason?: string;
			flwTransferId?: number;
			flwRefundId?: number;
		};

		let updatedTrade = getSharedTrade(tradeId);

		switch (body.operation) {
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
			case "escrow_confirm_on_chain":
				updatedTrade = transitionEscrowReleaseState(
					tradeId,
					"confirm_on_chain",
					{ txHash: body.txHash, proofId: body.proofId },
				);
				break;
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
