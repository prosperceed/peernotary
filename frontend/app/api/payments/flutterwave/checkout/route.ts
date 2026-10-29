import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { initializeFlutterwaveStandardCheckout } from "@/lib/payments/flutterwaveServer";
import { getSharedTrade } from "@/lib/trades/tradeStore";

export async function POST(request: NextRequest) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		const body = (await request.json().catch(() => ({}))) as {
			tradeId?: string;
		};

		const tradeId = body.tradeId?.trim();
		if (!tradeId || !/^[1-9][0-9]{0,38}$/.test(tradeId)) {
			return NextResponse.json({ error: "INVALID_TRADE_ID" }, { status: 400 });
		}

		const originUrl =
			process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

		const { attempt, hostedMode } = await initializeFlutterwaveStandardCheckout({
			tradeId,
			buyerAddress: user.walletAddress,
			originUrl,
		});

		const trade = getSharedTrade(tradeId);

		return NextResponse.json({
			ok: true,
			hostedMode,
			tradeId,
			attemptId: attempt.id,
			txRef: attempt.txRef,
			checkoutUrl: attempt.checkoutUrl,
			expectedAmountMinor: attempt.expectedAmountMinor,
			expectedCurrency: attempt.expectedCurrency,
			expiresAt: attempt.expiresAt,
			lifecycleState: trade?.lifecycleState ?? "AWAITING_PAYMENT",
			paymentState: trade?.paymentState ?? "CHECKOUT_CREATED",
			paymentDeadlineAt: trade?.paymentDeadlineAt ?? attempt.expiresAt,
		});
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to initialize checkout";
		const status =
			message.includes("Authentication") || message.includes("mismatch")
				? 401
				: message.includes("SELLER_CANNOT") || message.includes("CALLER_NOT")
					? 403
					: message.includes("EXPIRED") || message.includes("NOT_AWAITING")
						? 409
						: 400;
		return NextResponse.json({ error: message }, { status });
	}
}
