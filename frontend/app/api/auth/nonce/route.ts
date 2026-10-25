import { NextRequest, NextResponse } from "next/server";
import { createWalletChallenge } from "@/lib/auth/wallet";

export async function GET(request: NextRequest) {
	try {
		const address = request.nextUrl.searchParams.get("address");
		if (!address) return NextResponse.json({ error: "INVALID_ADDRESS" }, { status: 400 });
		return NextResponse.json(await createWalletChallenge(address, request.headers.get("host") ?? undefined));
	} catch (error) {
		console.error("auth nonce GET error", error);
		return NextResponse.json({ error: "INVALID_ADDRESS" }, { status: 400 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).address !== "string") {
			return NextResponse.json({ error: "MALFORMED_REQUEST" }, { status: 400 });
		}
		return NextResponse.json(await createWalletChallenge((body as { address: string }).address, request.headers.get("host") ?? undefined));
	} catch (error) {
		console.error("auth nonce POST error", error);
		return NextResponse.json({ error: "CHALLENGE_FAILED", message: error instanceof Error ? error.message : "Unknown challenge failure" }, { status: 400 });
	}
}
