import { NextRequest, NextResponse } from "next/server";
import { recordAuthenticationFailure, signInWallet } from "@/lib/auth/wallet";

export async function POST(request: NextRequest) {
	try {
		const body: unknown = await request.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "MALFORMED_REQUEST" }, { status: 400 });
		}
		const { address, nonce, signature } = body as Record<string, unknown>;
		if (
			typeof address !== "string" ||
			typeof nonce !== "string" ||
			typeof signature !== "string"
		) {
			return NextResponse.json({ error: "MALFORMED_REQUEST" }, { status: 400 });
		}
		const { session, user } = await signInWallet(address, nonce, signature);
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
				walletAddress: session.address,
				username: user.username ?? null,
				onboardingCompleted: user.onboardingCompleted,
				privileges: user.privileges,
			},
		});
	} catch {
		await recordAuthenticationFailure();
		return NextResponse.json({ error: "AUTHENTICATION_FAILED" }, { status: 401 });
	}
}
