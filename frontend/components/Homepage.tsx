import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Lock, Landmark, FileCheck2, Send } from "lucide-react";
import {
	ARCSCAN_ADDR,
	DEFAULT_FEE_BPS,
	ESCROW_ADDRESS,
	USDC_ADDRESS,
	arcTestnet,
} from "@/lib/web3/arcConfig";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const TICKET_STEPS = [
	{ icon: Lock, title: "Seller locks 250.00 USDC", meta: "initiateTrade · listing #12", done: true },
	{ icon: Landmark, title: "Buyer pays ₦345,000 by bank transfer", meta: "Flutterwave · GTBank", done: true },
	{ icon: FileCheck2, title: "Payment proven from the bank session", meta: "TLSNotary proof 0x9c41…e2a0", done: true },
	{ icon: Send, title: "Escrow releases 247.50 USDC to buyer", meta: "oracleSettleOrder · 1% fee", done: false },
];

const STEPS = [
	{
		n: "01",
		title: "Seller funds escrow",
		body: "USDC moves from the seller's wallet into the Arc escrow contract before any buyer sees the offer. Nothing is promised that isn't already locked.",
	},
	{
		n: "02",
		title: "Buyer pays in naira",
		body: "The buyer pays through Flutterwave checkout or a direct bank transfer. No screenshots — payment is confirmed by the provider or a TLSNotary proof of the bank session.",
	},
	{
		n: "03",
		title: "Contract releases USDC",
		body: "Once payment is proven, the oracle calls the escrow contract and the USDC lands in the buyer's wallet. Every step is a transaction you can open on ArcScan.",
	},
];

const ENDPOINTS = [
	["POST", "/api/payments/flutterwave/checkout", "Open a hosted checkout for a trade"],
	["POST", "/api/tlsn/trades/:id/verify", "Submit a bank-session proof"],
	["GET", "/api/trades/:id/lifecycle", "Read state, deadlines and audit trail"],
];

export default function Homepage() {
	const facts: [string, React.ReactNode][] = [
		["Network", `${arcTestnet.name} · chain ${arcTestnet.id}`],
		[
			"Escrow contract",
			<a
				key="escrow"
				href={ARCSCAN_ADDR(ESCROW_ADDRESS)}
				target="_blank"
				rel="noreferrer"
				className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
			>
				{short(ESCROW_ADDRESS)}
				<ArrowUpRight size={13} />
			</a>,
		],
		[
			"Settlement asset",
			<span key="usdc">
				USDC <span className="font-mono text-ink-3">{short(USDC_ADDRESS)}</span>
			</span>,
		],
		["Platform fee", `${DEFAULT_FEE_BPS / 100}% of released USDC`],
		["Buyer collateral", "None — seller-funded escrow"],
		["Unpaid order timeout", "20 minutes, then USDC is reclaimable"],
	];

	return (
		<div className="bg-canvas">
			{/* Hero */}
			<section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-24">
				<div>
					<p className="text-sm font-medium text-accent">USDC ⇄ NGN on Arc</p>
					<h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
						Trade crypto for naira without trusting the other side.
					</h1>
					<p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2">
						PeerNotary holds the seller&apos;s USDC in an on-chain escrow and only releases it once the
						buyer&apos;s bank payment is verified. No fake receipts, no chargeback games.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link href="/trade" className="btn-primary h-11 px-5">
							Open trading desk
							<ArrowRight size={16} />
						</Link>
						<Link href="/dashboard" className="btn-secondary h-11 px-5">
							Sell USDC
						</Link>
					</div>
				</div>

				{/* Product illustration: what a trade looks like */}
				<div className="card overflow-hidden">
					<div className="flex items-center justify-between border-b border-line px-5 py-3.5">
						<div>
							<div className="text-sm font-medium text-ink">Trade #12-1</div>
							<div className="text-xs text-ink-3">250.00 USDC · ₦1,380 / USDC</div>
						</div>
						<span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
							Releasing
						</span>
					</div>
					<ol className="px-5 py-2">
						{TICKET_STEPS.map(({ icon: Icon, title, meta, done }, i) => (
							<li key={title} className="relative flex gap-3.5 py-3">
								{i < TICKET_STEPS.length - 1 && (
									<span className="absolute left-[13px] top-10 h-[calc(100%-28px)] w-px bg-line" />
								)}
								<span
									className={`relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
										done ? "border-accent/20 bg-accent-soft text-accent" : "border-line bg-surface text-ink-3"
									}`}
								>
									{done ? <Check size={14} strokeWidth={2.25} /> : <Icon size={14} strokeWidth={1.75} />}
								</span>
								<div className="min-w-0">
									<div className={`text-sm ${done ? "text-ink" : "text-ink-2"}`}>{title}</div>
									<div className="mt-0.5 font-mono text-xs text-ink-3">{meta}</div>
								</div>
							</li>
						))}
					</ol>
					<div className="border-t border-line bg-subtle px-5 py-3 text-xs text-ink-3">
						Example trade. Every step above is a transaction or signed proof you can audit.
					</div>
				</div>
			</section>

			{/* How it works */}
			<section className="border-t border-line bg-surface">
				<div className="mx-auto max-w-6xl px-6 py-20">
					<h2 className="text-2xl font-semibold tracking-tight text-ink">How settlement works</h2>
					<div className="mt-10 grid gap-10 md:grid-cols-3">
						{STEPS.map((s) => (
							<div key={s.n}>
								<div className="font-mono text-sm text-ink-3">{s.n}</div>
								<h3 className="mt-3 text-base font-semibold text-ink">{s.title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Contract facts + integrators */}
			<section className="border-t border-line">
				<div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
					<div>
						<h2 className="text-2xl font-semibold tracking-tight text-ink">The contract</h2>
						<p className="mt-2 text-sm text-ink-2">Terms enforced by ArcP2PEscrowService, not by us.</p>
						<dl className="mt-6 divide-y divide-line border-y border-line">
							{facts.map(([k, v]) => (
								<div key={k} className="flex items-center justify-between gap-6 py-3 text-sm">
									<dt className="text-ink-3">{k}</dt>
									<dd className="text-right text-ink">{v}</dd>
								</div>
							))}
						</dl>
					</div>
					<div>
						<h2 className="text-2xl font-semibold tracking-tight text-ink">For integrators</h2>
						<p className="mt-2 text-sm text-ink-2">
							Embed the same escrow flow in your own app. Wallet-signed sessions, idempotent settlement.
						</p>
						<ul className="mt-6 divide-y divide-line border-y border-line">
							{ENDPOINTS.map(([method, path, desc]) => (
								<li key={path} className="py-3">
									<div className="flex items-center gap-2 font-mono text-[13px]">
										<span className="w-10 text-xs font-medium text-accent">{method}</span>
										<span className="text-ink">{path}</span>
									</div>
									<div className="mt-1 pl-12 text-xs text-ink-3">{desc}</div>
								</li>
							))}
						</ul>
					</div>
				</div>
			</section>
		</div>
	);
}
