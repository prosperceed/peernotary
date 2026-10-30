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
    │   ├── 20261028000003_functions_and_triggers.sql
    │   └── 20261029000004_seller_escrow_queue_and_risk.sql
    └── tests/
        └── rls_and_invariants_test.sql
```

### Trust & Ownership Boundaries
- **Rust Backend (`rust/`)**: Authoritative engine for payment initialization, Flutterwave webhook signature validation (`verif-hash` and HMAC-SHA256), server-to-server transaction verification, seller payout orchestration, refund lifecycles, seller listing inventory conservation, deterministic FIFO buyer queues, adaptive trust scoring, progressive cooldowns, and TLSNotary presentation verification.
- **Supabase PostgreSQL (`supabase/`)**: Authoritative persistence layer enforcing Row-Level Security (RLS) on every table, optimistic concurrency (`version`), immutable trade terms (`terms_locked`), append-only audit logs (`trade_audit_events`), inventory conservation `CHECK` constraints (`seller_listings`), single active seller slot partial unique index (`idx_one_active_slot_per_listing`), and atomic RPC functions (`transition_trade_atomic`, `recalculate_trust_tier_atomic`, `record_trade_expiration_and_cooldown_atomic`).
- **Next.js Frontend (`frontend/`)**: Provides the responsive user interface, wallet challenge/signature flow, optional `@username` onboarding, real-time trade status updates, partial-fill order controls, FIFO queue management, trust tier progression, and authenticated proxy routes to the Rust backend. It never holds provider secret keys in client bundles and never trusts client redirect query parameters as proof of payment.
- **Arc Smart Contract (`ArcP2PEscrowService.sol`)**: Authoritative on-chain vault holding seller-funded USDC inventory (`SellerListingInventory`), enforcing child partial-fill allocations (`allocatePartialOrder`), reconciled inventory withdrawal (`withdrawAvailableInventory`), and zero buyer collateral (`SLASH_AMOUNT = 0`).

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
psql "$DATABASE_URL" -f supabase/migrations/20261029000004_seller_escrow_queue_and_risk.sql
```

### Migration Order Details
1. `20261028000001_initial_schema.sql`: Creates `profiles`, `wallet_accounts`, `wallet_nonces`, `wallet_sessions`, `trades`, `payment_attempts`, `payment_events`, `seller_payouts`, `refunds`, `escrow_operations`, `trade_audit_events`, and `outbox_jobs` with UUID keys, minor-unit integer columns (`BigInt`), and uniqueness indexes.
2. `20261028000002_rls_policies.sql`: Enables and forces Row-Level Security across all 12 core tables.
3. `20261028000003_functions_and_triggers.sql`: Installs UTC timestamp triggers, physical delete guards on financial tables, immutable trade term guards, legal state-transition validation triggers, and the `transition_trade_atomic` RPC function.
4. `20261029000004_seller_escrow_queue_and_risk.sql`: Sets `buyer_collateral_usdc_units` default to `0` on `trades`, creates `seller_listings`, `listing_queue_entries`, `user_trust_profiles`, `user_risk_events`, `rate_limit_abuse_events`, and `guarantor_commitments`, enables and forces RLS with explicit policies on every new table, enforces the single active seller slot partial unique index (`idx_one_active_slot_per_listing`), and adds `recalculate_trust_tier_atomic` and `record_trade_expiration_and_cooldown_atomic`.

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
2. Apply all four Supabase migrations (`000001`, `000002`, `000003`, `000004`) to your production Supabase database and verify RLS and conservation invariants with `supabase/tests/rls_and_invariants_test.sql`.
3. Replace `FLW_SECRET_KEY` and `FLW_SECRET_HASH` with live Flutterwave credentials and point the Flutterwave live webhook URL to `https://api.yourdomain.com/api/v1/webhooks/flutterwave`.
4. Configure dedicated production keys for `RUST_API_AUTH_SECRET`, `WALLET_SESSION_SECRET`, `NOTARY_SIGNING_KEY_HEX`, and `ARC_SIGNER_PRIVATE_KEY`.
5. Verify `/health/ready` on the Rust backend returns HTTP `200 OK` before routing live traffic.

---

## 15. Seller-Funded Escrow, Partial-Order Queue, Adaptive Trust Limits & Abuse Prevention

### 15.1 Seller-Funded Escrow & Removal of Mandatory 50 USDC Buyer Deposit
- Buyers are **not** required to lock a 50 USDC security deposit (`SLASH_AMOUNT = 0` in `ArcP2PEscrowService.sol`, `MIN_COLLATERAL_USDC = 0n` in `frontend/lib/web3/arcConfig.ts`, and `buyer_collateral_usdc_units = 0` in `rust/` and `supabase/`).
- Sellers lock 100% of the USDC backing a listing in `ArcP2PEscrowService` (`createTrade(uint256 _amount)`) before buyers can initiate payment against it.
- On Arc Network, USDC is the native gas token (`6` decimals). Even with `0.00 USDC` buyer collateral, submitting an on-chain transaction requires approximately `0.0031 USDC` (`3,100` micro-USDC) in native gas, which is surfaced in the UI before submission.

### 15.2 Smart Contract Behavior & Deployment Migration Notice
- The updated `frontend/contracts/ArcP2PEscrowService.sol` adds:
  - `SLASH_AMOUNT = 0` (zero buyer collateral requirement in `fundBuyerCollateral`).
  - `SellerListingInventory` tracking (`totalDeposited`, `availableAmount`, `allocatedActiveAmount`, `filledAmount`, `withdrawnAmount`, `activeChildTradeId`, `activeSlotBuyer`, `activeSlotExpiresAt`, `open`).
  - `allocatePartialOrder(uint256 _parentListingId, uint256 _requestedAmount, address _buyer)` for child partial-fill trades with single active slot enforcement on-chain.
  - `withdrawAvailableInventory(uint256 _listingId, uint256 _amount)` allowing sellers to withdraw only unallocated and unfilled inventory.
- **Deployment & Migration Requirement**: Any previously deployed contract instance on Arc Testnet (such as `0x5042f1114C6F272f5909f16510399986EF0D734D`) retains its original immutable bytecode until redeployed. To enable on-chain `allocatePartialOrder`, `withdrawAvailableInventory`, and `SLASH_AMOUNT = 0` on-chain, deploy a new contract instance via `npx hardhat run scripts/deploy.ts --network arcTestnet` and update `NEXT_PUBLIC_ESCROW_ADDRESS` and `ARC_ESCROW_CONTRACT_ADDRESS`.

### 15.3 No Application-Defined Minimum Trade Amount & Partial-Order Conservation
- Sellers may list any positive USDC amount supported by the 6-decimal token (`1` micro-USDC = `0.000001 USDC`), and buyers may request any positive partial or full amount up to the listing's `available_usdc_units`.
- Fiat checkout validates Flutterwave's minimum minor unit (`100` kobo = `₦1.00`).
- Every seller listing enforces exact integer conservation across `rust/` and `supabase/`:
  `total_deposited_usdc_units = available_usdc_units + allocated_active_usdc_units + reserved_queued_usdc_units + filled_usdc_units + withdrawn_usdc_units`

### 15.4 Deterministic FIFO Seller Queue, Single Active Slot Lease & Queue Cancellation
- Each seller listing supports at most **one active buyer payment slot** (`ACTIVE_SLOT`) at a time, enforced by the partial unique index `idx_one_active_slot_per_listing` in PostgreSQL and `active_slot_queue_ref` in the Rust engine.
- If a buyer requests a partial or full order while the seller's active slot is free, the order is immediately allocated a child trade in `AWAITING_PAYMENT` with a 20-minute lease (`active_slot_expires_at`).
- If the seller's active slot is busy, the buyer's request is placed into the deterministic FIFO queue (`QUEUED`) and reserves `reserved_queued_usdc_units` so inventory is never oversold.
- **Queue Cancellation (`POST /api/v1/queue/:queue_ref/cancel`)**: Buyers waiting in `QUEUED` status can cancel at any time before entering `AWAITING_PAYMENT` with **zero cooldown or trust-score penalty**, immediately restoring `reserved_queued_usdc_units` to `available_usdc_units`.
- When an active trade completes (`COMPLETED`), expires (`CANCELLED`), or is refunded, the active slot lease is released and the next eligible FIFO queue entry is promoted.

### 15.5 20-Minute Payment Deadline, 1-Active-Unpaid-Trade Rule & Progressive Cooldowns
- Every active buyer payment slot has an immutable 20-minute deadline (`payment_deadline_at`).
- Buyers in `RESTRICTED`, `NEW`, or `STANDARD` tiers may hold at most **1 active unpaid trade** (`AWAITING_PAYMENT`) at a time (`ESTABLISHED` allows 2; `HIGH_LIMIT` allows 3).
- Unexplained expirations in `AWAITING_PAYMENT` trigger a progressive cooldown schedule stored on `user_trust_profiles` and `user_risk_events`:
  1. 1st unexplained expiration: **5 minutes** (`300s`)
  2. 2nd unexplained expiration within 7 days: **15 minutes** (`900s`)
  3. 3rd unexplained expiration: **1 hour** (`3,600s`)
  4. 4th unexplained expiration: **6 hours** (`21,600s`)
  5. 5th+ unexplained expiration: **24 hours** (`86,400s`) + automatic downgrade to `RESTRICTED`
- **Exemptions**: Cancelling while `QUEUED`, verified payment provider outages (`exempt_provider_outage = true`), or cases where a valid payment attempt was submitted before deadline do **not** trigger buyer cooldowns.

### 15.6 Trusted-Proxy IP Extraction & Multi-Signal Abuse Prevention
- IP extraction (`extract_trusted_client_ip` in `rust/src/lifecycle.rs`) only honors `CF-Connecting-IP` or `X-Forwarded-For` when `TRUST_PROXY_HEADERS=true`; otherwise it falls back to `direct-socket` so untrusted clients cannot spoof rate-limit headers.
- Per-IP and per-wallet sliding-window rate limits protect order creation, queue joins, and cancellations without penalizing legitimate households or CGNAT users with permanent bans.

### 15.7 Adaptive Trust Scoring, Progressive Trade Limits & Guarantor Commitments
- Every user has a server-computed `user_trust_profiles` record with deterministic scoring (`0..1000`) and tier caps:
  - `RESTRICTED`: max `25 USDC` per trade, `1` active unpaid trade, `1` queued order
  - `NEW`: max `100 USDC` per trade, `1` active unpaid trade, `2` queued orders
  - `STANDARD`: max `500 USDC` per trade (`3+` completed trades, `>= 80%` completion rate)
  - `ESTABLISHED`: max `2,500 USDC` per trade (`10+` completed trades, `>= 90%` completion rate, `2,000+ USDC` settled volume)
  - `HIGH_LIMIT`: max `10,000 USDC` per trade (`25+` completed trades, `>= 95%` completion rate, `10,000+ USDC` settled volume, and either `VERIFIED` stronger identity or an active `GuarantorCommitmentRecord` from an `ESTABLISHED`/`HIGH_LIMIT` peer)
- **Guarantor Rule**: A guarantor Commitment (`POST /api/v1/users/guarantor`) records an explicit on-record accountability pledge from a distinct higher-tier wallet (`guarantor_wallet != beneficiary_wallet`). It never fabricates fake bank/identity KYC and is revoked if the beneficiary defaults.
