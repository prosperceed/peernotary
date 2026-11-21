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
					<div className="text-sm font-semibold text-[#0d2b1e]">Live activity</div>
					<div className="mt-1 text-xs text-[#7aaa92]">Escrow volume and traffic over the last 14–30 days</div>
				</div>
				<div className="rounded-lg bg-[#f0f7f3] px-3 py-1.5 text-[11px] text-[#3d6b55]">{analytics.totalPageviews.toLocaleString()} pageviews · {analytics.totalVisitors.toLocaleString()} visitors</div>
			</div>
			<div className="relative mt-6 h-52 overflow-hidden rounded-xl bg-[#f4faf6]">
				<div className="absolute inset-0 flex flex-col justify-between py-4"><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /><span className="border-t border-dashed border-[#d1e8dc]" /></div>
				{points.length > 0 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full p-3"><defs><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22c972" stopOpacity=".28" /><stop offset="1" stopColor="#22c972" stopOpacity="0" /></linearGradient></defs><polygon points={`0,100 ${chartPoints} 100,100`} fill="url(#activity-fill)" /><polyline points={chartPoints} fill="none" stroke="#1a9e5c" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg> : <div className="absolute inset-0 flex items-center justify-center text-xs text-[#7aaa92]">Transaction activity will appear here.</div>}
			</div>
			<div className="mt-3 flex items-center justify-between text-[10px] text-[#7aaa92]"><span>{points[0] ? shortDay(points[0].day) : "—"}</span><span>USDC volume</span><span>{points.at(-1) ? shortDay(points.at(-1)!.day) : "—"}</span></div>
		</div>
	);
}
