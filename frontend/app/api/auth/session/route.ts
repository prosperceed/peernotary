import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";

export async function GET(request: NextRequest) {
	try {
		const expectedAddress =
			request.headers.get("x-wallet-address") ||
			request.nextUrl.searchParams.get("address") ||
			undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		return NextResponse.json({
			authenticated: true,
			user: {
				id: user.id,
				walletAddress: user.walletAddress,
				username: user.username ?? null,
				onboardingCompleted: user.onboardingCompleted,
				createdAt: user.createdAt,
			},
		});
	} catch {
		return NextResponse.json({ authenticated: false, user: null });
	}
}
