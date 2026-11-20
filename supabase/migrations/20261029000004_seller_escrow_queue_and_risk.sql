-- Migration: 20261029000004_seller_escrow_queue_and_risk.sql
-- Purpose: Seller-funded escrow inventory, partial-order FIFO queue, active seller slot leases,
--          adaptive trust limits, progressive cooldowns, IP/wallet abuse controls, and guarantor commitments.

-- 1. Remove mandatory 50 USDC buyer collateral default from trades
ALTER TABLE public.trades
    ALTER COLUMN buyer_collateral_usdc_units SET DEFAULT 0;

ALTER TABLE public.trades
    ADD COLUMN IF NOT EXISTS parent_listing_ref TEXT,
    ADD COLUMN IF NOT EXISTS queue_ref TEXT;

-- 2. SELLER LISTINGS (Seller-funded escrow inventory & active slot lease)
CREATE TABLE IF NOT EXISTS public.seller_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_ref TEXT NOT NULL UNIQUE,
    seller_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    seller_address TEXT NOT NULL,
    total_escrowed_usdc_units BIGINT NOT NULL CHECK (total_escrowed_usdc_units > 0),
    available_usdc_units BIGINT NOT NULL CHECK (available_usdc_units >= 0),
    allocated_active_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (allocated_active_usdc_units >= 0),
    reserved_queued_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (reserved_queued_usdc_units >= 0),
    settled_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (settled_usdc_units >= 0),
    exchange_rate_minor BIGINT NOT NULL CHECK (exchange_rate_minor > 0),
    fiat_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (fiat_currency IN ('NGN', 'USD')),
    seller_bank_code TEXT NOT NULL,
    seller_bank_name TEXT NOT NULL,
    seller_account_masked TEXT NOT NULL,
    seller_account_hash TEXT NOT NULL,
    chain_id BIGINT NOT NULL DEFAULT 5042002 CHECK (chain_id > 0),
    escrow_contract_address TEXT NOT NULL,
    deposit_tx_hash TEXT,
    on_chain_listing_id BIGINT,
    active_slot_trade_id TEXT,
    active_slot_buyer_address TEXT,
    active_slot_lease_owner TEXT,
    active_slot_lease_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'PAUSED', 'DEPLETED', 'WITHDRAWN', 'ON_HOLD')
    ),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT seller_listings_address_chk CHECK (seller_address ~ '^0x[a-f0-9]{40}$'),
    CONSTRAINT seller_listings_inventory_conservation_chk CHECK (
        available_usdc_units + allocated_active_usdc_units + reserved_queued_usdc_units + settled_usdc_units
        <= total_escrowed_usdc_units
    )
);

CREATE INDEX IF NOT EXISTS idx_seller_listings_seller ON public.seller_listings(seller_address);
CREATE INDEX IF NOT EXISTS idx_seller_listings_active ON public.seller_listings(status, available_usdc_units)
    WHERE status = 'ACTIVE';

-- 3. LISTING QUEUE ENTRIES (Deterministic FIFO queue per seller listing)
CREATE TABLE IF NOT EXISTS public.listing_queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_ref TEXT NOT NULL UNIQUE,
    listing_id UUID NOT NULL REFERENCES public.seller_listings(id) ON DELETE RESTRICT,
    listing_ref TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    buyer_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    buyer_address TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    requested_usdc_units BIGINT NOT NULL CHECK (requested_usdc_units > 0),
    fiat_amount_minor BIGINT NOT NULL CHECK (fiat_amount_minor > 0),
    fiat_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (fiat_currency IN ('NGN', 'USD')),
    queue_position INTEGER NOT NULL CHECK (queue_position >= 1),
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN (
            'QUEUED',
            'ELIGIBLE_AWAITING_CONSENT',
            'ACTIVATED',
            'COMPLETED',
            'CANCELLED_BY_BUYER',
            'EXPIRED',
            'INVALIDATED'
        )
    ),
    activated_trade_id TEXT,
    activated_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT queue_entries_buyer_seller_distinct_chk CHECK (seller_address <> buyer_address),
    CONSTRAINT queue_entries_buyer_address_chk CHECK (buyer_address ~ '^0x[a-f0-9]{40}$')
);

-- Enforce at most ONE active settlement slot per seller listing at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_slot_per_listing
    ON public.listing_queue_entries(listing_id)
    WHERE status = 'ACTIVATED';

CREATE INDEX IF NOT EXISTS idx_queue_entries_listing_fifo
    ON public.listing_queue_entries(listing_ref, queue_position, created_at)
    WHERE status IN ('QUEUED', 'ELIGIBLE_AWAITING_CONSENT', 'ACTIVATED');

CREATE INDEX IF NOT EXISTS idx_queue_entries_buyer
    ON public.listing_queue_entries(buyer_address, status);

-- 4. USER TRUST PROFILES (Risk-based limits, concurrency caps, and progressive cooldowns)
CREATE TABLE IF NOT EXISTS public.user_trust_profiles (
    wallet_address TEXT PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    trust_tier TEXT NOT NULL DEFAULT 'NEW' CHECK (
        trust_tier IN ('RESTRICTED', 'NEW', 'STANDARD', 'ESTABLISHED', 'HIGH_LIMIT')
    ),
    trust_score INTEGER NOT NULL DEFAULT 100 CHECK (trust_score BETWEEN 0 AND 1000),
    policy_version TEXT NOT NULL DEFAULT 'v1.0',
    max_trade_usdc_units BIGINT NOT NULL DEFAULT 250000000 CHECK (max_trade_usdc_units > 0),
    max_concurrent_unpaid_trades INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrent_unpaid_trades BETWEEN 1 AND 5),
    completed_trades_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_trades_count >= 0),
    completed_volume_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (completed_volume_usdc_units >= 0),
    unexplained_expiry_count INTEGER NOT NULL DEFAULT 0 CHECK (unexplained_expiry_count >= 0),
    consecutive_expiry_streak INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_expiry_streak >= 0),
    disputes_lost_count INTEGER NOT NULL DEFAULT 0 CHECK (disputes_lost_count >= 0),
    stronger_verification_status TEXT NOT NULL DEFAULT 'NONE' CHECK (
        stronger_verification_status IN ('NONE', 'PENDING', 'VERIFIED', 'REJECTED')
    ),
    cooldown_until TIMESTAMPTZ,
    cooldown_reason TEXT,
    cooldown_level INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_level >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT user_trust_profiles_address_chk CHECK (wallet_address ~ '^0x[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_user_trust_profiles_cooldown
    ON public.user_trust_profiles(cooldown_until)
    WHERE cooldown_until IS NOT NULL;

-- 5. USER RISK EVENTS (Append-only audit trail of expirations, cooldowns, and limit adjustments)
CREATE TABLE IF NOT EXISTS public.user_risk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    trade_id TEXT,
    queue_ref TEXT,
    event_category TEXT NOT NULL CHECK (
        event_category IN (
            'UNEXPLAINED_EXPIRATION',
            'PAYMENT_UNRESOLVED_AT_EXPIRY',
            'REPEATED_CHECKOUT_ABANDON',
            'REPEATED_QUEUE_CANCEL',
            'SUSPICIOUS_BURST',
            'DISPUTE_OUTCOME',
            'PROVIDER_OUTAGE_EXEMPT',
            'COOLDOWN_APPLIED',
            'COOLDOWN_CLEARED',
            'LIMIT_UPDATED',
            'ADMIN_OVERRIDE'
        )
    ),
    counted_as_abuse BOOLEAN NOT NULL DEFAULT false,
    score_delta INTEGER NOT NULL DEFAULT 0,
    cooldown_seconds_applied INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_seconds_applied >= 0),
    policy_version TEXT NOT NULL DEFAULT 'v1.0',
    actor_role TEXT NOT NULL DEFAULT 'system' CHECK (actor_role IN ('system', 'admin', 'oracle')),
    reason TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_user_risk_events_wallet ON public.user_risk_events(wallet_address, created_at DESC);

-- 6. RATE LIMIT & ABUSE EVENTS (Privacy-preserving IP hash and wallet abuse records with TTL)
CREATE TABLE IF NOT EXISTS public.rate_limit_abuse_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('WALLET', 'IP_HASH', 'COMBINED')),
    scope_key TEXT NOT NULL,
    endpoint_category TEXT NOT NULL,
    action_taken TEXT NOT NULL CHECK (
        action_taken IN ('THROTTLED', 'CHALLENGE_REQUIRED', 'TEMP_BLOCKED', 'LOGGED')
    ),
    throttle_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_abuse_lookup
    ON public.rate_limit_abuse_events(scope_type, scope_key, throttle_until);

-- 7. GUARANTOR COMMITMENTS (Explicitly signed, bounded obligations for large trades)
CREATE TABLE IF NOT EXISTS public.guarantor_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commitment_ref TEXT NOT NULL UNIQUE,
    guarantor_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    guarantor_address TEXT NOT NULL,
    beneficiary_buyer_address TEXT NOT NULL,
    trade_id TEXT,
    listing_ref TEXT,
    guaranteed_usdc_units BIGINT NOT NULL CHECK (guaranteed_usdc_units > 0),
    funded_bond_usdc_units BIGINT NOT NULL DEFAULT 0 CHECK (funded_bond_usdc_units >= 0),
    is_funded_on_chain BOOLEAN NOT NULL DEFAULT false,
    bond_tx_hash TEXT,
    covered_events TEXT[] NOT NULL DEFAULT ARRAY['UNEXPLAINED_EXPIRATION', 'DISPUTE_LOSS'],
    signature_hex TEXT NOT NULL,
    signed_statement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('PENDING_SIGNATURE', 'ACTIVE', 'RELEASED', 'CLAIMED', 'EXPIRED', 'REVOKED')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT guarantor_distinct_parties_chk CHECK (guarantor_address <> beneficiary_buyer_address)
);

CREATE INDEX IF NOT EXISTS idx_guarantor_commitments_buyer
    ON public.guarantor_commitments(beneficiary_buyer_address, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY (RLS) FOR ALL NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.seller_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_listings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.listing_queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_queue_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_trust_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trust_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_risk_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limit_abuse_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_abuse_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.guarantor_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantor_commitments FORCE ROW LEVEL SECURITY;

-- Public/authenticated read of active seller listings (bank account hashes remain protected)
DROP POLICY IF EXISTS seller_listings_select_policy ON public.seller_listings;
CREATE POLICY seller_listings_select_policy ON public.seller_listings
    FOR SELECT
    USING (status = 'ACTIVE' OR seller_profile_id = auth.uid());

-- Queue entries: visible only to the buyer or seller of the listing
DROP POLICY IF EXISTS listing_queue_entries_select_policy ON public.listing_queue_entries;
CREATE POLICY listing_queue_entries_select_policy ON public.listing_queue_entries
    FOR SELECT
    USING (
        buyer_profile_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.seller_listings sl
            WHERE sl.id = listing_queue_entries.listing_id
              AND sl.seller_profile_id = auth.uid()
        )
    );

-- User trust profiles: visible only to the profile owner
DROP POLICY IF EXISTS user_trust_profiles_select_policy ON public.user_trust_profiles;
CREATE POLICY user_trust_profiles_select_policy ON public.user_trust_profiles
    FOR SELECT
    USING (profile_id = auth.uid());

-- User risk events: visible only to the profile owner
DROP POLICY IF EXISTS user_risk_events_select_policy ON public.user_risk_events;
CREATE POLICY user_risk_events_select_policy ON public.user_risk_events
    FOR SELECT
    USING (profile_id = auth.uid());

-- Rate-limit & abuse events: strictly internal to service_role (no anon/authenticated access)
DROP POLICY IF EXISTS rate_limit_abuse_events_deny_all ON public.rate_limit_abuse_events;
CREATE POLICY rate_limit_abuse_events_deny_all ON public.rate_limit_abuse_events
    FOR ALL
    USING (false);

-- Guarantor commitments: visible only to guarantor or beneficiary buyer
DROP POLICY IF EXISTS guarantor_commitments_select_policy ON public.guarantor_commitments;
CREATE POLICY guarantor_commitments_select_policy ON public.guarantor_commitments
    FOR SELECT
    USING (
        guarantor_profile_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.wallet_accounts wa
            WHERE wa.wallet_address = guarantor_commitments.beneficiary_buyer_address
              AND wa.profile_id = auth.uid()
        )
    );

-- Triggers for updated_at and physical DELETE protection on financial/audit tables
DROP TRIGGER IF EXISTS trg_seller_listings_updated_at ON public.seller_listings;
CREATE TRIGGER trg_seller_listings_updated_at
    BEFORE UPDATE ON public.seller_listings
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_listing_queue_entries_updated_at ON public.listing_queue_entries;
CREATE TRIGGER trg_listing_queue_entries_updated_at
    BEFORE UPDATE ON public.listing_queue_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_trust_profiles_updated_at ON public.user_trust_profiles;
CREATE TRIGGER trg_user_trust_profiles_updated_at
    BEFORE UPDATE ON public.user_trust_profiles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_guarantor_commitments_updated_at ON public.guarantor_commitments;
CREATE TRIGGER trg_guarantor_commitments_updated_at
    BEFORE UPDATE ON public.guarantor_commitments
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_prevent_delete_seller_listings ON public.seller_listings;
CREATE TRIGGER trg_prevent_delete_seller_listings
    BEFORE DELETE ON public.seller_listings
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

DROP TRIGGER IF EXISTS trg_prevent_delete_queue_entries ON public.listing_queue_entries;
CREATE TRIGGER trg_prevent_delete_queue_entries
    BEFORE DELETE ON public.listing_queue_entries
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

DROP TRIGGER IF EXISTS trg_append_only_user_risk_events ON public.user_risk_events;
DROP TRIGGER IF EXISTS trg_no_update_user_risk_events ON public.user_risk_events;
CREATE TRIGGER trg_no_update_user_risk_events
    BEFORE UPDATE ON public.user_risk_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_update();

DROP TRIGGER IF EXISTS trg_no_delete_user_risk_events ON public.user_risk_events;
CREATE TRIGGER trg_no_delete_user_risk_events
    BEFORE DELETE ON public.user_risk_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

-- ═══════════════════════════════════════════════════════════════════════════
-- ATOMIC RPC FUNCTIONS FOR QUEUE, PARTIAL FILLS, COOLDOWNS & TRUST SCORING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalculate_trust_tier_atomic(
    p_profile_id UUID
)
RETURNS public.user_trust_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.user_trust_profiles%ROWTYPE;
    v_score INTEGER;
    v_tier TEXT;
    v_max_trade BIGINT;
    v_max_unpaid INTEGER;
BEGIN
    SELECT * INTO v_profile
    FROM public.user_trust_profiles
    WHERE profile_id = p_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trust profile not found for %', p_profile_id USING ERRCODE = 'P0002';
    END IF;

    v_score := 50
        + LEAST(v_profile.completed_trades_count * 12, 240)
        + LEAST((v_profile.completed_volume_usdc_units / 50000000)::INTEGER * 5, 150)
        - (v_profile.unexplained_expiry_count * 25)
        - (v_profile.consecutive_expiry_streak * 20)
        - (v_profile.disputes_lost_count * 120);

    IF v_profile.stronger_verification_status = 'VERIFIED' THEN
        v_score := v_score + 60;
    END IF;

    v_score := GREATEST(0, LEAST(v_score, 1000));

    IF v_profile.disputes_lost_count >= 2 OR v_profile.consecutive_expiry_streak >= 4 OR v_score < 25 THEN
        v_tier := 'RESTRICTED';
        v_max_trade := 50000000;
        v_max_unpaid := 1;
    ELSIF v_profile.completed_trades_count >= 20 AND v_profile.completed_volume_usdc_units >= 5000000000 AND v_score >= 300 THEN
        v_tier := 'HIGH_LIMIT';
        v_max_trade := 10000000000;
        v_max_unpaid := 3;
    ELSIF v_profile.completed_trades_count >= 5 AND v_profile.completed_volume_usdc_units >= 500000000 AND v_score >= 140 THEN
        v_tier := 'ESTABLISHED';
        v_max_trade := 2500000000;
        v_max_unpaid := 2;
    ELSIF v_profile.completed_trades_count >= 1 AND v_score >= 60 THEN
        v_tier := 'STANDARD';
        v_max_trade := 500000000;
        v_max_unpaid := 1;
    ELSE
        v_tier := 'NEW';
        v_max_trade := 150000000;
        v_max_unpaid := 1;
    END IF;

    UPDATE public.user_trust_profiles
    SET trust_score = v_score,
        trust_tier = v_tier,
        max_trade_usdc_units = v_max_trade,
        max_concurrent_unpaid_trades = v_max_unpaid
    WHERE profile_id = p_profile_id
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_trade_expiration_and_cooldown_atomic(
    p_profile_id UUID,
    p_wallet_address TEXT,
    p_trade_id TEXT,
    p_is_provider_outage BOOLEAN,
    p_reason_code TEXT
)
RETURNS public.user_trust_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.user_trust_profiles%ROWTYPE;
    v_streak INTEGER;
    v_cooldown_seconds INTEGER;
    v_cooldown_until TIMESTAMPTZ;
BEGIN
    INSERT INTO public.user_trust_profiles (profile_id, wallet_address)
    VALUES (p_profile_id, lower(p_wallet_address))
    ON CONFLICT (wallet_address) DO NOTHING;

    SELECT * INTO v_profile
    FROM public.user_trust_profiles
    WHERE profile_id = p_profile_id
    FOR UPDATE;

    IF p_is_provider_outage THEN
        INSERT INTO public.user_risk_events (
            profile_id, wallet_address, event_category, trade_id, reason, score_delta, metadata
        ) VALUES (
            p_profile_id, lower(p_wallet_address), 'PROVIDER_OUTAGE_EXEMPT', p_trade_id, p_reason_code, 0,
            jsonb_build_object('exempt_from_penalty', true)
        );
        RETURN v_profile;
    END IF;

    v_streak := v_profile.consecutive_expiry_streak + 1;
    v_cooldown_seconds := CASE
        WHEN v_streak = 1 THEN 300
        WHEN v_streak = 2 THEN 900
        WHEN v_streak = 3 THEN 3600
        WHEN v_streak = 4 THEN 21600
        ELSE 86400
    END;
    v_cooldown_until := timezone('utc', now()) + make_interval(secs => v_cooldown_seconds);

    UPDATE public.user_trust_profiles
    SET unexplained_expiry_count = unexplained_expiry_count + 1,
        consecutive_expiry_streak = v_streak,
        cooldown_level = v_streak,
        cooldown_until = v_cooldown_until,
        cooldown_reason = p_reason_code
    WHERE profile_id = p_profile_id;

    INSERT INTO public.user_risk_events (
        profile_id, wallet_address, event_category, trade_id, reason, counted_as_abuse,
        score_delta, cooldown_seconds_applied, metadata
    ) VALUES (
        p_profile_id, lower(p_wallet_address), 'COOLDOWN_APPLIED', p_trade_id, p_reason_code, true,
        -45, v_cooldown_seconds,
        jsonb_build_object('consecutive_expiry_streak', v_streak, 'cooldown_until', v_cooldown_until)
    );

    RETURN public.recalculate_trust_tier_atomic(p_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_trust_tier_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_trust_tier_atomic(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.record_trade_expiration_and_cooldown_atomic(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trade_expiration_and_cooldown_atomic(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;
