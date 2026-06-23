"use client";

import { useState } from "react";
import {
  Activity, Lock, Zap, Shield, Copy, Check, Code,
  TrendingUp, Eye, EyeOff,
} from "lucide-react";
import { Badge, MetricCard, SparkLine } from "@/components/shared";
import TradingWidget from "@/components/trading/TradingWidget";
import { cn } from "@/lib/utils";
import type { Transaction, TxStatus } from "@/types";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const volumeData = [28, 45, 32, 67, 54, 78, 91, 65, 88, 102, 95, 119, 134, 108, 145];
const escrowData = [12, 18, 15, 24, 20, 28, 32, 27, 35, 31, 42, 38, 47, 52, 58];

const transactions: Transaction[] = [
  { id: "ARC-001829", buyer: "john.eth",    ngnAmount: "₦2,100,000", usdc: "1,287.73 USDC", status: "completed", time: "2m ago" },
  { id: "ARC-001828", buyer: "ayodeji_t",   ngnAmount: "₦500,000",   usdc: "306.75 USDC",   status: "escrow",    time: "8m ago" },
  { id: "ARC-001827", buyer: "chidi.arc",   ngnAmount: "₦750,000",   usdc: "460.12 USDC",   status: "completed", time: "15m ago" },
  { id: "ARC-001826", buyer: "fatima_w",    ngnAmount: "₦350,000",   usdc: "214.72 USDC",   status: "disputed",  time: "23m ago" },
  { id: "ARC-001825", buyer: "emeka_v2",    ngnAmount: "₦1,000,000", usdc: "613.50 USDC",   status: "completed", time: "31m ago" },
  { id: "ARC-001824", buyer: "ngozi.arc",   ngnAmount: "₦650,000",   usdc: "398.77 USDC",   status: "escrow",    time: "38m ago" },
  { id: "ARC-001823", buyer: "seyi_trdr",   ngnAmount: "₦3,250,000", usdc: "1,993.87 USDC", status: "completed", time: "52m ago" },
];

const statusConfig: Record<TxStatus, { label: string; color: "green" | "amber" | "red" | "violet" }> = {
  completed: { label: "Completed", color: "green" },
  escrow:    { label: "In Escrow", color: "amber" },
  disputed:  { label: "Disputed",  color: "red"   },
  pending:   { label: "Pending",   color: "violet" },
};

const API_KEY = "arc_live_sk_7f8a2c1d9e3b4f6a0c2e5d8b1a4f7c9e";

// ─── TIME RANGE TABS ──────────────────────────────────────────────────────────
function TimeRangeTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1">
      {["1D", "7D", "30D"].map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "text-[11px] px-2.5 py-1 rounded-lg transition-all",
            active === t
              ? "bg-violet-500/20 text-violet-300"
              : "text-slate-500 hover:text-slate-300"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── DEV DASHBOARD ────────────────────────────────────────────────────────────
export default function DevDashboard() {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [timeRange, setTimeRange] = useState("1D");
  const [showWidget, setShowWidget] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(API_KEY).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskedKey = `${API_KEY.slice(0, 16)}${"•".repeat(20)}`;

  return (
    <div className="space-y-5">

      {/* ── Metrics Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Activity size={16} className="text-violet-400" />}
          label="24h Volume"
          value="₦47.2M"
          sub="28,953 USDC equiv."
          trend={12}
          accent="#7C3AED"
        />
        <MetricCard
          icon={<Lock size={16} className="text-emerald-400" />}
          label="Active Escrows"
          value="143"
          sub="₦8.4M locked"
          trend={8}
          accent="#10B981"
        />
        <MetricCard
          icon={<Zap size={16} className="text-amber-400" />}
          label="Avg. Settlement"
          value="1m 48s"
          sub="vs 2m 12s last week"
          trend={-14}
          accent="#F59E0B"
        />
        <MetricCard
          icon={<Shield size={16} className="text-cyan-400" />}
          label="Dispute Rate"
          value="0.23%"
          sub="Industry avg: 1.4%"
          trend={-31}
          accent="#06B6D4"
        />
      </div>

      {/* ── Bento Row 1: Volume Chart + API Card ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Volume Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/50 bg-[#0D1322]/80 backdrop-blur-md p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Transaction Volume</div>
              <div className="text-xs text-slate-500 mt-0.5">Last 15 days · NGN</div>
            </div>
            <TimeRangeTabs active={timeRange} onChange={setTimeRange} />
          </div>

          <SparkLine data={volumeData} color="#7C3AED" height={84} />

          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["₦47.2M",  "Today"],
              ["₦312.8M", "This Week"],
              ["₦1.24B",  "This Month"],
            ].map(([val, label]) => (
              <div key={label} className="bg-slate-800/40 rounded-xl p-3 text-center">
                <div className="text-white font-mono font-bold text-sm">{val}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* API Key Card */}
        <div className="rounded-2xl border border-slate-700/50 bg-[#0D1322]/80 backdrop-blur-md p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">SDK & API</div>
            <Badge label="v2.4.1" color="violet" />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">Live API Key</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-800/80 rounded-xl px-3 py-2 font-mono text-[11px] text-slate-400 truncate">
                {showKey ? API_KEY : maskedKey}
              </div>
              <button
                onClick={() => setShowKey((v) => !v)}
                className="w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-slate-600 flex items-center justify-center transition-all shrink-0"
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff size={13} className="text-slate-400" /> : <Eye size={13} className="text-slate-400" />}
              </button>
              <button
                onClick={copyKey}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                  copied
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-700/60 hover:bg-slate-600 text-slate-400"
                )}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            {[
              ["Webhook Endpoint", "Configured",  "green"],
              ["Rate Limit",       "10,000 req/hr", "blue"],
              ["SDK Environment",  "Production",  "green"],
              ["Arc Network RPC",  "Connected",   "green"],
              ["ZK Oracle",        "TLSNotary v2", "cyan"],
            ].map(([label, value, color]) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-800/80 last:border-0">
                <span className="text-[11px] text-slate-500">{label}</span>
                <Badge label={value} color={color as any} />
              </div>
            ))}
          </div>

          <button className="w-full py-2 rounded-xl border border-slate-700 text-slate-400 text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5">
            <Code size={12} /> View SDK Docs
          </button>
        </div>
      </div>

      {/* ── Bento Row 2: Escrow Pool + Tx Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Escrow Pool */}
        <div className="rounded-2xl border border-slate-700/50 bg-[#0D1322]/80 backdrop-blur-md p-5">
          <div className="text-sm font-semibold text-white mb-0.5">Active Escrow Pools</div>
          <div className="text-xs text-slate-500 mb-4">Concurrent locked orders</div>

          <SparkLine data={escrowData} color="#10B981" height={72} />

          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
            <div className="text-emerald-300 font-mono font-bold text-xl">₦8,412,500</div>
            <div className="text-[11px] text-emerald-500/70 mt-1 leading-relaxed">
              Total currently in escrow across 143 open orders
            </div>
          </div>

          {/* Mini breakdown */}
          <div className="mt-3 space-y-1.5">
            {[
              ["NGN/USDC Pairs", "138"],
              ["NGN/USDT Pairs", "5"],
              ["Avg. Order Size", "₦58,826"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-300 font-mono">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Tx Feed */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/50 bg-[#0D1322]/80 backdrop-blur-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-white">Live Transaction Feed</div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-time
            </div>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Order ID", "Buyer", "NGN Amount", "USDC", "Status", "Time"].map((h) => (
                    <th key={h} className="text-left pb-2.5 font-medium text-slate-500 pr-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const { label, color } = statusConfig[tx.status];
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="py-2.5 pr-4 font-mono text-violet-400">{tx.id}</td>
                      <td className="pr-4 text-slate-300">{tx.buyer}</td>
                      <td className="pr-4 font-mono text-white">{tx.ngnAmount}</td>
                      <td className="pr-4 font-mono text-slate-400">{tx.usdc}</td>
                      <td className="pr-4">
                        <Badge label={label} color={color} pulse={tx.status === "escrow" || tx.status === "disputed"} />
                      </td>
                      <td className="text-slate-500 whitespace-nowrap">{tx.time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
            <span>Showing 7 of 1,829 orders</span>
            <button className="text-violet-400 hover:text-violet-300 transition-colors">View all →</button>
          </div>
        </div>
      </div>

      {/* ── Widget Preview Toggle ── */}
      <div className="rounded-2xl border border-violet-500/25 bg-[#0D1322]/80 backdrop-blur-md p-5">
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3">
          <div>
            <div className="text-sm font-semibold text-white">P2P Widget Preview</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Live preview of the widget your users will see when you embed the Arc SDK
            </div>
          </div>
          <button
            onClick={() => setShowWidget((v) => !v)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0",
              showWidget
                ? "bg-violet-600 hover:bg-violet-500 text-white"
                : "border border-violet-500/40 text-violet-300 hover:bg-violet-500/10"
            )}
          >
            {showWidget ? <EyeOff size={14} /> : <Eye size={14} />}
            {showWidget ? "Hide Widget" : "Preview Widget"}
          </button>
        </div>

        {/* Embed code snippet */}
        <div className="mt-4 bg-slate-950 rounded-xl p-3.5 font-mono text-[11px] text-slate-400 border border-slate-800/60">
          <span className="text-slate-600 select-none">// Install: </span>
          <span className="text-emerald-400">npm install @arc-network/p2p-widget</span>
          <br />
          <span className="text-violet-400">{"<ArcP2PWidget"}</span>
          <br />
          <span className="text-slate-500 pl-4">{"apiKey="}</span>
          <span className="text-amber-300">{'"arc_live_sk_7f8a2c…"'}</span>
          <br />
          <span className="text-slate-500 pl-4">{"currency="}</span>
          <span className="text-amber-300">{'"NGN"'}</span>
          <br />
          <span className="text-slate-500 pl-4">{"network="}</span>
          <span className="text-amber-300">{'"arc-mainnet"'}</span>
          <br />
          <span className="text-violet-400">{"/>"}</span>
        </div>

        {/* Widget Iframe Preview */}
        {showWidget && (
          <div className="mt-5 max-w-md mx-auto">
            <div className="text-[11px] text-slate-500 mb-2 text-center">
              ↓ Rendered Widget — as your end-users see it
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-[#050810] p-5 shadow-2xl shadow-violet-500/5">
              <TradingWidget embedded />
            </div>
          </div>
        )}
      </div>

      {/* ── Network Health Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Arc RPC Latency",    value: "12ms",    good: true  },
          { label: "Oracle Uptime",      value: "99.98%",  good: true  },
          { label: "Pending Arbitrations", value: "3",     good: false },
          { label: "Gas (USDC/tx)",      value: "0.0031",  good: true  },
        ].map(({ label, value, good }) => (
          <div key={label} className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-3.5">
            <div className="text-[11px] text-slate-500 mb-1">{label}</div>
            <div className={cn("font-mono font-bold text-base", good ? "text-emerald-300" : "text-amber-300")}>
              {value}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
