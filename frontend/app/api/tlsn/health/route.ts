import { NextResponse } from "next/server";
import { verifierHealth, getVerifierUrl } from "@/lib/tlsn/client";
import { rustApiClient } from "@/lib/rust";

export async function GET() {
	const connected = await verifierHealth();
	return NextResponse.json(
		{
			connected,
			backend_url: getVerifierUrl(),
			chain_id: rustApiClient.getExpectedChainId(),
			escrow_address: rustApiClient.getEscrowAddress(),
		},
		{ status: connected ? 200 : 503 },
	);
}
