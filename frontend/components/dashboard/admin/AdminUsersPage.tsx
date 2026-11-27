"use client";

import { useAccount } from "wagmi";
import { Search, ShieldOff, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AdminUser = { walletAddress: string; username: string | null; role: string; status: string; reason: string | null; trades: number; completedTrades: number; volumeUsdcUnits: string; lastAuthenticatedAt: string | null };
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const usdc = (value: string) => `$${(Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AdminUsersPage() {
	const { address } = useAccount();
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");
	const [selected, setSelected] = useState<AdminUser | null>(null);
	const [reason, setReason] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!address) return;
		setLoading(true); setError(null);
		try { const response = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}`, { headers: { "x-wallet-address": address }, cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load users"); setUsers(data.users); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load users"); } finally { setLoading(false); }
	}, [address, query]);

	useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
	const visibleUsers = useMemo(() => filter === "ALL" ? users : users.filter((user) => user.status === filter), [filter, users]);
	const updateStatus = async () => {
		if (!address || !selected || reason.trim().length < 4) return;
		const action = selected.status === "SUSPENDED" ? "restore" : "suspend";
		const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json", "x-wallet-address": address }, body: JSON.stringify({ walletAddress: selected.walletAddress, action, reason }) });
		if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error || "Action failed"); return; }
		setSelected(null); setReason(""); void load();
	};

	return <div className="space-y-6"><div><p className="kicker">Identity & access</p><h1 className="mt-3 text-2xl font-bold text-ink">Users and wallet controls</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-3">Review who is interacting with the protocol and suspend suspicious wallets before they can start a new authentication session.</p></div><div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-card sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet or username" className="w-full rounded-lg bg-subtle py-2.5 pl-9 pr-3 text-sm outline-none ring-line focus:ring-2" /></div><div className="flex gap-1 rounded-lg bg-subtle p-1">{(["ALL", "ACTIVE", "SUSPENDED"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === item ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}>{item}</button>)}</div></div>{error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}<div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"><div className="flex items-center justify-between border-b border-subtle px-5 py-4"><div className="flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-accent" />{visibleUsers.length} wallets</div><span className="text-xs text-ink-3">Activity is derived from authenticated accounts and trades</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-subtle/60 text-[11px] uppercase tracking-[0.14em] text-ink-3"><tr><th className="px-5 py-3 font-semibold">Wallet</th><th className="px-5 py-3 font-semibold">Activity</th><th className="px-5 py-3 font-semibold">Volume</th><th className="px-5 py-3 font-semibold">Last seen</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-subtle">{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-3">Loading wallet activity…</td></tr> : visibleUsers.map((user) => <tr key={user.walletAddress} className="hover:bg-surface"><td className="px-5 py-4"><p className="font-semibold text-ink">{user.username || short(user.walletAddress)}</p><p className="mt-1 font-mono text-xs text-ink-3">{short(user.walletAddress)}</p></td><td className="px-5 py-4 text-ink-2">{user.trades} trades <span className="text-ink-4">·</span> {user.completedTrades} settled</td><td className="px-5 py-4 font-semibold text-ink">{usdc(user.volumeUsdcUnits)}</td><td className="px-5 py-4 text-xs text-ink-3">{user.lastAuthenticatedAt ? new Date(user.lastAuthenticatedAt).toLocaleString() : "Never"}</td><td className="px-5 py-4"><span className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${user.status === "SUSPENDED" ? "bg-rose-50 text-rose-600" : "bg-subtle text-accent"}`}>{user.status}</span></td><td className="px-5 py-4 text-right"><button onClick={() => setSelected(user)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-subtle">{user.status === "SUSPENDED" ? "Restore" : "Review"}</button></td></tr>)}{!loading && visibleUsers.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-3">No wallets match this view.</td></tr>}</tbody></table></div></div>{selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm p-4"><div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-card"><div className="flex items-center gap-3">{selected.status === "SUSPENDED" ? <ShieldCheck className="text-accent" /> : <ShieldOff className="text-rose-500" />}<div><h2 className="font-semibold">{selected.status === "SUSPENDED" ? "Restore wallet access" : "Suspend wallet access"}</h2><p className="font-mono text-xs text-ink-3">{selected.walletAddress}</p></div></div><p className="mt-5 text-sm leading-6 text-ink-3">A reason is recorded in the immutable admin activity trail and shown to future reviewers.</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this action" className="mt-4 min-h-24 w-full rounded-lg border border-line p-3 text-sm outline-none focus:ring-2 focus:ring-line" /><div className="mt-5 flex justify-end gap-2"><button onClick={() => { setSelected(null); setReason(""); }} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-3">Cancel</button><button disabled={reason.trim().length < 4} onClick={() => void updateStatus()} className="rounded-lg bg-raised px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Confirm action</button></div></div></div>}</div>;
}
