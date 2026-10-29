import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
	parseDecimalToMinorUnits,
	verifyFlutterwaveWebhookSignature,
} from "@/lib/payments/flutterwaveServer";
import {
	getPaymentAttemptByRef,
	recordVerifiedFlutterwavePayment,
} from "@/lib/trades/tradeStore";

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

		const attempt = getPaymentAttemptByRef(txRef);
		if (!attempt) {
			return NextResponse.json({
				received: true,
				processingStatus: "IGNORED_UNKNOWN_TX_REF",
			});
		}

		if (statusStr !== "successful") {
			return NextResponse.json({
				received: true,
				eventId,
				processingStatus: `NON_SUCCESS_STATUS_${statusStr.toUpperCase()}`,
			});
		}

		const amountMinor = parseDecimalToMinorUnits(data.amount ?? 0);
		const currency = (data.currency ?? "NGN").toUpperCase();

		const { trade, deduplicated } = recordVerifiedFlutterwavePayment({
			tradeId: attempt.tradeId,
			txRef,
			flwTxId,
			amountMinor,
			currency,
			source: "webhook",
			eventId,
		});

		return NextResponse.json({
			received: true,
			deduplicated,
			eventId,
			tradeId: trade.tradeId,
			lifecycleState: trade.lifecycleState,
			paymentState: trade.paymentState,
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Webhook processing failed";
		return NextResponse.json({ error: message }, { status: 422 });
	}
}
