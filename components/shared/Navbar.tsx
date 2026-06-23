"use client";

import { Zap, Settings, Code, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types";

interface NavbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export default function Navbar({ view, onViewChange }: NavbarProps) {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-800/70"
      style={{ background: "rgba(8, 12, 20, 0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* ── Logo ── */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)" }}
          >
            <Zap size={15} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-sm">Arc P2P</span>
            <span className="text-slate-500 text-sm hidden sm:inline">· NGN/USDC</span>
          </div>
          {/* Network badge */}
          <div className="hidden sm:flex items-center gap-1.5 ml-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Arc Mainnet Online
          </div>
        </div>

        {/* ── View Toggle ── */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "#0D1322" }}
        >
          <button
            onClick={() => onViewChange("dev")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
              view === "dev"
                ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Code size={12} />
            <span className="hidden sm:inline">Developer View</span>
            <span className="sm:hidden">Dev</span>
          </button>
          <button
            onClick={() => onViewChange("trader")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
              view === "trader"
                ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Layers size={12} />
            <span className="hidden sm:inline">Trader View</span>
            <span className="sm:hidden">Trade</span>
          </button>
        </div>

        {/* ── Right: User + Settings ── */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <div className="w-5 h-5 rounded-full bg-violet-500/30 flex items-center justify-center">
              <span className="text-[9px] font-bold text-violet-300">DC</span>
            </div>
            <span className="text-xs text-slate-300">DevCo. Inc.</span>
          </div>
          <button
            className="w-8 h-8 rounded-xl bg-slate-800/70 border border-slate-700/40 flex items-center justify-center hover:bg-slate-700 hover:border-slate-600 transition-all"
            aria-label="Settings"
          >
            <Settings size={14} className="text-slate-400" />
          </button>
        </div>

      </div>
    </nav>
  );
}
