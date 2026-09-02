import { NextRequest, NextResponse } from "next/server";
import { createWalletChallenge } from "@/lib/auth/wallet";

export async function GET(request: NextRequest) {
	try {
		const address = request.nextUrl.searchParams.get("address");
		if (!address) return NextResponse.json({ error: "INVALID_ADDRESS" }, { status: 400 });
		return NextResponse.json(await createWalletChallenge(address));
	} catch {
		return NextResponse.json({ error: "INVALID_ADDRESS" }, { status: 400 });
	}
}
