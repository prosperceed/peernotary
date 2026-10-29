"use client";

export interface RealtimeTradeSubscriptionOptions {
	tradeId?: string;
	walletAddress?: string;
	onStatusHint: () => void;
	pollIntervalMs?: number;
}

/**
 * Subscribes to informational trade status updates via Supabase Realtime WebSocket
 * when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured,
 * and always maintains a safe polling fallback that revalidates authoritative state from the server.
 */
export function subscribeToTradeUpdates(
	options: RealtimeTradeSubscriptionOptions,
): () => void {
	const pollMs = options.pollIntervalMs ?? 8_000;
	const intervalId = window.setInterval(() => {
		options.onStatusHint();
	}, pollMs);

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey =
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	let ws: WebSocket | null = null;
	if (supabaseUrl && publishableKey && typeof WebSocket !== "undefined") {
		try {
			const wsBase = supabaseUrl
				.replace(/^https:\/\//i, "wss://")
				.replace(/^http:\/\//i, "ws://")
				.replace(/\/$/, "");
			const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(publishableKey)}&vsn=1.0.0`;
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				ws?.send(
					JSON.stringify({
						topic: "realtime:public:trades",
						event: "phx_join",
						payload: {},
						ref: "1",
					}),
				);
			};

			ws.onmessage = () => {
				// Realtime notifications are strictly informational hints;
				// trigger server revalidation on event receipt.
				options.onStatusHint();
			};
		} catch {
			ws = null;
		}
	}

	return () => {
		window.clearInterval(intervalId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
	};
}
