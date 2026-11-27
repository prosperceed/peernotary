"use client";

import { arcChain } from "@/lib/web3/arcConfig";
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
			chainId: body.chainId ?? arcChain.id,
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

	const Status = ({ ok }: { ok: boolean }) => ok ? <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-accent"><CheckCircle2 size={12} />Healthy</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600"><CircleAlert size={12} />Degraded</span>;

	const checks = data ? [
		{ icon: Server, title: "Arc RPC", ok: data.rpc.ok, detail: `${data.rpc.latencyMs ?? "—"}ms latency · block ${data.rpc.blockNumber ?? "—"}` },
		{ icon: ShieldCheck, title: "TLSN verifier", ok: data.verifier.ok, detail: data.verifier.endpoint },
		{ icon: Gauge, title: "Escrow contract", ok: data.escrow.configured, detail: `Chain ${data.escrow.chainId} · ${short(data.escrow.address)}` },
	] : [];

	return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="kicker">System observability</p><h1 className="mt-3 text-2xl font-bold text-ink">Escrow & TLSN health</h1><p className="mt-2 text-sm leading-6 text-ink-3">Confirm that verification and on-chain settlement dependencies are reachable before investigating a user-facing issue.</p></div><button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-2 hover:bg-subtle"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Run checks</button></div>{error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}<div className="grid gap-4 md:grid-cols-3">{checks.map(({ icon: Icon, title, ok, detail }) => <div key={title} className="rounded-xl border border-line bg-surface p-5 shadow-card"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-subtle text-accent"><Icon size={18} /></div><Status ok={ok} /></div><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-1 break-all text-sm text-ink-3">{detail}</p></div>)}{!data && <div className="rounded-xl border border-line bg-surface p-6 text-sm text-ink-3 md:col-span-3">{loading ? "Checking system dependencies…" : "No diagnostic data available."}</div>}</div><div className="rounded-xl border border-line bg-surface p-5 shadow-card"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Verifier endpoint</p><p className="mt-2 break-all font-mono text-sm text-ink-2">{data?.verifier.endpoint || "—"}</p><p className="mt-5 text-xs text-ink-4">Last checked {data ? new Date(data.checkedAt).toLocaleString() : "—"}</p></div></div>;
}
