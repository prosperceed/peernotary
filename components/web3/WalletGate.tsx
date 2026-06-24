"use client";

import { Wallet, AlertTriangle, ExternalLink, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { arcTestnet, ARCSCAN_ADDR } from "@/lib/web3/arcConfig";

interface WalletGateProps {
  isConnected:  boolean;
  isWrongChain: boolean;
  address?:     `0x${string}`;
  onConnect:    () => Promise<void>;
  children:     React.ReactNode;
  className?:   string;
}

/**
 * WalletGate — renders `children` only when the wallet is connected to
 * Arc Testnet. Shows connect / switch-network prompts otherwise.
 */
export default function WalletGate({
  isConnected,
  isWrongChain,
  address,
  onConnect,
  children,
  className,
}: WalletGateProps) {

  // ── Wrong chain ───────────────────────────────────────────────────────────
  if (isConnected && isWrongChain) {
    return (
      <div className={cn("flex flex-col items-center gap-4 py-6 text-center", className)}>
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
          <AlertTriangle size={22} className="text-amber-400" />
        </div>
        <div>
          <div className="text-sm font-bold text-white mb-1">Wrong Network</div>
          <div className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
            Please switch to{" "}
            <span className="text-amber-300 font-mono">Arc Testnet</span>{" "}
            (Chain ID{" "}
            <span className="font-mono">{arcTestnet.id}</span>) in your wallet.
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 w-full border border-slate-800/60 text-left text-[10px] font-mono space-y-1.5 text-slate-400">
          <div>
            <span className="text-slate-600">Network:</span>{" "}
            <span className="text-slate-200">Arc Testnet</span>
          </div>
          <div>
            <span className="text-slate-600">Chain ID:</span>{" "}
            <span className="text-violet-300">{arcTestnet.id}</span>
          </div>
          <div>
            <span className="text-slate-600">RPC:</span>{" "}
            <span className="text-slate-300">rpc.testnet.arc.network</span>
          </div>
          <div>
            <span className="text-slate-600">Gas token:</span>{" "}
            <span className="text-emerald-300">USDC (6 dec)</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className={cn("flex flex-col items-center gap-5 py-6 text-center", className)}>
        {/* Icon */}
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center">
            <Wallet size={24} className="text-violet-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#080C14] border border-slate-700 flex items-center justify-center">
            <Zap size={10} className="text-emerald-400" />
          </div>
        </div>

        <div>
          <div className="text-sm font-bold text-white mb-1">Connect Your Wallet</div>
          <div className="text-xs text-slate-400 max-w-[220px] leading-relaxed">
            Connect a Web3 wallet to create trades, lock collateral, and interact
            with the Arc P2P escrow contract.
          </div>
        </div>

        <button
          onClick={onConnect}
          className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)" }}
        >
          Connect Wallet
        </button>

        <div className="text-[10px] text-slate-600">
          Supports MetaMask, Rabby, Coinbase Wallet, and any EIP-1193 wallet
        </div>
      </div>
    );
  }

  // ── Connected & correct chain → render children ──────────────────────────
  return (
    <>
      {/* Connected address strip */}
      {address && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 mb-4 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-emerald-300">
              {address.slice(0, 8)}…{address.slice(-6)}
            </span>
          </div>
          <a
            href={ARCSCAN_ADDR(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            ArcScan <ExternalLink size={9} />
          </a>
        </div>
      )}
      <div className={className}>{children}</div>
    </>
  );
}
