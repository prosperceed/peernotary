import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";

export async function GET() {
	try {
		const user = await getAuthenticatedUser();
		return NextResponse.json({ authenticated: true, user: { walletAddress: user.walletAddress, createdAt: user.createdAt } });
	} catch {
		return NextResponse.json({ authenticated: false, user: null });
	}
}