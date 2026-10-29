# PeerNotary: Production-Grade P2P Escrow, Flutterwave Checkout & TLSNotary Service

PeerNotary is a B2B2C and P2P anti-fraud trading dApp built on the **Arc Network**. It pairs an on-chain USDC escrow smart contract (`ArcP2PEscrowService.sol`) with a Rust verification and trade-lifecycle backend (`rust/`), **Flutterwave Standard Hosted Checkout**, **TLSNotary** cryptographic bank proofs, and **Supabase PostgreSQL** persistence.

---

## 1. Architecture Overview & Ownership Boundaries

```text
peernotary/
├── frontend/                # Next.js 16 web application + Hardhat 3 escrow contracts
│   ├── app/                 # App Router views and server-side API route handlers
│   ├── components/          # React UI components (Dashboard, Settlement Portal, Widget)
│   ├── contracts/           # Solidity escrow smart contracts (ArcP2PEscrowService.sol)
│   ├── lib/                 # Wallet auth, Supabase helpers, Flutterwave server logic, Web3
│   └── scripts/             # Hardhat deployment scripts
│
├── rust/                    # Rust backend: Flutterwave lifecycle, Wallet Auth & TLSNotary
│   ├── src/
│   │   ├── lifecycle.rs     # 9-state trade machine, invariants, outbox & audit log
│   │   ├── flutterwave.rs   # Standard Checkout builder, decimal math, webhook verifier
│   │   ├── wallet_auth.rs   # EIP-191 personal_sign challenge, nonce & username registry
│   │   ├── payments_api.rs  # Axum HTTP handlers & background reconciliation worker
│   │   └── ...              # TLSNotary verification & secp256k1 attestation modules
│   └── tests/               # Integration and adversarial test suites
│
└── supabase/                # PostgreSQL schema migrations, RLS policies, and SQL tests
    ├── migrations/
    │   ├── 20261028000001_initial_schema.sql
    │   ├── 20261028000002_rls_policies.sql
    │   └── 20261028000003_functions_and_triggers.sql
    └── tests/
        └── rls_and_invariants_test.sql
```

### Trust & Ownership Boundaries
- **Rust Backend (`rust/`)**: Authoritative engine for payment initialization, Flutterwave webhook signature validation (`verif-hash` and HMAC-SHA256), server-to-server transaction verification, seller payout orchestration, refund lifecycles, TLSNotary presentation verification, and background reconciliation.
- **Supabase PostgreSQL (`supabase/`)**: Authoritative persistence layer enforcing Row-Level Security (RLS), optimistic concurrency (`version`), immutable trade terms (`terms_locked`), append-only audit logs (`trade_audit_events`), and atomic state transition triggers (`transition_trade_atomic`).
- **Next.js Frontend (`frontend/`)**: Provides the responsive user interface, wallet challenge/signature flow, optional `@username` onboarding, real-time trade status updates, and authenticated proxy routes to the Rust backend. It never holds provider secret keys in client bundles and never trusts client redirect query parameters as proof of payment.
- **Arc Smart Contract (`ArcP2PEscrowService.sol`)**: Holds locked seller USDC principal and buyer anti-fraud collateral until authorized release (`oracleRelease` / `markFiatSent`) or verified refund cancellation.

---

## 2. Prerequisites & Local Dependencies

- **Node.js** >= 18 and **npm** >= 9
- **Rust & Cargo** >= 1.78 (`rustup` stable toolchain)
- **Supabase CLI** >= 1.180 (or a hosted Supabase PostgreSQL 15+ instance)
- **Flutterwave Account** (Test/Sandbox API credentials for local development; Live credentials for production)
- **EVM Wallet** (MetaMask, Rabby, or Coinbase Wallet) configured for **Arc Testnet** (Chain ID `5042002`)

---

## 3. Supabase Project Setup & Migration Execution Order

Apply the SQL migrations in strict chronological order using either the Supabase CLI or `psql`:

```bash
# Option A: Using Supabase CLI
supabase db reset

# Option B: Direct psql execution in exact order
psql "$DATABASE_URL" -f supabase/migrations/20261028000001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20261028000002_rls_policies.sql
psql "$DATABASE_URL" -f supabase/migrations/20261028000003_functions_and_triggers.sql
```

### Migration Order Details
1. `20261028000001_initial_schema.sql`: Creates `profiles`, `wallet_accounts`, `wallet_nonces`, `wallet_sessions`, `trades`, `payment_attempts`, `payment_events`, `seller_payouts`, `refunds`, `escrow_operations`, `trade_audit_events`, and `outbox_jobs` with UUID keys, minor-unit integer columns (`BigInt`), and uniqueness indexes.
2. `20261028000002_rls_policies.sql`: Enables and forces Row-Level Security across all 12 tables.
3. `20261028000003_functions_and_triggers.sql`: Installs UTC timestamp triggers, physical delete guards on financial tables, immutable trade term guards, legal state-transition validation triggers, and the `transition_trade_atomic` RPC function.

---

## 4. Row-Level Security (RLS) & Least-Privilege Database Access

- Every table in `public` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- Authenticated client queries can read only their own `profiles`, `wallet_accounts`, `wallet_sessions`, and `trades` where they are the `buyer_profile_id` or `seller_profile_id`.
- Untrusted client tokens (`anon` and `authenticated`) are **denied direct `INSERT`, `UPDATE`, and `DELETE`** on `trades`, `payment_attempts`, `payment_events`, `seller_payouts`, `refunds`, `escrow_operations`, `trade_audit_events`, and `outbox_jobs`.
- Only the backend using `SUPABASE_SERVICE_ROLE_KEY` (or a dedicated backend database role) can mutate trade states and financial records.

---

## 5. Wallet Authentication, Session Issuance & Optional Username Onboarding

1. **Challenge Request**: Client calls `POST /api/auth/nonce` (or Rust `POST /api/v1/auth/challenge`) with `{ address }`. The backend generates a single-use cryptographic nonce with a 5-minute TTL bound to the normalized lowercase wallet address and Chain ID (`5042002`).
2. **Signature Verification**: The user signs the EIP-191 message in their wallet and submits `{ address, nonce, signature }` to `POST /api/auth/verify` (or Rust `POST /api/v1/auth/verify`). The server atomically consumes the nonce, recovers the secp256k1 signer address, creates or updates the wallet profile, and sets an `HttpOnly`, `SameSite=Lax` signed session cookie (`peernotary_wallet_session`).
3. **Wallet Switching Isolation**: Switching wallets in the browser immediately invalidates the active session and clears cached trade data so Wallet B never inherits Wallet A's session.
4. **Optional Username Onboarding**: First-time wallet users see a non-blocking banner in `/dashboard` allowing them to claim a unique `@username` (`PUT /api/user/username`, validated as `^[a-zA-Z0-9_]{3,24}$`, case-insensitively unique, and checked against reserved names) or click **Skip for now**.

---

## 6. Flutterwave Test Credentials, Redirect URLs & Webhook Configuration

1. Log in to the [Flutterwave Dashboard](https://dashboard.flutterwave.com) and switch to **Test Mode**.
2. Navigate to **Settings -> API Keys** and copy your **Secret Key** (`FLWSECK_TEST-...`).
3. Navigate to **Settings -> Webhooks**:
   - Set the **Webhook URL** to your publicly reachable Rust endpoint (`/api/v1/webhooks/flutterwave`) or Next.js webhook route (`/api/payments/flutterwave/webhook`).
   - Set a strong **Secret Hash** (`FLW_SECRET_HASH`).
   - Enable webhook notifications for failed and successful transactions.
4. Configure `FLW_REDIRECT_URL=http://localhost:3000/bank-checkout` (or your production domain).
5. **Security Rule**: The browser redirect callback (`?status=successful&tx_ref=...&transaction_id=...`) is treated strictly as a UI trigger. The backend always calls Flutterwave's `GET /v3/transactions/{id}/verify` endpoint directly and validates:
   - `status == "successful"`
   - `tx_ref` matches the active payment attempt for the trade
   - `currency` matches `trade.fiat_currency` (`NGN`)
   - `amount` in minor units (kobo) is >= `trade.expected_amount_minor`

---

## 7. Seller Payout Configuration & Manual Approval Workflow

PeerNotary separates buyer checkout collection from seller fiat disbursement:
1. After buyer payment verification (`PAYMENT_CONFIRMED`), the trade moves to `SELLER_PAYOUT_PENDING` with an independent `payout_reference`.
2. When the seller's bank transfer settles (`SELLER_PAYOUT_CONFIRMED`), the trade becomes eligible for on-chain USDC release (`RELEASE_PENDING` -> `COMPLETED`).
3. If the seller payout fails or is delayed by the bank rail, the trade transitions to `PAYOUT_ON_HOLD`. Escrow remains locked on-chain.
4. From `PAYOUT_ON_HOLD`, operators or the settlement engine can either retry the payout or, with explicit seller/operator authorization, initiate a buyer refund (`REFUND_PENDING` -> `CANCELLED`).

---

## 8. Arc Network & Smart Contract Configuration

The escrow smart contract is located at `frontend/contracts/ArcP2PEscrowService.sol`.

| Parameter | Value |
| :--- | :--- |
| Network Name | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Block Explorer | `https://testnet.arcscan.app` |
| Default Escrow Contract | `0x5042f1114C6F272f5909f16510399986EF0D734D` |

To compile and deploy a new instance:
```bash
cd frontend
npx hardhat compile
npx hardhat run scripts/deploy.ts --network arcTestnet
```

---

## 9. Complete Environment Variable Reference

Copy the example environment templates before starting the services:
```bash
cp frontend/.env.example frontend/.env.local
cp rust/.env.example rust/.env
```

### Frontend (`frontend/.env.example`)
- `NEXT_PUBLIC_APP_URL`: Public base URL of the Next.js app (`http://localhost:3000`)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase anon/publishable key
- `NEXT_PUBLIC_ESCROW_ADDRESS`: Deployed `ArcP2PEscrowService` address
- `NEXT_PUBLIC_USDC_ADDRESS`: Arc USDC token contract address
- `RUST_API_BASE_URL`: Internal URL of the Rust backend (`http://127.0.0.1:7047`)
- `RUST_API_AUTH_SECRET`: Shared 32-byte secret for Next.js-to-Rust authentication
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only Supabase service role key
- `WALLET_SESSION_SECRET`: Server-only HMAC secret for signing wallet session cookies
- `FLW_SECRET_KEY`: Server-only Flutterwave secret key
- `FLW_SECRET_HASH`: Server-only Flutterwave webhook secret hash

### Rust Backend (`rust/.env.example`)
- `APP_ENV`: `development` or `production`
- `HOST` / `PORT`: Bind address (`0.0.0.0:7047`)
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Supabase service credentials
- `FLW_SECRET_KEY` / `FLW_SECRET_HASH` / `FLW_BASE_URL` / `FLW_REDIRECT_URL` / `FLW_CURRENCY`: Flutterwave configuration
- `RUST_API_AUTH_SECRET` / `TLSN_SERVICE_API_KEY`: Shared service authentication secret
- `ARC_RPC_URL` / `ARC_CHAIN_ID` / `ARC_ESCROW_CONTRACT_ADDRESS` / `ARC_USDC_CONTRACT_ADDRESS` / `ARC_SIGNER_PRIVATE_KEY`: Arc network and oracle signer configuration
- `NOTARY_SIGNING_KEY_HEX`: 32-byte hex secp256k1 private key for TLSNotary attestations
- `TRADE_PAYMENT_TIMEOUT_MINUTES`: Buyer payment window in minutes (default `20`)
- `RECONCILIATION_INTERVAL_SECONDS`: Background reconciliation worker cadence (default `30`)
- `MAX_PROVIDER_RETRIES`: Maximum outbox retry attempts (default `5`)

---

## 10. Starting All Services Together

### Terminal 1: Start the Rust Backend Service
```bash
cd rust
cargo run
```
The Rust service listens on `http://127.0.0.1:7047` and starts the background reconciliation worker.

### Terminal 2: Start the Next.js Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000/dashboard` to connect your wallet, complete optional `@username` onboarding, publish or join an offer, and execute the 6-step settlement flow.

---

## 11. Running Automated Tests

### Rust Unit, Lifecycle, Webhook & Security Tests
```bash
cd rust
cargo test
```
Covers decimal-to-minor-unit conversion, Flutterwave webhook signature validation (`verif-hash` and HMAC-SHA256), duplicate webhook idempotency, EIP-191 signature recovery, nonce replay rejection, username validation and uniqueness, checkout ownership, 9-state lifecycle transitions, gated escrow release, underpayment holds, late payment review, and refund flows.

### Frontend TypeScript Verification
```bash
cd frontend
npm run typecheck
```

### Supabase SQL RLS & Invariant Tests
```bash
psql "$DATABASE_URL" -f supabase/tests/rls_and_invariants_test.sql
```

---

## 12. Testing Normal Checkout, Holds, Late Payments & Refunds Locally

1. **Normal 6-Step Settlement**:
   - Connect wallet on `/dashboard`, join a peer offer or open `/bank-checkout?tradeId=8801`.
   - Click **Pay with Flutterwave Standard** (or **Verify Payment Now** in test mode) to advance from `AWAITING_PAYMENT` -> `PAYMENT_CONFIRMED`.
   - Click **Initiate & Confirm Seller Payout** (`PAYMENT_CONFIRMED` -> `SELLER_PAYOUT_PENDING` -> `SELLER_PAYOUT_CONFIRMED`).
   - Click **Release Escrow on Arc Network** (`SELLER_PAYOUT_CONFIRMED` -> `RELEASE_PENDING` -> `COMPLETED`).
2. **Payout Failure (`PAYOUT_ON_HOLD`) & Refund (`REFUND_PENDING`)**:
   - In the Settlement Portal (`/bank-checkout`), click **Simulate Payout Hold** while in `PAYMENT_CONFIRMED`.
   - The trade enters `PAYOUT_ON_HOLD` and appears in the **Trades Requiring Attention** banner on `/dashboard`.
   - From `PAYOUT_ON_HOLD`, either click **Confirm Seller Payout** to recover or click **Authorize Buyer Refund** -> **Confirm Refund Settled** to transition through `REFUND_PENDING` to `CANCELLED`.
3. **Escrow Release Hold (`RELEASE_ON_HOLD`)**:
   - If an on-chain release transaction fails or reverts, the trade moves to `RELEASE_ON_HOLD` so no duplicate release or premature cancellation occurs until reconciled.

---

## 13. Reconciling Stuck Trades Safely

The Rust backend runs an automatic reconciliation loop every `RECONCILIATION_INTERVAL_SECONDS` (default 30s) and also exposes an authenticated manual trigger:

```bash
curl -X POST http://127.0.0.1:7047/api/v1/reconcile/run \
  -H "x-service-api-key: $RUST_API_AUTH_SECRET"
```

When a trade passes its 20-minute `payment_deadline_at`:
- If no payment attempt succeeded, the worker transitions the trade from `AWAITING_PAYMENT` to `CANCELLED`.
- If a payment arrives after the deadline, verification places the trade into `LATE_PAYMENT_REVIEW` rather than silently dropping the buyer's funds or auto-releasing escrow.

---

## 14. Sandbox-to-Production Checklist

1. Set `APP_ENV=production` in `rust/.env`. The Rust config validator enforces that production keys are non-empty and rejects test keys (`FLWSECK_TEST-`) when `APP_ENV=production`.
2. Apply all three Supabase migrations (`000001`, `000002`, `000003`) to your production Supabase database and verify RLS with `supabase/tests/rls_and_invariants_test.sql`.
3. Replace `FLW_SECRET_KEY` and `FLW_SECRET_HASH` with live Flutterwave credentials and point the Flutterwave live webhook URL to `https://api.yourdomain.com/api/v1/webhooks/flutterwave`.
4. Configure dedicated production keys for `RUST_API_AUTH_SECRET`, `WALLET_SESSION_SECRET`, `NOTARY_SIGNING_KEY_HEX`, and `ARC_SIGNER_PRIVATE_KEY`.
5. Verify `/health/ready` on the Rust backend returns HTTP `200 OK` before routing live traffic.
