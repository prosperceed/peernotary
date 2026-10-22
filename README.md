# Arc P2P — NGN/USDC Escrow As-a-Service

A production-ready B2B2C developer platform + P2P trading dApp built on the **Arc Network**.  
Features a full **Developer Dashboard** (API keys, live charts, widget preview) and an interactive **P2P Escrow Trading Widget** (4-step flow with ZK proofs, open banking, and dispute arbitration).

---

## Tech Stack

| Layer        | Choice                                      |
|-------------|---------------------------------------------|
| Framework    | Next.js 14 (App Router)                     |
| Language     | TypeScript (strict)                         |
| Styling      | Tailwind CSS v3                             |
| Icons        | Lucide React                                |
| Fonts        | Inter (Google Fonts) + system mono          |
| State        | React `useState` / `useEffect` (no Redux)   |

---

## Quick Start

### 1. Prerequisites

- **Node.js ≥ 18** — check with `node -v`
- **npm ≥ 9** or **yarn** / **pnpm**

### 2. Clone & Install

```bash
# If you downloaded the zip, just cd into the folder:
cd arc-p2p

# Install dependencies
npm install
# or: yarn install / pnpm install
```

### 3. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.  
Hot-reload is enabled — any file save triggers an instant update.

### 4. Build for Production

```bash
npm run build
npm run start
```

---

## Project Structure

```
arc-p2p/
├── app/
│   ├── globals.css          # Arc design tokens, custom scrollbars, animations
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Root page — orchestrates Dev/Trader view switch
│
├── components/
│   ├── shared/
│   │   ├── index.tsx        # Badge, MetricCard, StepBar, SparkLine, CountdownRing
│   │   ├── Navbar.tsx       # Sticky nav with view toggle
│   │   └── Footer.tsx       # Footer with network info
│   │
│   ├── dashboard/
│   │   └── DevDashboard.tsx # B2B dashboard: metrics, charts, API panel, tx table
│   │
│   └── trading/
│       └── TradingWidget.tsx # B2C widget: 4-step escrow flow
│
├── lib/
│   └── utils.ts             # cn(), calcUsdc(), RATE constant, formatNgn()
│
├── types/
│   └── index.ts             # Shared TypeScript types
│
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── next.config.ts
└── package.json
```

---

## Features by View

### Developer View (B2B)

Switch using the **Developer View** button in the navbar.

| Widget | Description |
|--------|-------------|
| Metrics Row | 24h volume, active escrows, avg settlement time, dispute rate — all with trend indicators |
| Volume Chart | SVG sparkline with 1D/7D/30D toggle |
| API Key Panel | Show/hide key, copy-to-clipboard, live SDK status badges |
| Escrow Pool Chart | Live pool size with mini breakdown |
| Transaction Feed | Real-time table with status badges (Completed / In Escrow / Disputed) |
| Widget Preview | Toggle to embed the live P2P widget inline with a code snippet |
| Network Health | RPC latency, oracle uptime, pending arbitrations, gas cost |

### Trader View (B2C)

Switch using the **Trader View** button.

| Step | Feature |
|------|---------|
| Step 1 — Order Creation | NGN/USDC input with live rate calc, platform fee, order metadata |
| Step 2 — Verification | Deprecation notice for visual receipts; choose Open Banking (OPay/GTBank/Access/Kuda) or ZK Web-Proof (animated TLSNotary terminal) |
| Step 3 — Escrow Lock | Animated countdown ring, locked funds tracker, Arc escrow status |
| Step 4 — Chat & Dispute | Real-time P2P chat, send messages, trigger arbitration with slashing penalty disclosure |

---

## Customisation

### Change the exchange rate

```ts
// lib/utils.ts
export const RATE = 1630; // ← update this
```

### Add more banks to the Open Banking list

```tsx
// components/trading/TradingWidget.tsx  →  Step 1 verification panel
{["OPay", "GTBank", "Access Bank", "Kuda", "Zenith Bank"].map(...)}
```

### Swap accent colour (violet → blue, etc.)

Update `tailwind.config.ts` and the hardcoded hex values in `globals.css`.

---

## Environment Variables (for real API integration)

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.arc-network.io
NEXT_PUBLIC_FINCRA_KEY=your_fincra_key
NEXT_PUBLIC_MONO_KEY=your_mono_key
NEXT_PUBLIC_RECLAIM_APP_ID=your_reclaim_id
```

These are not wired up in this demo — all data is mocked for UI presentation.

---

## Smart Contract: Hardhat & Deployment

The escrow contract lives in `contracts/ArcP2PEscrowService.sol`. Hardhat 2 (with `hardhat-toolbox`) compiles it and `scripts/deploy.ts` pushes it to Arc Testnet. The Next.js app never deploys anything — it only talks to a contract that already exists, so deploy first, then wire the address into the frontend.

### What you need before starting

- Node ≥ 18 and `npm install` already run
- A throwaway wallet (never your main one) whose private key you can paste into `.env`
- Testnet USDC in that wallet. On Arc, USDC *is* the gas token, so there is no separate ETH-style faucet step: no USDC, no deployment. Use Circle's faucet at <https://faucet.circle.com> and pick Arc Testnet.
- Three addresses the constructor wants (`constructor(address _usdc, address _treasury, address _oracle)`):
  1. the USDC token contract on Arc Testnet
  2. a treasury address that collects platform fees
  3. an oracle address, the account allowed to confirm fiat proofs / resolve disputes

### Network facts

| Item     | Value                                  |
|----------|----------------------------------------|
| Chain ID | `5042002`                              |
| RPC      | `https://rpc.testnet.arc.network`      |
| Explorer | `https://testnet.arcscan.app`          |
| Gas token| USDC (6 decimals, not 18)              |
| Solidity | `0.8.20` (set in `hardhat.config.ts`)  |

### Step 1 — Fill in `.env`

Hardhat reads `.env` through `dotenv`. These are the variables the Hardhat side actually consumes:

```env
# signs the deploy transaction (read by hardhat.config.ts)
ARC_PRIVATE_KEY=0xyour_throwaway_private_key

# constructor args (read by scripts/deploy.ts)
NEXT_PUBLIC_ARC_DEPLOYER_WALLET=0x...   # see the warning below — this is passed as the USDC address
NEXT_PUBLIC_ARC_TREASURY_WALLET=0x...
ORACLE_ADDRESS=0x...
```

> [!WARNING]
> Three things in the repo as it stands will trip you up. Fix them before a real deploy.
>
> 1. **Key name mismatch.** `hardhat.config.ts` reads `ARC_PRIVATE_KEY`, but a typical `.env` here has `NEXT_PUBLIC_ARC_DEPLOYER_KEY`. If `ARC_PRIVATE_KEY` is missing, Hardhat quietly falls back to a dummy key and the deploy fails with an unhelpful signer or funds error. Either add `ARC_PRIVATE_KEY` or change the config to read the name you use.
> 2. **The USDC argument is wrong.** In `scripts/deploy.ts` the variable `USDC_TESTNET_ADDRESS` is filled from `NEXT_PUBLIC_ARC_DEPLOYER_WALLET`, which is your wallet, not a token. The escrow would be bound to an EOA and every transfer would revert. Point it at the real USDC token address (a dedicated variable such as `USDC_ADDRESS` is cleanest).
> 3. **Never prefix a private key with `NEXT_PUBLIC_`.** Next.js inlines those variables into the browser bundle. Deployer and oracle keys belong in plain, unprefixed variables.

The `url` in the `arcTestnet` network entry of `hardhat.config.ts` is `https://arc.network`, which is the marketing site. Change it to `https://rpc.testnet.arc.network` (the same RPC `lib/web3/arcConfig.ts` uses) or Hardhat will not reach a node.

### Step 2 — Compile

```bash
npx hardhat compile
```

This writes ABIs to `artifacts/` and TypeScript bindings to `typechain-types/`. Both folders are generated, so re-running is safe. If the compiler complains about missing OpenZeppelin imports, run `npm install` again. If you changed Solidity and the output looks stale, clear it:

```bash
npx hardhat clean && npx hardhat compile
```

### Step 3 — Dry run on the in-process network

Before you spend testnet funds, confirm the script itself runs. With no `--network` flag, Hardhat spins up a disposable chain in memory:

```bash
npx hardhat run scripts/deploy.ts
```

You will get an address, but it is throwaway. Note that this only validates the script and compilation. The constructor args will probably be `undefined`/invalid unless `.env` is filled in.

If you want a persistent local chain the frontend can point at (handy for UI work without a wallet full of testnet USDC):

```bash
# terminal 1 — long-running node at http://127.0.0.1:8545, chainId 31337
npx hardhat node

# terminal 2 — deploy to it
npx hardhat run scripts/deploy.ts --network localhost
```

`localhost` is built in. The Next.js app is hard-coded to Arc Testnet (chain `5042002`), so to use this node from the UI you would also have to add a local chain in `arcConfig.ts` and in your wallet. Most of the time, skipping straight to testnet is less work.

### Step 4 — Deploy to Arc Testnet

```bash
npx hardhat run scripts/deploy.ts --network arcTestnet
```

Expected output:

```
Deploying ArcP2PEscrowService...
Arc Escrow deployed successfully to: 0x....
```

Copy that address now; the script does not save it anywhere. Check it at `https://testnet.arcscan.app/address/<address>`.

### Step 5 — Hand the address to the frontend

`lib/web3/arcConfig.ts` currently resolves its addresses like this:

```ts
export const ESCROW_ADDRESS = process.env.ORACLE_ADDRESS || "0x000…000";
export const USDC_ADDRESS   = process.env.NEXT_PUBLIC_ARC_TREASURY_ADDRESS || "0x000…001";
```

Those variables look swapped: the escrow address is read from `ORACLE_ADDRESS`, and USDC from a treasury variable (with a slightly different name than the one in `.env`, `..._TREASURY_WALLET`). Also, `ORACLE_ADDRESS` has no `NEXT_PUBLIC_` prefix, so it is `undefined` in browser code and the fallback zero address wins silently. Clean it up like this:

```ts
export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  "0x0000000000000000000000000000000000000001") as `0x${string}`;
```

and in `.env`:

```env
NEXT_PUBLIC_ESCROW_ADDRESS=0x_address_printed_by_deploy
NEXT_PUBLIC_USDC_ADDRESS=0x_usdc_token_on_arc_testnet
```

Public addresses are safe to expose. Restart `npm run dev` afterwards. Next.js only reads `.env` at startup.

### Step 6 — Smoke test

1. `npm run dev`, open the Trader view, connect a wallet on Arc Testnet (chain `5042002`).
2. Start a trade. The wallet should first ask for a USDC `approve` and then call `initiateTrade`.
3. Find the transaction on ArcScan and confirm the `TradeInitiated` event came from your escrow address.

If the wallet is asked to interact with `0x000…000`, the frontend is still on the fallback address. Step 5 did not take effect.

### Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `HH108` / connection errors on `--network arcTestnet` | Wrong RPC `url` in `hardhat.config.ts` |
| `insufficient funds` or `invalid private key` | `ARC_PRIVATE_KEY` unset (dummy fallback in use) or wallet has no testnet USDC |
| Deploy succeeds, but every trade reverts | USDC constructor arg was a wallet, not the token |
| UI shows the zero address | `NEXT_PUBLIC_` prefix missing, or dev server not restarted |
| `Cannot find module '../typechain-types'` | Run `npx hardhat compile` first |
| Gas looks wrong in the UI/script | Arc gas is USDC with 6 decimals, so don't assume 18 |

### Redeploying

Contracts are immutable. Any Solidity change means a fresh deployment, a new address, and an update to `NEXT_PUBLIC_ESCROW_ADDRESS`. Trades created on the old contract stay there and are not migrated, so finish or reclaim them first (`reclaimExpiredTrade`).

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Void Black | `#080C14` | Page background |
| Card BG | `#0D1322` | Card surfaces |
| Electric Violet | `#7C3AED` | Primary CTA, active states |
| Mint Green | `#10B981` | Confirmed / success states |
| Amber | `#F59E0B` | In-escrow / warning |
| Slash Red | `#EF4444` | Disputed / danger |
| Cyan | `#06B6D4` | Network / info |

All components use `backdrop-blur`, `border-slate-700/50` glass borders, and `hover:border-violet-500/40` glow effects.

---

Built with ⚡ on Arc Network.
