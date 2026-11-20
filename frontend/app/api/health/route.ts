import { NextResponse } from "next/server";
import { rustApiClient } from "@/lib/rust";

export async function GET() {
	const startTime = Date.now();
	let rustBackendStatus: "healthy" | "degraded" | "unreachable" = "unreachable";
	let rustData: Record<string, unknown> | null = null;
	let latencyMs = 0;

	try {
		const healthRes = await rustApiClient.getHealth();
		latencyMs = Date.now() - startTime;
		rustBackendStatus = "healthy";
		rustData = healthRes as unknown as Record<string, unknown>;
	} catch (err) {
		latencyMs = Date.now() - startTime;
		rustBackendStatus = "unreachable";
		rustData = {
			error: err instanceof Error ? err.message : String(err),
		};
	}

	const response = {
		status: rustBackendStatus === "healthy" ? "ok" : "degraded",
		timestamp: new Date().toISOString(),
		services: {
			frontend_nextjs: "healthy",
			rust_backend: {
				status: rustBackendStatus,
				base_url: rustApiClient.getBaseUrl(),
				latency_ms: latencyMs,
				details: rustData,
			},
		},
		contracts: {
			chain_id: rustApiClient.getExpectedChainId(),
			escrow_address: rustApiClient.getEscrowAddress(),
		},
	};

	return NextResponse.json(response, {
		status: rustBackendStatus === "healthy" ? 200 : 207,
	});
}
