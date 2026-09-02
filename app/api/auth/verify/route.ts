import { NextRequest, NextResponse } from "next/server";
import { signInWallet } from "@/lib/auth/wallet";

export async function POST(request: NextRequest) {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_REQUEST" }, { status: 400 });
		}
		const { address, message, signature } = body as Record<string, unknown>;
		if (
			typeof address !== "string" ||
			typeof message !== "string" ||
			typeof signature !== "string"
		) {
			return NextResponse.json({ error: "MALFORMED_REQUEST" }, { status: 400 });
		}
		await signInWallet(address, message, signature);
		return NextResponse.json({ authenticated: true, address });
	} catch {
		return NextResponse.json({ error: "AUTHENTICATION_FAILED" }, { status: 401 });
	}
}
