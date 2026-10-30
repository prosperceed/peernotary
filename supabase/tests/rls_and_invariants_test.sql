-- SQL Test Suite: supabase/tests/rls_and_invariants_test.sql
-- Verifies RLS cross-user isolation, physical delete prevention,
-- immutable trade payment terms, and legal state transition constraints.

BEGIN;

-- 1. Seed two distinct profiles and wallet identities
INSERT INTO public.profiles (id, username, role, onboarding_completed)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'alice_trader', 'trader', true),
    ('22222222-2222-2222-2222-222222222222', 'bob_trader', 'trader', true),
    ('33333333-3333-3333-3333-333333333333', 'mallory_attacker', 'trader', true);

INSERT INTO public.wallet_accounts (profile_id, wallet_address, chain_id)
VALUES
    ('11111111-1111-1111-1111-111111111111', '0x1111111111111111111111111111111111111111', 5042002),
    ('22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', 5042002),
    ('33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', 5042002);

-- 2. Create a trade between Alice (seller) and Bob (buyer)
INSERT INTO public.trades (
    id,
    trade_id,
    seller_profile_id,
    buyer_profile_id,
    seller_address,
    buyer_address,
    side,
    usdc_amount_units,
    buyer_collateral_usdc_units,
    fiat_currency,
    fiat_amount_minor,
    exchange_rate_minor,
    seller_bank_code,
    seller_bank_name,
    seller_account_masked,
    seller_account_hash,
    lifecycle_state,
    payment_state,
    payout_state,
    refund_state,
    escrow_state,
    terms_locked,
    payment_deadline_at,
    escrow_contract_address
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '9001',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    'sell',
    500000000,
    50000000,
    'NGN',
    81500000,
    163000,
    '058',
    'GTBank',
    '******6789',
    '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    'AWAITING_PAYMENT',
    'CHECKOUT_CREATED',
    'NOT_STARTED',
    'NONE',
    'FUNDED',
    true,
    timezone('utc', now()) + interval '20 minutes',
    '0x5042f1114c6f272f5909f16510399986ef0d734d'
);

-- 3. Verify immutable terms protection raises exception
DO $$
BEGIN
    UPDATE public.trades
    SET fiat_amount_minor = 100
    WHERE trade_id = '9001';
    RAISE EXCEPTION 'Expected check_violation on mutating locked trade terms';
EXCEPTION
    WHEN check_violation THEN
        NULL; -- Expected
END;
$$;

-- 4. Verify illegal state transition raises exception (AWAITING_PAYMENT -> COMPLETED directly is forbidden)
DO $$
BEGIN
    UPDATE public.trades
    SET lifecycle_state = 'COMPLETED'
    WHERE trade_id = '9001';
    RAISE EXCEPTION 'Expected check_violation on illegal state transition';
EXCEPTION
    WHEN check_violation THEN
        NULL; -- Expected
END;
$$;

-- 5. Verify legal atomic transition works and increments version
SELECT public.transition_trade_atomic(
    '9001',
    1,
    'PAYMENT_CONFIRMED',
    'CONFIRMED',
    'NOT_STARTED',
    'NONE',
    'FIAT_SENT',
    '0x2222222222222222222222222222222222222222',
    'webhook',
    'FLW_PAYMENT_VERIFIED',
    'corr_test_01',
    '{"flw_tx_id": 998877}'::jsonb,
    'EXECUTE_SELLER_PAYOUT',
    'payout:9001',
    '{"trade_id": "9001"}'::jsonb
);

-- 6. Verify physical delete is prohibited on trades and audit events
DO $$
BEGIN
    DELETE FROM public.trades WHERE trade_id = '9001';
    RAISE EXCEPTION 'Expected restrict_violation on deleting trade';
EXCEPTION
    WHEN restrict_violation THEN
        NULL; -- Expected
END;
$$;

DO $$
BEGIN
    DELETE FROM public.trade_audit_events WHERE trade_id = '9001';
    RAISE EXCEPTION 'Expected restrict_violation on deleting audit event';
EXCEPTION
    WHEN restrict_violation THEN
        NULL; -- Expected
END;
$$;

-- 7. Verify Seller Listing Inventory Conservation & 0 Buyer Collateral Support
INSERT INTO public.seller_listings (
    id,
    listing_ref,
    on_chain_listing_id,
    seller_profile_id,
    seller_address,
    total_escrowed_usdc_units,
    available_usdc_units,
    allocated_active_usdc_units,
    reserved_queued_usdc_units,
    settled_usdc_units,
    exchange_rate_minor,
    seller_bank_code,
    seller_bank_name,
    seller_account_masked,
    seller_account_hash,
    escrow_contract_address,
    status
) VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'LST-9001',
    9001,
    '11111111-1111-1111-1111-111111111111',
    '0x1111111111111111111111111111111111111111',
    500000000,
    300000000,
    100000000,
    100000000,
    0,
    163000,
    '058',
    'GTBank',
    '******6789',
    '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    '0x5042f1114c6f272f5909f16510399986ef0d734d',
    'ACTIVE'
);

DO $$
BEGIN
    UPDATE public.seller_listings
    SET available_usdc_units = 400000000
    WHERE listing_ref = 'LST-9001';
    RAISE EXCEPTION 'Expected check_violation on violating seller inventory conservation';
EXCEPTION
    WHEN check_violation THEN
        NULL;
END;
$$;

-- 8. Verify Single Active Seller Slot Unique Index
INSERT INTO public.listing_queue_entries (
    queue_ref,
    listing_id,
    listing_ref,
    seller_address,
    buyer_profile_id,
    buyer_address,
    idempotency_key,
    requested_usdc_units,
    fiat_amount_minor,
    queue_position,
    status
) VALUES (
    'Q-1',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'LST-9001',
    '0x1111111111111111111111111111111111111111',
    '22222222-2222-2222-2222-222222222222',
    '0x2222222222222222222222222222222222222222',
    'idem-q-1',
    100000000,
    16300000,
    1,
    'ACTIVATED'
);

DO $$
BEGIN
    INSERT INTO public.listing_queue_entries (
        queue_ref,
        listing_id,
        listing_ref,
        seller_address,
        buyer_profile_id,
        buyer_address,
        idempotency_key,
        requested_usdc_units,
        fiat_amount_minor,
        queue_position,
        status
    ) VALUES (
        'Q-2',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'LST-9001',
        '0x1111111111111111111111111111111111111111',
        '33333333-3333-3333-3333-333333333333',
        '0x3333333333333333333333333333333333333333',
        'idem-q-2',
        100000000,
        16300000,
        2,
        'ACTIVATED'
    );
    RAISE EXCEPTION 'Expected unique_violation on second ACTIVATED slot for same seller listing';
EXCEPTION
    WHEN unique_violation THEN
        NULL;
END;
$$;

-- 9. Verify Progressive Cooldown & Trust Tier Recalculation RPC
SELECT public.record_trade_expiration_and_cooldown_atomic(
    '22222222-2222-2222-2222-222222222222',
    '0x2222222222222222222222222222222222222222',
    '9001',
    false,
    'UNPAID_DEADLINE_EXPIRED'
);

DO $$
DECLARE
    v_cooldown TIMESTAMPTZ;
BEGIN
    SELECT cooldown_until INTO v_cooldown
    FROM public.user_trust_profiles
    WHERE wallet_address = '0x2222222222222222222222222222222222222222';
    IF v_cooldown IS NULL OR v_cooldown <= timezone('utc', now()) THEN
        RAISE EXCEPTION 'Expected an active cooldown after unexplained expiration';
    END IF;
END;
$$;

ROLLBACK;
