import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import CodeBlock from "@/components/docs/CodeBlock";
import Footer from "@/components/shared/Footer";
import { NETWORK } from "@/lib/env/network";

export const metadata: Metadata = {
	title: "Developer docs",
	description: "Integrate PeerNotary's escrow-backed USDC ⇄ fiat trades: authentication, trade flow, payments, webhooks and the escrow contract.",
};

const SECTIONS = [
	{ id: "overview", label: "Overview" },
	{ id: "networks", label: "Networks" },
	{ id: "auth", label: "Authentication" },
	{ id: "flow", label: "Trade flow" },
	{ id: "endpoints", label: "API reference" },
	{ id: "lifecycle", label: "Trade states" },
	{ id: "webhooks", label: "Webhooks" },
	{ id: "contract", label: "Escrow contract" },
	{ id: "errors", label: "Errors" },
];

function Method({ m }: { m: "GET" | "POST" }) {
	return (
		<span
			className={
				m === "GET"
					? "rounded bg-[#eaf5ef] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#2e7d57]"
					: "rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent"
			}
		>
			{m}
		</span>
	);
}

function Endpoint({
	method,
	path,
	auth,
	children,
}: {
	method: "GET" | "POST";
	path: string;
	auth?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="border-t border-line py-6 first:border-t-0 first:pt-0">
			<div className="flex flex-wrap items-center gap-2.5">
				<Method m={method} />
				<code className="font-mono text-[13px] font-medium text-ink">{path}</code>
				{auth && <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3">{auth}</span>}
			</div>
			<div className="mt-3 text-sm leading-relaxed text-ink-2 [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-ink">
				{children}
			</div>
		</div>
	);
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<h2 id={id} className="scroll-mt-24 pt-14 text-2xl font-bold text-ink first:pt-0">
			{children}
		</h2>
	);
}

function P({ children }: { children: React.ReactNode }) {
	return (
		<p className="mt-3 text-[15px] leading-relaxed text-ink-2 [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink">
			{children}
		</p>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-4 flex gap-3 rounded-lg border border-accent/15 bg-accent-soft/60 px-4 py-3 text-sm leading-relaxed text-ink-2 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-ink">
			<Info size={16} className="mt-0.5 shrink-0 text-accent" />
			<div>{children}</div>
		</div>
	);
}

const LIFECYCLE: [string, string][] = [
	["OPEN", "Listing is funded on-chain and visible to buyers."],
	["AWAITING_PAYMENT", "A buyer took the offer. The payment window is running."],
	["PAYMENT_CONFIRMED", "Fiat payment verified by Flutterwave or a TLSNotary proof."],
	["RELEASE_PENDING", "Release transaction submitted to the escrow."],
	["COMPLETED", "USDC delivered to the buyer, fee taken."],
	["LATE_PAYMENT_REVIEW", "Payment arrived after the deadline; held for review."],
	["PAYOUT_ON_HOLD / RELEASE_ON_HOLD", "Paused by an operator, with a recorded reason."],
	["REFUND_PENDING", "Buyer's fiat is being returned."],
	["CANCELLED", "Order expired or was cancelled; USDC returned to the listing."],
	["DISPUTED", "A party raised a dispute on-chain."],
];

const ERRORS: [string, string, string][] = [
	["400", "MALFORMED_REQUEST · INVALID_TRADE_ID · INVALID_AMOUNT", "The body or path is missing or invalid."],
	["400", "ESCROW_NOT_VERIFIED: …", "The on-chain listing doesn't match the seller, amount or state."],
	["401", "AUTHENTICATION_FAILED", "No valid session cookie, or it belongs to another wallet."],
	["403", "SELLER_CANNOT_… · CALLER_NOT_…", "The wallet isn't allowed to act on this trade."],
	["404", "TRADE_NOT_FOUND · UNKNOWN_SESSION", "No trade or verification session with that id."],
	["409", "…EXPIRED · NOT_AWAITING_… · REPLAY", "The trade moved on, or a proof was already used."],
	["422", "PAYMENT_NOT_CONFIRMED", "The provider hasn't reported a successful payment yet."],
];

export default function DocsPage() {
	const explorer = NETWORK.explorerUrl;
	return (
		<div className="flex min-h-screen flex-col">
			<div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 pb-24 pt-10 lg:grid-cols-[200px_minmax(0,1fr)]">
				{/* Side nav */}
				<aside className="hidden lg:block">
					<nav className="sticky top-24 space-y-0.5 text-sm">
						<p className="kicker mb-3 px-3">Docs</p>
						{SECTIONS.map((s) => (
							<a
								key={s.id}
								href={`#${s.id}`}
								className="block rounded-md px-3 py-1.5 text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
							>
								{s.label}
							</a>
						))}
					</nav>
				</aside>

				<article className="min-w-0 max-w-3xl">
					<p className="kicker">Developer docs</p>
					<h1 className="mt-4 text-[34px] font-bold leading-tight text-ink sm:text-[40px]">Integrate PeerNotary</h1>
					<p className="mt-4 text-base leading-relaxed text-ink-2">
						Add escrow-backed USDC ⇄ fiat trading to your product. Sellers lock USDC in a contract on Arc, buyers
						pay in their local currency, and the escrow releases only when the payment is proven.
					</p>

					<H2 id="overview">Overview</H2>
					<P>An integration has two halves that always stay in sync:</P>
					<ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-2">
						<li>
							<strong className="font-semibold text-ink">On-chain</strong>: the seller&apos;s wallet approves USDC and
							calls the escrow contract directly. Funds never pass through PeerNotary&apos;s servers.
						</li>
						<li>
							<strong className="font-semibold text-ink">HTTP API</strong>: lists offers, matches buyers, opens the
							payment checkout, verifies payment and tracks each trade&apos;s state.
						</li>
					</ul>
					<P>
						All endpoints are relative to your PeerNotary host and exchange JSON. Amounts in USDC are decimal strings
						(<code>&quot;250.00&quot;</code>) in the API and 6-decimal integer units on-chain.
					</P>

					<H2 id="networks">Networks</H2>
					<P>
						The app runs on one network at a time, chosen by <code>NEXT_PUBLIC_APP_NETWORK</code> (
						<code>testnet</code> or <code>mainnet</code>). These are the values this deployment is using:
					</P>
					<div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
						<table className="w-full text-sm">
							<tbody className="divide-y divide-line">
								{[
									["Network", NETWORK.chainName],
									["Chain ID", String(NETWORK.chainId)],
									["RPC", NETWORK.rpcUrl],
									["Escrow contract", NETWORK.escrowAddress],
									["USDC (ERC-20, 6 decimals)", NETWORK.usdcAddress],
									["Payments", NETWORK.paymentsLabel],
								].map(([k, v]) => (
									<tr key={k}>
										<td className="w-48 px-4 py-2.5 text-ink-3">{k}</td>
										<td className="break-all px-4 py-2.5 font-mono text-[12.5px] text-ink">{v}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<a
						href={`${explorer}/address/${NETWORK.escrowAddress}`}
						target="_blank"
						rel="noreferrer"
						className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
					>
						View the escrow on the explorer
						<ArrowUpRight size={14} />
					</a>

					<H2 id="auth">Authentication</H2>
					<P>
						Users sign in with their wallet (sign-in with Ethereum style). The server sets an HTTP-only{" "}
						<code>peernotary_session</code> cookie. Send it with every call (<code>credentials: &quot;include&quot;</code>
						) together with an <code>x-wallet-address</code> header naming the wallet you expect. The server rejects
						the call if they don&apos;t match.
					</P>
					<CodeBlock
						label="sign-in.ts"
						code={`// 1. Ask for a challenge
const ch = await fetch("/api/auth/nonce", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address }),
}).then((r) => r.json());          // { nonce, message, expiresAt, ... }

// 2. Sign the exact message with the wallet (personal_sign)
const signature = await walletClient.signMessage({ account: address, message: ch.message });

// 3. Exchange it for a session cookie
await fetch("/api/auth/verify", {
  method: "POST",
  credentials: "include",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address, nonce: ch.nonce, signature }),
});`}
					/>
					<Note>
						Challenges are single-use and expire. The wallet must be on chain <code>{NETWORK.chainId}</code> when it
						signs.
					</Note>

					<H2 id="flow">Trade flow</H2>
					<ol className="mt-4 space-y-5">
						{[
							[
								"Seller locks USDC",
								<>
									Approve the escrow for the amount, then call <code>initiateTrade(amount, hashedBankDetails)</code>.
									Read the new id from the <code>TradeInitiated</code> event.
								</>,
							],
							[
								"Publish the offer",
								<>
									<code>POST /api/user/dashboard</code> with <code>action: &quot;create_offer&quot;</code> and the
									on-chain <code>tradeId</code>. The server checks the listing on-chain before it goes live.
								</>,
							],
							[
								"Buyer takes it",
								<>
									<code>POST /api/user/dashboard</code> with <code>action: &quot;take_offer&quot;</code>. Partial
									amounts create a child order such as <code>12-1718900000</code>.
								</>,
							],
							[
								"Buyer pays",
								<>
									<code>POST /api/payments/flutterwave/checkout</code> returns a hosted <code>checkoutUrl</code>.
									Redirect the buyer there.
								</>,
							],
							[
								"The provider confirms payment",
								<>
									Flutterwave&apos;s signed webhook, checked again against Flutterwave&apos;s API, confirms the
									charge. The payment watcher also polls Flutterwave for every open payment, so nothing depends
									on the buyer returning. Nothing a client sends can mark a payment as paid.
								</>,
							],
							[
								"Escrow releases",
								<>
									Only then does the oracle settle on-chain, and the buyer receives USDC minus the fee. Poll{" "}
									<code>GET /api/trades/:tradeId/lifecycle</code> for <code>COMPLETED</code>.
								</>,
							],
						].map(([title, body], i) => (
							<li key={i} className="flex gap-4">
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
									{i + 1}
								</span>
								<div className="text-[15px] leading-relaxed text-ink-2 [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-ink">
									<div className="font-semibold text-ink">{title}</div>
									<div className="mt-0.5">{body}</div>
								</div>
							</li>
						))}
					</ol>
					<CodeBlock
						label="seller-deposit.ts (viem)"
						code={`import { keccak256, toBytes, parseUnits, parseEventLogs } from "viem";

const amount = parseUnits("250", 6);
// Same format the app uses: "bankName|accountNumber|sortCode"
const bankHash = keccak256(toBytes(\`\${bankName}|\${accountNumber}|\`));

await walletClient.writeContract({
  address: USDC, abi: erc20Abi, functionName: "approve",
  args: [ESCROW, amount], chainId: ${NETWORK.chainId},
});

const hash = await walletClient.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "initiateTrade",
  args: [amount, bankHash], chainId: ${NETWORK.chainId},
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const [{ args }] = parseEventLogs({ abi: escrowAbi, logs: receipt.logs, eventName: "TradeInitiated" });
const tradeId = args.tradeId.toString();`}
					/>

					<H2 id="endpoints">API reference</H2>
					<div className="mt-6">
						<Endpoint method="POST" path="/api/auth/nonce">
							Body <code>{"{ address }"}</code>. Returns a single-use challenge: <code>nonce</code>,{" "}
							<code>message</code>, <code>expiresAt</code>. A <code>GET ?address=</code> form also exists.
						</Endpoint>
						<Endpoint method="POST" path="/api/auth/verify">
							Body <code>{"{ address, nonce, signature }"}</code>. Sets the session cookie and returns{" "}
							<code>session</code> and <code>user</code>.
						</Endpoint>
						<Endpoint method="GET" path="/api/auth/session" auth="session">
							Returns whether the current cookie is valid for the wallet.
						</Endpoint>
						<Endpoint method="GET" path="/api/user/dashboard" auth="session">
							The signed-in user&apos;s trades, live offers, queue entries and trust summary.
						</Endpoint>
						<Endpoint method="POST" path="/api/user/dashboard" auth="session">
							Action-based. Main actions:
							<CodeBlock
								label="actions"
								code={`// List a funded sell offer (tradeId must exist on-chain and belong to the caller)
{ "action": "create_offer", "side": "sell", "tradeId": "12", "txHash": "0x…",
  "usdcAmount": "250", "bankName": "GTBank", "accountNumber": "0123456789", "rateNgn": 1380 }

// Take an offer, fully or partly
{ "action": "take_offer", "tradeId": "12", "requestedUsdcAmount": "40" }

// Cancel an unpaid order
{ "action": "cancel_trade", "tradeId": "12-1718900000", "cancelReason": "changed mind" }`}
							/>
							<code>rateNgn</code> is the fiat price per USDC. The name is kept for compatibility while more currencies
							are added.
						</Endpoint>
						<Endpoint method="POST" path="/api/payments/flutterwave/checkout" auth="session · buyer">
							Body <code>{"{ tradeId }"}</code>. Returns <code>checkoutUrl</code>, <code>txRef</code>,{" "}
							<code>expectedAmountMinor</code>, <code>expectedCurrency</code>, <code>expiresAt</code> and{" "}
							<code>paymentMode</code> (<code>flutterwave_test</code> or <code>flutterwave_live</code>).
						</Endpoint>
						<Endpoint method="POST" path="/api/payments/flutterwave/verify" auth="session">
							Body <code>{"{ tradeId, txRef, flwTransactionId? }"}</code>. Confirms with Flutterwave server-side and
							returns the updated <code>trade</code>. Safe to call more than once (<code>deduplicated: true</code>).
						</Endpoint>
						<Endpoint method="GET" path="/api/trades/:tradeId/lifecycle">
							Returns <code>trade</code>, the active payment <code>attempt</code> and the <code>auditEvents</code>{" "}
							timeline. Use this to poll for state changes.
						</Endpoint>
						<Endpoint method="POST" path="/api/trades/:tradeId/lifecycle" auth="session · party">
							Operational transitions such as <code>cancel</code>, <code>refund_request</code> and{" "}
							<code>escrow_confirm_on_chain</code>. A client-supplied <code>txHash</code> is checked on-chain before
							it&apos;s accepted.
						</Endpoint>
						<Endpoint method="GET" path="/api/rates/monierate">
							Live fiat/USDC market rate with 24h change. Add <code>?force=true</code> to skip the cache.
						</Endpoint>
						<Endpoint method="GET" path="/api/banks?country=NG">
							Banks supported for payouts in a country.
						</Endpoint>
						<Endpoint method="GET" path="/api/health">
							Service status, backend latency, chain ID and escrow address. Returns <code>207</code> when degraded.
						</Endpoint>
					</div>

					<H2 id="lifecycle">Trade states</H2>
					<P>
						<code>trade.lifecycleState</code> moves through these values. Separate <code>paymentState</code>,{" "}
						<code>escrowState</code> and <code>payoutState</code> fields give more detail.
					</P>
					<div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
						<table className="w-full text-sm">
							<tbody className="divide-y divide-line">
								{LIFECYCLE.map(([state, desc]) => (
									<tr key={state}>
										<td className="w-64 px-4 py-2.5 align-top font-mono text-[12px] text-ink">{state}</td>
										<td className="px-4 py-2.5 text-ink-2">{desc}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<H2 id="webhooks">Webhooks</H2>
					<P>PeerNotary receives webhooks. Point your providers at these URLs:</P>
					<div className="mt-5">
						<Endpoint method="POST" path="/api/payments/flutterwave/webhook">
							Set it as the webhook URL in your Flutterwave dashboard. Requests must carry <code>verif-hash</code>{" "}
							matching <code>FLW_SECRET_HASH</code> (or an HMAC <code>flutterwave-signature</code>). Successful
							charges are verified again with Flutterwave before the trade moves.
						</Endpoint>
						<Endpoint method="POST" path="/api/tlsn/webhook">
							For a TLSNotary verifier. Send <code>Authorization: Bearer $TLSN_WEBHOOK_SECRET</code> and the{" "}
							<code>sessionId</code> from <code>/api/tlsn/trades/:tradeId/verify</code>. A proof is stored as
							evidence; it never releases escrow on its own (returns <code>202</code> until the provider confirms
							payment).
						</Endpoint>
						<Endpoint method="POST" path="/api/payments/reconcile" auth="Bearer secret">
							Runs one payment-watcher pass: checks every open payment with Flutterwave, releases escrow on
							confirmed charges, marks failed or cancelled ones, retries failed releases and expires unpaid orders.
							Send <code>Authorization: Bearer $PAYMENT_RECONCILE_SECRET</code> (or <code>$CRON_SECRET</code>).
							The Rust service calls it every <code>RECONCILIATION_INTERVAL_SECONDS</code>; long-running Node hosts
							also run it every <code>PAYMENT_WATCHER_INTERVAL_MS</code>.
						</Endpoint>
					</div>
					<Note>
						Release rule, identical on testnet and mainnet: USDC moves to the buyer only when the order&apos;s
						payment attempt carries a Flutterwave transaction id, was confirmed by Flutterwave (webhook or verify
						API), and covers the full amount. Late payments are held for review. A seller may still choose to
						release their own USDC.
					</Note>

					<H2 id="contract">Escrow contract</H2>
					<P>
						<code>ArcP2PEscrowService</code> holds the USDC. All amounts are 6-decimal USDC units. Functions an
						integration calls directly:
					</P>
					<CodeBlock
						label="ArcP2PEscrowService.sol"
						code={`// Seller
function initiateTrade(uint256 cryptoAmount, bytes32 hashedBankDetails) returns (uint256 tradeId)
function withdrawAvailableInventory(uint256 listingId, uint256 amount)   // amount > 0 and ≤ unsold balance
function reclaimExpiredTrade(uint256 tradeId)
function releaseFunds(uint256 tradeId)

// Buyer
function fundBuyerCollateral(uint256 tradeId, uint256 collateral)        // collateral is 0 today
function markFiatSent(uint256 tradeId)
function raiseDispute(uint256 tradeId)

// Reads
function getTrade(uint256 tradeId) view returns (Trade)
function getListingInventory(uint256 listingId) view returns (SellerListingInventory)
function calculateNetRelease(uint256 tradeId) view returns (uint256 buyerReceives, uint256 platformFee)
function feeBps() view returns (uint256)

// Events
event TradeInitiated(uint256 indexed tradeId, address indexed seller, uint256 cryptoAmount, bytes32 hashedBankDetails)
event PartialOrderAllocated(uint256 indexed parentListingId, uint256 indexed childTradeId, address indexed buyer,
                            uint256 allocatedAmount, uint256 remainingAvailable)
event TradeCompleted(uint256 indexed tradeId, address indexed buyer, uint256 amountAfterFee, uint256 fee)`}
					/>
					<Note>
						Settlement after a proven fiat payment is done by the platform oracle (<code>oracleSettleOrder</code>), so
						sellers don&apos;t need to be online. Never send USDC to the contract directly. Only{" "}
						<code>initiateTrade</code> credits a listing.
					</Note>

					<H2 id="errors">Errors</H2>
					<P>
						Errors return a non-2xx status and <code>{"{ \"error\": \"CODE\" }"}</code>, sometimes with detail after a
						colon.
					</P>
					<div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
						<table className="w-full min-w-[560px] text-sm">
							<thead className="bg-subtle text-left text-xs text-ink-3">
								<tr>
									<th className="px-4 py-2.5 font-medium">Status</th>
									<th className="px-4 py-2.5 font-medium">Code</th>
									<th className="px-4 py-2.5 font-medium">Meaning</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-line">
								{ERRORS.map(([status, code, meaning]) => (
									<tr key={code}>
										<td className="px-4 py-2.5 font-mono text-[12px] text-ink">{status}</td>
										<td className="px-4 py-2.5 font-mono text-[12px] text-ink">{code}</td>
										<td className="px-4 py-2.5 text-ink-2">{meaning}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white px-6 py-5">
						<div>
							<div className="font-semibold text-ink">Try it on testnet</div>
							<div className="mt-0.5 text-sm text-ink-3">Flutterwave test cards work end to end. No real funds move.</div>
						</div>
						<Link href="/trade" className="btn-primary h-10 px-4">
							Open the trading desk
						</Link>
					</div>
				</article>
			</div>
			<Footer />
		</div>
	);
}
