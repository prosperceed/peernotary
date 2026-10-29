import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { verifyFlutterwaveTransactionServerSide } from "@/lib/payments/flutterwaveServer";
import { getTradeAuditEvents } from "@/lib/trades/tradeStore";

export async function POST(request: NextRequest) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		await getAuthenticatedUser(expectedAddress);

		const body = (await request.json().catch(() => ({}))) as {
			tradeId?: string;
			txRef?: string;
			flwTransactionId?: number;
			simulatedAmountMinor?: number;
			simulatedCurrency?: string;
		};

		const tradeId = body.tradeId?.trim();
		const txRef = body.txRef?.trim();
		if (!tradeId || !txRef) {
			return NextResponse.json(
				{ error: "MISSING_TRADE_OR_TX_REF" },
				{ status: 400 },
			);
		}

		const { trade, attempt, deduplicated } =
			await verifyFlutterwaveTransactionServerSide({
				tradeId,
				txRef,
				flwTransactionId: body.flwTransactionId,
				simulatedAmountMinor: body.simulatedAmountMinor,
				simulatedCurrency: body.simulatedCurrency,
			});

		return NextResponse.json({
			ok: true,
			deduplicated,
			trade,
			attempt,
			auditEvents: getTradeAuditEvents(tradeId),
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Payment verification failed";
		const status =
			message.includes("Authentication") || message.includes("mismatch")
				? 401
				: message.includes("NOT_FOUND")
					? 404
					: message.includes("REPLAY") || message.includes("MISMATCH")
						? 409
						: 422;
		return NextResponse.json({ error: message }, { status });
	}
}
