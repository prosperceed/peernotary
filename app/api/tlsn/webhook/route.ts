import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");

		if (authHeader !== `Bearer ${process.env.TLSN_WEBHOOK_SECRET}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();

		console.log("TLSNotary webhook received");

		const {
			sessionId,
			sessionData,
			server_name,
			redactedTranscript,
			revealConfig,
		} = body;

		console.log({
			sessionId,
			sessionData,
			server_name,
		});

		return NextResponse.json({
			received: true,
			sessionId,
		});
	} catch (error) {
		console.error("TLSN webhook error:", error);

		return NextResponse.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
