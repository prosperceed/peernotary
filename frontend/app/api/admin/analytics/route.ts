import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireSuperAdmin } from "@/lib/auth/admin";

const EMPTY = { daily: [], regions: [], totalVisitors: 0, totalPageviews: 0 };

type PostHogRow = [string | number | null, string | number | null, string | number | null];

async function queryPostHog(query: string): Promise<PostHogRow[]> {
	const host = (process.env.POSTHOG_API_HOST || process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
	const projectId = process.env.POSTHOG_PROJECT_ID;
	const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
	if (!projectId || !apiKey) return [];

	const response = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
		cache: "no-store",
		signal: AbortSignal.timeout(8_000),
	});
	if (!response.ok) return [];
	const body = (await response.json()) as { results?: unknown[] };
	return Array.isArray(body.results) ? (body.results as PostHogRow[]) : [];
}

export async function GET(request: NextRequest) {
	try {
		await requireSuperAdmin(request.headers.get("x-wallet-address") || undefined);
		const [dailyRows, regionRows] = await Promise.all([
			queryPostHog(`SELECT toDate(timestamp) AS day, count() AS pageviews, uniq(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY day ORDER BY day`),
			queryPostHog(`SELECT ifNull(properties.$geoip_country_name, 'Unknown') AS region, count() AS pageviews, uniq(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY region ORDER BY pageviews DESC LIMIT 8`),
		]);
		return NextResponse.json({
			daily: dailyRows.map((row) => ({ day: String(row[0] ?? ""), pageviews: Number(row[1]), visitors: Number(row[2]) })),
			regions: regionRows.map((row) => ({ region: String(row[0] ?? "Unknown"), pageviews: Number(row[1]), visitors: Number(row[2]) })),
			totalVisitors: regionRows.reduce((sum, row) => sum + Number(row[2] || 0), 0),
			totalPageviews: dailyRows.reduce((sum, row) => sum + Number(row[1] || 0), 0),
		});
	} catch (error) {
		if (error instanceof AdminAccessError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}
		return NextResponse.json(EMPTY);
	}
}
