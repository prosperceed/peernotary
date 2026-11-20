import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let posthogLogProvider: LoggerProvider | undefined;

export function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	if (!projectToken) {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				"NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
			);
		}
		return;
	}

	if (!posthogHost) {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				"NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
			);
		}
		return;
	}

	posthogLogProvider = new LoggerProvider({
		resource: resourceFromAttributes({ "service.name": "peerswap-nextjs" }),
		processors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({
					url: `${posthogHost}/i/v1/logs`,
					timeoutMillis: 2_000,
					headers: {
						Authorization: `Bearer ${projectToken}`,
						"Content-Type": "application/json",
					},
				}),
			}),
		],
	});
}

export function getPostHogLogger() {
	return posthogLogProvider?.getLogger("posthog-health");
}

export async function flushPostHogLogs() {
	if (posthogLogProvider) {
		await posthogLogProvider.forceFlush().catch(() => {});
	}
}
