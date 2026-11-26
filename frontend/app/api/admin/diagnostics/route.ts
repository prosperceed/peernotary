import { APP_NETWORK, NETWORK } from "@/lib/env/network";
import { getServerNetworkSecrets } from "@/lib/env/serverSecrets";
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { AdminAccessError, requireSuperAdmin } from "@/lib/auth/admin";
import { verifierHealth, getVerifierUrl } from "@/lib/tlsn/client";

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const rpcUrl = getServerNetworkSecrets().rpcUrl;
		let chain: { status: string; blockNumber?: number; latencyMs?: number } = { status: "unconfigured" };
		if (rpcUrl) {
			try {
				const started = Date.now();
				const provider = new ethers.JsonRpcProvider(rpcUrl, NETWORK.chainId, { staticNetwork: true });
				chain = { status: "healthy", blockNumber: await provider.getBlockNumber(), latencyMs: Date.now() - started };
			} catch { chain = { status: "degraded" }; }
		}
		return NextResponse.json({ chain, tlsn: { status: (await verifierHealth()) ? "healthy" : "degraded", endpoint: getVerifierUrl() }, escrowAddress: NETWORK.escrowAddress, chainId: NETWORK.chainId, network: APP_NETWORK });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_DIAGNOSTICS_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}
