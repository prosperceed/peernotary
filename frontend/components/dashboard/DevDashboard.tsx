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
		return <div className="flex min-h-[55vh] items-center justify-center"><div className="max-w-md rounded-3xl border border-[#d1e8dc] bg-white p-8 text-center shadow-[0_20px_60px_rgba(20,100,65,0.08)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f7f3]">{error ? <AlertTriangle className="text-amber-500" /> : <LockKeyhole className="text-[#1a9e5c]" />}</div><h2 className="mt-5 text-lg font-bold text-[#0d2b1e]">{error ? "Access restricted" : "Administrator console"}</h2><p className="mt-2 text-sm leading-6 text-[#7aaa92]">{error || "Connect and sign in with the whitelisted administrator wallet to view platform operations."}</p></div></div>;
	}

	if (loading || !overview) {
		return <div className="space-y-5"><div className="h-28 animate-pulse rounded-2xl bg-[#eaf4ee]" /><div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><div className="h-72 animate-pulse rounded-2xl bg-[#eaf4ee] lg:col-span-2" /><div className="h-72 animate-pulse rounded-2xl bg-[#eaf4ee]" /></div></div>;
	}

	return <div className="space-y-6"><div><h2 className="text-2xl font-bold tracking-tight text-[#0d2b1e]">Operations overview</h2><p className="mt-1 text-sm text-[#7aaa92]">A live view of liquidity, settlement, treasury, and network activity.</p></div><AdminKpiGrid metrics={overview.metrics} /><div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]"><AdminActivityChart overview={overview} analytics={analytics} /><AdminTrafficPanel analytics={analytics} /></div><AdminTransactionTable rows={overview.recentTransactions} /></div>;
}
