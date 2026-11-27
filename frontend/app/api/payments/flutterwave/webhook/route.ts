import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
	verifyFlutterwaveTransactionServerSide,
	verifyFlutterwaveWebhookSignature,
} from "@/lib/payments/flutterwaveServer";
import { getOrHydratePaymentAttempt, markPaymentAttemptFailed } from "@/lib/trades/tradeStore";

export async function POST(request: NextRequest) {
	try {
		const rawBody = await request.text();
		const verifHash = request.headers.get("verif-hash");
		const hmacSignature =
			request.headers.get("flutterwave-signature") ??
			request.headers.get("x-flutterwave-signature");

		if (
			!verifyFlutterwaveWebhookSignature({
				verifHashHeader: verifHash,
				hmacSignatureHeader: hmacSignature,
				rawBody,
			})
		) {
			return NextResponse.json(
				{ error: "INVALID_FLW_WEBHOOK_SIGNATURE" },
				{ status: 401 },
			);
		}

		const payload = JSON.parse(rawBody) as {
			id?: string;
			event?: string;
			data?: {
				id?: number;
				tx_ref?: string;
				amount?: number | string;
				currency?: string;
				status?: string;
			};
		};

		const data = payload.data;
		if (!data || typeof data.tx_ref !== "string") {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}

		const txRef = data.tx_ref.trim();
		const flwTxId = Number(data.id ?? 0);
		const statusStr = (data.status ?? "").toLowerCase();

		const eventId =
			payload.id ||
			createHash("sha256")
				.update(`${payload.event ?? "charge.completed"}:${flwTxId}:${txRef}:${statusStr}`)
				.digest("hex");

		const attempt = await getOrHydratePaymentAttempt(txRef);
		if (!attempt) {
			return NextResponse.json({
				received: true,
				processingStatus: "IGNORED_UNKNOWN_TX_REF",
			});
		}

		if (statusStr === "failed" || statusStr === "cancelled") {
			markPaymentAttemptFailed(txRef, `Provider reported the charge as ${statusStr}`);
			return NextResponse.json({ received: true, eventId, processingStatus: "MARKED_FAILED" });
		}
		if (statusStr !== "successful") {
			return NextResponse.json({
				received: true,
				eventId,
				processingStatus: `NON_SUCCESS_STATUS_${statusStr.toUpperCase()}`,
			});
		}

		// The webhook is only a signal. Value is given after Flutterwave's own API
		// confirms the charge (amount, currency, reference), as Flutterwave advises.
		// This records the payment and releases the escrow; it is idempotent.
		const { trade: finalTrade, deduplicated } = await verifyFlutterwaveTransactionServerSide({
			tradeId: attempt.tradeId,
			txRef,
			flwTransactionId: flwTxId || undefined,
		});

		return NextResponse.json({
			received: true,
			deduplicated,
			eventId,
			tradeId: finalTrade.tradeId,
			lifecycleState: finalTrade.lifecycleState,
			paymentState: finalTrade.paymentState,
			status: finalTrade.status,
			escrowState: finalTrade.escrowState,
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Webhook processing failed";
		// 5xx makes Flutterwave retry; the payment watcher also picks it up.
		console.error("flutterwave webhook processing failed:", message);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
