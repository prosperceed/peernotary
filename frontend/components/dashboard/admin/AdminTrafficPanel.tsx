import { Globe2, MapPin, UsersRound } from "lucide-react";
import type { AdminAnalytics } from "./types";

export default function AdminTrafficPanel({ analytics }: { analytics: AdminAnalytics }) {
	const max = Math.max(...analytics.regions.map((item) => item.pageviews), 1);
	return (
		<div className="rounded-2xl border border-[#d1e8dc] bg-white p-5 shadow-[0_12px_35px_rgba(20,100,65,0.04)]">
			<div className="flex items-center justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#0d2b1e]"><Globe2 size={16} className="text-[#1a9e5c]" />Traffic regions</div><div className="mt-1 text-xs text-[#7aaa92]">PostHog pageview distribution</div></div><UsersRound size={17} className="text-[#7aaa92]" /></div>
			<div className="mt-5 space-y-4">
				{analytics.regions.length === 0 ? <div className="rounded-xl bg-[#f5f9f7] p-4 text-xs text-[#7aaa92]">Connect PostHog to see regional traffic.</div> : analytics.regions.map((item) => <div key={item.region}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-medium text-[#3d6b55]"><MapPin size={12} className="text-[#1a9e5c]" />{item.region}</span><span className="font-mono text-[#7aaa92]">{item.visitors.toLocaleString()} visitors</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#edf5f0]"><div className="h-full rounded-full bg-[#22c972]" style={{ width: `${Math.max((item.pageviews / max) * 100, 3)}%` }} /></div></div>)}
			</div>
		</div>
	);
}
