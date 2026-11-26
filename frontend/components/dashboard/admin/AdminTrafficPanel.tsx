import { Globe2, MapPin, UsersRound } from "lucide-react";
import type { AdminAnalytics } from "./types";

export default function AdminTrafficPanel({ analytics }: { analytics: AdminAnalytics }) {
	const max = Math.max(...analytics.regions.map((item) => item.pageviews), 1);
	return (
		<div className="rounded-xl border border-line bg-surface p-5 shadow-card">
			<div className="flex items-center justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-ink"><Globe2 size={16} className="text-accent" />Traffic regions</div><div className="mt-1 text-xs text-ink-3">PostHog pageview distribution</div></div><UsersRound size={17} className="text-ink-3" /></div>
			<div className="mt-5 space-y-4">
				{analytics.regions.length === 0 ? <div className="rounded-lg bg-subtle p-4 text-xs text-ink-3">Connect PostHog to see regional traffic.</div> : analytics.regions.map((item) => <div key={item.region}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-medium text-ink-2"><MapPin size={12} className="text-accent" />{item.region}</span><span className="font-mono text-ink-3">{item.visitors.toLocaleString()} visitors</span></div><div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max((item.pageviews / max) * 100, 3)}%` }} /></div></div>)}
			</div>
		</div>
	);
}
