import { NextResponse } from "next/server";
import { logoutWallet } from "@/lib/auth/wallet";

export async function POST() {
	try {
		await logoutWallet();
		return NextResponse.json({ authenticated: false });
	} catch {
		return NextResponse.json({ error: "LOGOUT_FAILED" }, { status: 500 });
	}
}