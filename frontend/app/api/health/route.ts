import { SeverityNumber } from "@opentelemetry/api-logs";
import { after, NextResponse } from "next/server";
import { flushPostHogLogs, getPostHogLogger } from "@/instrumentation";
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

	const logger = getPostHogLogger();
	const isRustBackendHealthy = rustBackendStatus === "healthy";

	logger?.emit({
		body: isRustBackendHealthy
			? "health check completed with Rust backend healthy"
			: "health check completed with Rust backend degraded",
		severityNumber: isRustBackendHealthy
			? SeverityNumber.INFO
			: SeverityNumber.WARN,
		attributes: {
			route: "/api/health",
			rust_backend_status: rustBackendStatus,
			latency_ms: latencyMs,
		},
	});

	after(async () => {
		await flushPostHogLogs();
	});

	const response = {
		status: isRustBackendHealthy ? "ok" : "degraded",
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
