import { NextResponse } from "next/server";
import { verifierHealth } from "@/lib/tlsn/client";

export async function GET() {
	const connected = await verifierHealth();
	return NextResponse.json({ connected }, { status: connected ? 200 : 503 });
}
