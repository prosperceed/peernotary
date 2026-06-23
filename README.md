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
