import type { AdminAnalytics, AdminOverview } from "./types";

function shortDay(day: string) {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function AdminActivityChart({ overview, analytics }: { overview: AdminOverview; analytics: AdminAnalytics }) {
	const points = overview.activity;
	const max = Math.max(...points.map((point) => Number(point.volumeUsdcUnits) / 1_000_000), 1);
	const chartPoints = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${92 - ((Number(point.volumeUsdcUnits) / 1_000_000) / max) * 76}`).join(" ");
	return (
		<div className="rounded-2xl border border-[#d1e8dc] bg-white p-5 shadow-[0_12px_35px_rgba(20,100,65,0.04)]">
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold text-[#0d2b1e]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#22c972]" />Live activity</div>
					<div className="mt-1 text-xs text-[#7aaa92]">Escrow volume and traffic over the last 14–30 days</div>
				</div>
				<div className="rounded-lg bg-[#f0f7f3] px-3 py-1.5 text-[11px] text-[#3d6b55]">{analytics.totalPageviews.toLocaleString()} pageviews · {analytics.totalVisitors.toLocaleString()} visitors</div>
			</div>
			<div className="relative mt-6 h-52 overflow-hidden rounded-xl bg-[#fbfdfc]">
				<div className="absolute inset-0 flex flex-col justify-between py-4"><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /></div>
				{points.length > 0 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full p-3"><polyline points={chartPoints} fill="none" stroke="#1a9e5c" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg> : <div className="absolute inset-0 flex items-center justify-center text-xs text-[#7aaa92]">Transaction activity will appear here.</div>}
			</div>
			<div className="mt-3 flex items-center justify-between text-[10px] text-[#7aaa92]"><span>{points[0] ? shortDay(points[0].day) : "—"}</span><span>USDC volume</span><span>{points.at(-1) ? shortDay(points.at(-1)!.day) : "—"}</span></div>
		</div>
	);
}
