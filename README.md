# PeerNotary — P2P Escrow As-a-Service

A secure B2B2C developer platform and P2P anti-fraud trading dApp built on the **Arc Network**.  
Features a full **Developer Dashboard** (API keys, live charts, widget preview) and an interactive **P2P Escrow Trading Widget** (4-step flow with ZK proofs, open banking, and dispute arbitration).

---

## Monorepo Structure

```text
peernotary/
├── frontend/                # Next.js web application + Hardhat escrow contracts
│   ├── app/                 # App Router (views and API routes)
│   ├── components/          # React UI components
│   ├── contracts/           # Solidity escrow smart contracts
│   ├── lib/                 # Web3, Oracle, and TLSN verification helpers
│   ├── scripts/             # Hardhat deployment scripts
│   ├── hardhat.config.ts    # Hardhat 3 configuration
│   ├── package.json         # Frontend dependencies and scripts
│   └── ...
│
├── rust/                    # TLSNotary Rust service
│   ├── src/                 # Rust service source code
│   ├── Cargo.toml           # Cargo manifest
│   └── ...
│
├── .gitignore               # Root git ignore
└── README.md
```

---

## Getting Started

### 1. Frontend & Smart Contracts (`frontend/`)

#### Prerequisites

- **Node.js ≥ 18** (`node -v`)
- **npm ≥ 9** (or `yarn` / `pnpm`)

#### Install & Run Dev Server

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Build & Typecheck

```bash
cd frontend

# Typecheck
npm run typecheck

# Production build
npm run build
```

---

### 2. TLSNotary & Cryptographic Verification Rust Service (`rust/`)

Production-grade Rust verification service built on `tlsn-core` (`v0.1.0-alpha.12`), `axum`, `tokio`, `k256`, and `tiny-keccak`. It enforces cryptographic verification of TLSNotary `Presentation` payloads (Notary key pinning, X.509 certificate chain validation, BLAKE3 Merkle transcript commitments), exact integer financial comparisons, SSRF/domain allowlist enforcement, anti-replay tracking, and domain-separated secp256k1 escrow binding attestations (`PEERNOTARY_TLSN_ESCROW_V1`).

#### Prerequisites

- **Rust & Cargo** (`rustc --version`, `cargo --version`)

#### Configure, Test & Run

```bash
cd rust
cp .env.example .env

# Check compilation
cargo check --all-targets

# Run unit & adversarial security tests
cargo test

# Lint & format verification
cargo fmt --check
cargo clippy --all-targets -- -D warnings

# Run service (defaults to 0.0.0.0:7047)
cargo run
```

#### Rust Service API Surface

- `GET /health/live` — Liveness probe
- `GET /health/ready` & `GET /health` — Readiness & cryptographic subsystem status (redacts all secrets)
- `POST /api/v1/sessions` — Initialize an authenticated TLSNotary verification session bound to `(tradeId, buyerAddress, expectedAmountUnits, expectedCurrency, targetDomain, chainId, escrowAddress)`
- `GET /api/v1/sessions/{id}` — Retrieve session state (enforces principal ownership)
- `POST /api/v1/sessions/{id}/execute` — Execute/verify a TLSNotary presentation for a session
- `POST /api/v1/sessions/{id}/cancel` — Cancel an active session
- `POST /api/v1/proofs/verify` — Cryptographically verify a `tlsn_core::presentation::Presentation`, enforce financial and anti-replay invariants, sign an escrow binding attestation, and optionally dispatch the Next.js webhook callback
- `GET /api/v1/proofs/{id}` — Retrieve verified proof summary & binding attestation
- `GET /api/v1/proofs/{id}/evidence` — Retrieve extracted payment evidence
- `POST /api/v1/escrow/evaluate-release` — Deterministically evaluate whether an on-chain escrow trade is eligible for `oracleRelease(tradeId, proofId)`

---

## Smart Contract: Hardhat & Deployment

The escrow contract lives in `frontend/contracts/ArcP2PEscrowService.sol`. Hardhat 3 (with `@nomicfoundation/hardhat-ethers`) compiles it and `frontend/scripts/deploy.ts` pushes it to Arc Testnet. The Next.js app never deploys anything — it only talks to a contract that already exists, so deploy first, then wire the address into the frontend.

### What you need before starting

- Node ≥ 18 and `npm install` run inside `frontend/`
- A throwaway wallet whose private key is configured in `frontend/.env`
- Testnet USDC in that wallet (native gas token on Arc). Use Circle's faucet at <https://faucet.circle.com> and select Arc Testnet.
- Three addresses required by the contract constructor (`constructor(address _usdc, address _treasury, address _oracle)`):
  1. the USDC token contract on Arc Testnet
  2. a treasury address that collects platform fees
  3. an oracle address, the account allowed to confirm fiat proofs / resolve disputes

### Network Facts

| Item      | Value                                          |
| --------- | ---------------------------------------------- |
| Chain ID  | `5042002`                                      |
| RPC       | `https://rpc.testnet.arc.io`                   |
| Explorer  | `https://testnet.arcscan.app`                  |
| Gas token | USDC (6 decimals, not 18)                      |
| Solidity  | `0.8.20` (set in `frontend/hardhat.config.ts`) |

### Step 1 — Fill in `frontend/.env`

```env
ARC_RPC_URL=https://rpc.testnet.arc.io
ARC_PRIVATE_KEY=0xyour_throwaway_private_key
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_ARC_TREASURY_WALLET=0x...
ORACLE_ADDRESS=0x...
```

### Step 2 — Compile

```bash
cd frontend
npx hardhat compile
```

### Step 3 — Deploy to Arc Testnet

```bash
cd frontend
npx hardhat run scripts/deploy.ts --network arcTestnet
```

Update `NEXT_PUBLIC_ESCROW_ADDRESS` in `frontend/.env` with the deployed contract address.

---

## Deployment (Railway & Vercel)

The monorepo structure allows the frontend and Rust service to be deployed independently:

- **Frontend (Next.js)**: Set root directory / base directory to `frontend` on Railway or Vercel.
- **Rust Service**: Set root directory to `rust` on Railway with a Cargo build when ready for production.

---

## Design System

| Token           | Value     | Usage                      |
| --------------- | --------- | -------------------------- |
| Void Black      | `#080C14` | Page background            |
| Card BG         | `#0D1322` | Card surfaces              |
| Electric Violet | `#7C3AED` | Primary CTA, active states |
| Mint Green      | `#10B981` | Confirmed / success states |
| Amber           | `#F59E0B` | In-escrow / warning        |
| Slash Red       | `#EF4444` | Disputed / danger          |
| Cyan            | `#06B6D4` | Network / info             |

---

Built with ⚡ on Arc Network.
