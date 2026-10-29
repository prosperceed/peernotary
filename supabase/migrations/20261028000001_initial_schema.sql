-- Migration: 20261028000001_initial_schema.sql
-- Purpose: Authoritative schema for PeerNotary profiles, wallet authentication,
--          trades, Flutterwave payment attempts, webhook inbox, seller payouts,
--          buyer refunds, Arc escrow operations, audit trail, and outbox jobs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'trader' CHECK (role IN ('trader', 'admin', 'system')),
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT profiles_username_format_chk CHECK (
        username IS NULL OR (
            char_length(username) BETWEEN 3 AND 24
            AND username ~ '^[a-z0-9_]+$'
            AND username NOT IN (
                'admin', 'system', 'support', 'peernotary', 'flutterwave',
                'arc', 'escrow', 'oracle', 'moderator', 'root', 'api',
                'help', 'security', 'official', 'treasury', 'null', 'undefined'
            )
        )
    )
);

-- 2. WALLET ACCOUNTS
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    wallet_address TEXT NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL DEFAULT 5042002 CHECK (chain_id > 0),
    is_primary BOOLEAN NOT NULL DEFAULT true,
    last_authenticated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT wallet_accounts_address_format_chk CHECK (
        wallet_address ~ '^0x[a-f0-9]{40}$'
        AND wallet_address <> '0x0000000000000000000000000000000000000000'
    )
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_profile_id ON public.wallet_accounts(profile_id);

-- 3. WALLET NONCES (One-time challenge-response authentication)
CREATE TABLE IF NOT EXISTS public.wallet_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    uri TEXT NOT NULL,
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    statement TEXT NOT NULL,
    message TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT wallet_nonces_address_chk CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
    CONSTRAINT wallet_nonces_expiry_chk CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_wallet_nonces_Lookup ON public.wallet_nonces(wallet_address, nonce) WHERE consumed_at IS NULL;

-- 4. WALLET SESSIONS (Server-validated sessions linked to wallet identity)
CREATE TABLE IF NOT EXISTS public.wallet_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    wallet_address TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL DEFAULT 5042002,
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT wallet_sessions_address_chk CHECK (wallet_address ~ '^0x[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_wallet_sessions_active ON public.wallet_sessions(token_hash, wallet_address) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_sessions_profile ON public.wallet_sessions(profile_id);

-- 5. TRADES
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id TEXT NOT NULL UNIQUE,
    seller_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    buyer_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    seller_address TEXT NOT NULL,
    buyer_address TEXT,
    side TEXT NOT NULL DEFAULT 'sell' CHECK (side IN ('sell', 'buy')),
    -- Monetary fields stored in exact integer minor/atomic units
    usdc_amount_units BIGINT NOT NULL CHECK (usdc_amount_units > 0),
    buyer_collateral_usdc_units BIGINT NOT NULL DEFAULT 50000000 CHECK (buyer_collateral_usdc_units >= 0),
    platform_fee_bps INTEGER NOT NULL DEFAULT 100 CHECK (platform_fee_bps BETWEEN 0 AND 500),
    platform_fee_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_usdc_units >= 0),
    fiat_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (fiat_currency IN ('NGN', 'USD')),
    fiat_amount_minor BIGINT NOT NULL CHECK (fiat_amount_minor > 0),
    exchange_rate_minor BIGINT NOT NULL CHECK (exchange_rate_minor > 0),
    -- Beneficiary settlement details (hashed/masked, never raw sensitive credentials)
    seller_bank_code TEXT NOT NULL,
    seller_bank_name TEXT NOT NULL,
    seller_account_masked TEXT NOT NULL,
    seller_account_hash TEXT NOT NULL,
    seller_recipient_code TEXT,
    -- Separated authoritative states
    lifecycle_state TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK (
        lifecycle_state IN (
            'OPEN',
            'AWAITING_PAYMENT',
            'PAYMENT_CONFIRMED',
            'SELLER_PAYOUT_PENDING',
            'SELLER_PAYOUT_CONFIRMED',
            'RELEASE_PENDING',
            'COMPLETED',
            'PAYOUT_ON_HOLD',
            'REFUND_PENDING',
            'RELEASE_ON_HOLD',
            'LATE_PAYMENT_REVIEW',
            'CANCELLED',
            'DISPUTED'
        )
    ),
    payment_state TEXT NOT NULL DEFAULT 'UNPAID' CHECK (
        payment_state IN (
            'UNPAID',
            'CHECKOUT_CREATED',
            'PENDING_VERIFICATION',
            'CONFIRMED',
            'LATE_CONFIRMED',
            'UNDERPAID',
            'OVERPAID',
            'FAILED',
            'EXPIRED'
        )
    ),
    payout_state TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (
        payout_state IN (
            'NOT_STARTED',
            'PENDING',
            'PROCESSING',
            'CONFIRMED',
            'ON_HOLD',
            'FAILED'
        )
    ),
    refund_state TEXT NOT NULL DEFAULT 'NONE' CHECK (
        refund_state IN (
            'NONE',
            'REQUESTED',
            'APPROVED',
            'PROCESSING',
            'COMPLETED',
            'FAILED',
            'REJECTED'
        )
    ),
    escrow_state TEXT NOT NULL DEFAULT 'FUNDED' CHECK (
        escrow_state IN (
            'CREATED',
            'FUNDED',
            'FIAT_SENT',
            'RELEASE_PENDING',
            'RELEASED',
            'ON_HOLD',
            'CANCELLED',
            'DISPUTED'
        )
    ),
    terms_locked BOOLEAN NOT NULL DEFAULT false,
    payment_deadline_at TIMESTAMPTZ,
    chain_id BIGINT NOT NULL DEFAULT 5042002 CHECK (chain_id > 0),
    escrow_contract_address TEXT NOT NULL,
    initiate_tx_hash TEXT,
    collateral_tx_hash TEXT,
    release_tx_hash TEXT,
    proof_id_bytes32 TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT trades_seller_buyer_distinct_chk CHECK (
        buyer_address IS NULL OR seller_address <> buyer_address
    )
);

CREATE INDEX IF NOT EXISTS idx_trades_seller_address ON public.trades(seller_address);
CREATE INDEX IF NOT EXISTS idx_trades_buyer_address ON public.trades(buyer_address);
CREATE INDEX IF NOT EXISTS idx_trades_lifecycle_state ON public.trades(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_trades_deadline ON public.trades(payment_deadline_at)
    WHERE lifecycle_state = 'AWAITING_PAYMENT';

-- 6. PAYMENT ATTEMPTS (Flutterwave Standard Checkout sessions)
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_uuid UUID NOT NULL REFERENCES public.trades(id) ON DELETE RESTRICT,
    trade_id TEXT NOT NULL,
    buyer_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    buyer_address TEXT NOT NULL,
    tx_ref TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    flw_tx_id BIGINT UNIQUE,
    flw_flw_ref TEXT,
    expected_amount_minor BIGINT NOT NULL CHECK (expected_amount_minor > 0),
    expected_currency TEXT NOT NULL CHECK (expected_currency IN ('NGN', 'USD')),
    settled_amount_minor BIGINT CHECK (settled_amount_minor IS NULL OR settled_amount_minor >= 0),
    app_fee_minor BIGINT CHECK (app_fee_minor IS NULL OR app_fee_minor >= 0),
    checkout_url TEXT,
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (
        status IN (
            'INITIATED',
            'REDIRECT_READY',
            'PENDING_VERIFICATION',
            'VERIFIED',
            'LATE_VERIFIED',
            'MISMATCH_HOLD',
            'FAILED',
            'EXPIRED',
            'ABANDONED'
        )
    ),
    failure_code TEXT,
    failure_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_trade_id ON public.payment_attempts(trade_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_buyer ON public.payment_attempts(buyer_address);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_active ON public.payment_attempts(trade_id, status)
    WHERE status IN ('INITIATED', 'REDIRECT_READY', 'PENDING_VERIFICATION');

-- 7. PAYMENT EVENTS (Webhook Inbox for idempotency & auditability)
CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'flutterwave',
    event_type TEXT NOT NULL,
    tx_ref TEXT,
    flw_tx_id BIGINT,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    processing_status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (
        processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')
    ),
    redacted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tx_ref ON public.payment_events(tx_ref);
CREATE INDEX IF NOT EXISTS idx_payment_events_flw_tx_id ON public.payment_events(flw_tx_id);

-- 8. SELLER PAYOUTS
CREATE TABLE IF NOT EXISTS public.seller_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_uuid UUID NOT NULL REFERENCES public.trades(id) ON DELETE RESTRICT,
    trade_id TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    payout_reference TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    flw_transfer_id BIGINT UNIQUE,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
    bank_code TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_masked TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'DISPATCHED', 'CONFIRMED', 'ON_HOLD', 'FAILED')
    ),
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
    failure_reason TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_trade_id ON public.seller_payouts(trade_id);

-- 9. REFUNDS
CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_uuid UUID NOT NULL REFERENCES public.trades(id) ON DELETE RESTRICT,
    trade_id TEXT NOT NULL,
    payment_attempt_id UUID NOT NULL REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
    requested_by_address TEXT NOT NULL,
    approved_by_address TEXT,
    refund_reference TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    flw_refund_id BIGINT UNIQUE,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (
        status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED')
    ),
    failure_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_refunds_trade_id ON public.refunds(trade_id);

-- 10. ESCROW OPERATIONS (On-Chain Arc transactions)
CREATE TABLE IF NOT EXISTS public.escrow_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_uuid UUID NOT NULL REFERENCES public.trades(id) ON DELETE RESTRICT,
    trade_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (
        operation_type IN (
            'INITIATE',
            'FUND_COLLATERAL',
            'MARK_FIAT_SENT',
            'ORACLE_RELEASE',
            'SELLER_RELEASE',
            'CANCEL_REFUND',
            'DISPUTE_RESOLVE'
        )
    ),
    idempotency_key TEXT NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL DEFAULT 5042002,
    contract_address TEXT NOT NULL,
    tx_hash TEXT UNIQUE,
    proof_id_bytes32 TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_SUBMISSION' CHECK (
        status IN (
            'PENDING_SUBMISSION',
            'SUBMITTED',
            'CONFIRMED',
            'REVERTED',
            'UNCERTAIN_ON_HOLD',
            'FAILED'
        )
    ),
    block_number BIGINT,
    failure_reason TEXT,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_escrow_operations_trade_id ON public.escrow_operations(trade_id);
CREATE INDEX IF NOT EXISTS idx_escrow_operations_status ON public.escrow_operations(status)
    WHERE status IN ('PENDING_SUBMISSION', 'SUBMITTED', 'UNCERTAIN_ON_HOLD');

-- 11. TRADE AUDIT EVENTS (Append-only immutable financial audit log)
CREATE TABLE IF NOT EXISTS public.trade_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_uuid UUID REFERENCES public.trades(id) ON DELETE RESTRICT,
    trade_id TEXT NOT NULL,
    actor_address TEXT,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('buyer', 'seller', 'system', 'oracle', 'webhook', 'admin')),
    event_type TEXT NOT NULL,
    previous_state TEXT,
    new_state TEXT,
    correlation_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_trade_audit_events_trade_id ON public.trade_audit_events(trade_id, created_at DESC);

-- 12. OUTBOX JOBS (Transactional Outbox for reliable async execution & reconciliation)
CREATE TABLE IF NOT EXISTS public.outbox_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (
        job_type IN (
            'VERIFY_PAYMENT',
            'RECONCILE_DEADLINE',
            'EXECUTE_SELLER_PAYOUT',
            'RECONCILE_PAYOUT',
            'EXECUTE_REFUND',
            'EXECUTE_ESCROW_RELEASE',
            'RECONCILE_ESCROW_TX'
        )
    ),
    dedup_key TEXT NOT NULL UNIQUE,
    trade_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'LOCKED', 'COMPLETED', 'DEAD_LETTER')
    ),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_outbox_jobs_poll ON public.outbox_jobs(status, next_run_at)
    WHERE status = 'PENDING';
