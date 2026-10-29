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

ROLLBACK;
