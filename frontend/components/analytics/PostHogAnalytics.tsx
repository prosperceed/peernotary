"use client";

import Script from "next/script";

type PostHogWindow = Window & {
	posthog?: {
		init: (key: string, options: { api_host: string; capture_pageview: string; persistence: string }) => void;
	};
};

export default function PostHogAnalytics() {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
	if (!key) return null;

	return (
		<Script
			id="posthog-loader"
			src={`${host.replace(/\/$/, "")}/static/array.js`}
			strategy="afterInteractive"
			onLoad={() => {
				(window as PostHogWindow).posthog?.init(key, {
					api_host: host,
					capture_pageview: "history_change",
					persistence: "localStorage",
				});
			}}
		/>
	);
}
