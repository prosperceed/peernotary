import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSessionAndUser } from "@/lib/auth/wallet";

export async function GET(request: NextRequest) {
	try {
		const expectedAddress =
			request.headers.get("x-wallet-address") ||
			request.nextUrl.searchParams.get("address") ||
			undefined;
		const { session, user } =
			await getAuthenticatedSessionAndUser(expectedAddress);
		return NextResponse.json({
			authenticated: true,
			session: {
				id: session.id,
				chainId: session.chainId,
				expiresAt: session.expiresAt.toISOString(),
				supabaseAccessToken: session.supabaseAccessToken,
				privileges: session.privileges,
			},
			user: {
				id: user.id,
				walletAddress: user.walletAddress,
				username: user.username ?? null,
				onboardingCompleted: user.onboardingCompleted,
				privileges: user.privileges,
				createdAt: user.createdAt,
			},
		});
	} catch {
		return NextResponse.json({
			authenticated: false,
			session: null,
			user: null,
		});
	}
}
