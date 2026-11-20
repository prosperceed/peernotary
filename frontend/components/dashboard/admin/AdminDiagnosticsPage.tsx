"use client";

import { useAccount } from "wagmi";
import { CheckCircle2, CircleAlert, Gauge, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Diagnostic = {
	rpc: { ok: boolean; latencyMs: number | null; blockNumber: number | null };
	verifier: { ok: boolean; latencyMs: number | null; endpoint: string };
	escrow: { address: string | null; chainId: number; configured: boolean };
	checkedAt: string;
};

type DiagnosticResponse = {
	chain?: { status?: string; blockNumber?: number; latencyMs?: number };
	tlsn?: { status?: string; endpoint?: string };
	escrowAddress?: string | null;
	chainId?: number;
};

const short = (value: string | null) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "Not configured";

function normalizeDiagnostics(body: DiagnosticResponse): Diagnostic {
	return {
		rpc: {
			ok: body.chain?.status === "healthy",
			latencyMs: body.chain?.latencyMs ?? null,
			blockNumber: body.chain?.blockNumber ?? null,
		},
		verifier: {
			ok: body.tlsn?.status === "healthy",
			latencyMs: null,
			endpoint: body.tlsn?.endpoint || "Not configured",
		},
		escrow: {
			address: body.escrowAddress ?? null,
			chainId: body.chainId ?? 5042002,
			configured: Boolean(body.escrowAddress),
		},
		checkedAt: new Date().toISOString(),
	};
}

export default function AdminDiagnosticsPage() {
	const { address } = useAccount();
	const [data, setData] = useState<Diagnostic | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		if (!address) return;
		setLoading(true);
		setError(null);
		try {
			const response = await fetch("/api/admin/diagnostics", { headers: { "x-wallet-address": address }, cache: "no-store" });
			const body = (await response.json()) as DiagnosticResponse & { error?: string };
			if (!response.ok) throw new Error(body.error || "Unable to load diagnostics");
			setData(normalizeDiagnostics(body));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to load diagnostics");
		} finally {
			setLoading(false);
		}
	}, [address]);

	useEffect(() => {
		const timer = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timer);
	}, [load]);

	const Status = ({ ok }: { ok: boolean }) => ok ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f7f3] px-2.5 py-1 text-[10px] font-bold text-[#1a9e5c]"><CheckCircle2 size={12} />Healthy</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-600"><CircleAlert size={12} />Degraded</span>;

	const checks = data ? [
		{ icon: Server, title: "Arc RPC", ok: data.rpc.ok, detail: `${data.rpc.latencyMs ?? "—"}ms latency · block ${data.rpc.blockNumber ?? "—"}` },
		{ icon: ShieldCheck, title: "TLSN verifier", ok: data.verifier.ok, detail: data.verifier.endpoint },
		{ icon: Gauge, title: "Escrow contract", ok: data.escrow.configured, detail: `Chain ${data.escrow.chainId} · ${short(data.escrow.address)}` },
	] : [];

	return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1a9e5c]">System observability</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Escrow & TLSN health</h1><p className="mt-2 text-sm leading-6 text-[#6f9a83]">Confirm that verification and on-chain settlement dependencies are reachable before investigating a user-facing issue.</p></div><button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d1e8dc] bg-white px-3.5 py-2 text-xs font-bold text-[#3d6b55] hover:bg-[#f0f7f3]"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Run checks</button></div>{error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}<div className="grid gap-4 md:grid-cols-3">{checks.map(({ icon: Icon, title, ok, detail }) => <div key={title} className="rounded-2xl border border-[#d1e8dc] bg-white p-5 shadow-[0_12px_40px_rgba(20,100,65,0.05)]"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f7f3] text-[#1a9e5c]"><Icon size={18} /></div><Status ok={ok} /></div><h2 className="mt-5 font-bold">{title}</h2><p className="mt-1 break-all text-sm text-[#6f9a83]">{detail}</p></div>)}{!data && <div className="rounded-2xl border border-[#d1e8dc] bg-white p-6 text-sm text-[#8aac99] md:col-span-3">{loading ? "Checking system dependencies…" : "No diagnostic data available."}</div>}</div><div className="rounded-2xl border border-[#d1e8dc] bg-white p-5 shadow-[0_12px_40px_rgba(20,100,65,0.05)]"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8aac99]">Verifier endpoint</p><p className="mt-2 break-all font-mono text-sm text-[#3d6b55]">{data?.verifier.endpoint || "—"}</p><p className="mt-5 text-xs text-[#9bbbaa]">Last checked {data ? new Date(data.checkedAt).toLocaleString() : "—"}</p></div></div>;
}
