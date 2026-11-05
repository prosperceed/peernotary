"use client";

import { useState, useEffect, useCallback } from "react";
import { RATE } from "@/lib/utils";
import type { MonierateRatesPayload } from "@/app/api/rates/monierate/route";

const DEFAULT_RATE = 1383.54;

export function useMonierateRate() {
	const [rateData, setRateData] = useState<MonierateRatesPayload | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	const fetchRates = useCallback(async (force = false) => {
		try {
			const res = await fetch(`/api/rates/monierate${force ? "?force=true" : ""}`, {
				cache: "no-store",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: MonierateRatesPayload = await res.json();
			setRateData(data);
			setError(null);
		} catch (err) {
			console.warn("Failed to fetch Monierate rate, falling back to local defaults:", err);
			setError(err instanceof Error ? err.message : "Fetch failed");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchRates();
		const interval = setInterval(() => {
			if (typeof document !== "undefined" && document.visibilityState === "visible") {
				fetchRates();
			}
		}, 60_000); // Poll every 60s
		return () => clearInterval(interval);
	}, [fetchRates]);

	const currentRate = rateData?.rate ?? DEFAULT_RATE ?? RATE;

	return {
		rate: currentRate,
		rateData,
		loading,
		error,
		refresh: () => fetchRates(true),
	};
}
