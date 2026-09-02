import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const secret = process.env.TLSN_WEBHOOK_SECRET;
		const authHeader = request.headers.get("authorization");

		if (!secret || authHeader !== `Bearer ${secret}`) {
			return NextResponse.json({ error: "WEBHOOK_UNAUTHORIZED" }, { status: 401 });
		}

		const body = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_WEBHOOK" }, { status: 400 });
		}
		if (!process.env.AUTHENTICATION_PROVIDER || !process.env.DATABASE_URL) {
			return NextResponse.json(
				{ error: "WEBHOOK_NOT_CONFIGURED" },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: "WEBHOOK_PROCESSOR_NOT_IMPLEMENTED" }, { status: 503 });
	} catch (error) {
		console.error("TLSN webhook rejected", error instanceof Error ? error.name : "unknown");

		return NextResponse.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
