"use client";

import { useAccount } from "wagmi";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, LockKeyhole } from "lucide-react";
import AdminActivityChart from "./admin/AdminActivityChart";
import AdminKpiGrid from "./admin/AdminKpiGrid";
import AdminTrafficPanel from "./admin/AdminTrafficPanel";
import AdminTransactionTable from "./admin/AdminTransactionTable";
import type { AdminAnalytics, AdminOverview } from "./admin/types";

const emptyAnalytics: AdminAnalytics = { daily: [], regions: [], totalVisitors: 0, totalPageviews: 0 };

export default function DevDashboard() {
	const { address } = useAccount();
	const [overview, setOverview] = useState<AdminOverview | null>(null);
	const [analytics, setAnalytics] = useState<AdminAnalytics>(emptyAnalytics);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!address) { setLoading(false); return; }
		setLoading(true);
		setError(null);
		const headers = { "x-wallet-address": address };
		try {
			const [overviewResponse, analyticsResponse] = await Promise.all([
				fetch("/api/admin/overview", { headers, cache: "no-store" }),
				fetch("/api/admin/analytics", { headers, cache: "no-store" }),
			]);
			if (!overviewResponse.ok) {
				setError(overviewResponse.status === 401 ? "Sign in with the whitelisted administrator wallet to continue." : "This wallet is not authorized for the super-admin console.");
				return;
			}
			setOverview((await overviewResponse.json()) as AdminOverview);
			if (analyticsResponse.ok) setAnalytics((await analyticsResponse.json()) as AdminAnalytics);
		} catch {
			setError("The admin data service is temporarily unavailable.");
		} finally { setLoading(false); }
	}, [address]);

	useEffect(() => {
		const timer = window.setTimeout(() => { void load(); }, 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	if (!address || error) {
		return <div className="flex min-h-[55vh] items-center justify-center"><div className="max-w-md card p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-subtle">{error ? <AlertTriangle className="text-amber-500" /> : <LockKeyhole className="text-accent" />}</div><h2 className="mt-5 text-lg font-semibold text-ink">{error ? "Access restricted" : "Administrator console"}</h2><p className="mt-2 text-sm leading-6 text-ink-3">{error || "Connect and sign in with the whitelisted administrator wallet to view platform operations."}</p></div></div>;
	}

	if (loading || !overview) {
		return <div className="space-y-5"><div className="h-28 animate-pulse rounded-card bg-surface/60 border border-line" /><div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><div className="h-72 animate-pulse rounded-card bg-surface/60 border border-line lg:col-span-2" /><div className="h-72 animate-pulse rounded-card bg-surface/60 border border-line" /></div></div>;
	}

	return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Operations overview</h2><p className="mt-1 text-sm text-ink-3">A live view of liquidity, settlement, treasury, and network activity.</p></div><AdminKpiGrid metrics={overview.metrics} /><div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]"><AdminActivityChart overview={overview} analytics={analytics} /><AdminTrafficPanel analytics={analytics} /></div><AdminTransactionTable rows={overview.recentTransactions} /></div>;
}
