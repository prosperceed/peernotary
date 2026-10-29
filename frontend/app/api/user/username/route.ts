import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, setWalletUsername } from "@/lib/auth/wallet";

export async function GET(request: NextRequest) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		return NextResponse.json({
			walletAddress: user.walletAddress,
			username: user.username ?? null,
			onboardingCompleted: user.onboardingCompleted,
		});
	} catch {
		return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
	}
}

export async function PUT(request: NextRequest) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		const body = (await request.json().catch(() => ({}))) as {
			username?: string;
			skipOnboarding?: boolean;
		};

		const updated = await setWalletUsername(user.walletAddress, {
			username: body.username,
			skipOnboarding: body.skipOnboarding,
		});

		return NextResponse.json({
			ok: true,
			user: {
				id: updated.id,
				walletAddress: updated.walletAddress,
				username: updated.username ?? null,
				onboardingCompleted: updated.onboardingCompleted,
			},
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Could not update username.";
		const status = msg.includes("Authentication") || msg.includes("mismatch")
			? 401
			: msg.includes("already taken")
				? 409
				: msg.includes("reserved")
					? 403
					: 400;
		return NextResponse.json({ error: msg }, { status });
	}
}
