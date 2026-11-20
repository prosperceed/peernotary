import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { AdminAccessError, requireSuperAdmin } from "@/lib/auth/admin";
import { verifierHealth, getVerifierUrl } from "@/lib/tlsn/client";

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const rpcUrl = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL;
		let chain: { status: string; blockNumber?: number; latencyMs?: number } = { status: "unconfigured" };
		if (rpcUrl) {
			try {
				const started = Date.now();
				const provider = new ethers.JsonRpcProvider(rpcUrl, 5042002, { staticNetwork: true });
				chain = { status: "healthy", blockNumber: await provider.getBlockNumber(), latencyMs: Date.now() - started };
			} catch { chain = { status: "degraded" }; }
		}
		return NextResponse.json({ chain, tlsn: { status: (await verifierHealth()) ? "healthy" : "degraded", endpoint: getVerifierUrl() }, escrowAddress: process.env.ESCROW_ADDRESS || process.env.NEXT_PUBLIC_ESCROW_ADDRESS || null, chainId: 5042002 });
	} catch (error) {
		const status = error instanceof AdminAccessError ? error.status : 500;
		return NextResponse.json({ error: status === 500 ? "ADMIN_DIAGNOSTICS_UNAVAILABLE" : error instanceof Error ? error.message : "Administrator access required" }, { status });
	}
}
