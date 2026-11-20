-- Migration: 20261028000003_functions_and_triggers.sql
-- Purpose: Database-enforced financial invariants:
--   1. Automatic UTC updated_at maintenance.
--   2. Prohibition of physical DELETE on financial and audit tables.
--   3. Immutability of trade_audit_events (append-only).
--   4. Immutability of trade financial terms once terms_locked = true.
--   5. Legal state-transition validation and optimistic concurrency control.
--   6. Atomic state transition + audit + transactional outbox RPC.

-- 1. Automatic UTC updated_at trigger function
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_wallet_accounts_updated_at
    BEFORE UPDATE ON public.wallet_accounts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_trades_updated_at
    BEFORE UPDATE ON public.trades
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_payment_attempts_updated_at
    BEFORE UPDATE ON public.payment_attempts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_seller_payouts_updated_at
    BEFORE UPDATE ON public.seller_payouts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_refunds_updated_at
    BEFORE UPDATE ON public.refunds
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_escrow_operations_updated_at
    BEFORE UPDATE ON public.escrow_operations
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_outbox_jobs_updated_at
    BEFORE UPDATE ON public.outbox_jobs
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Prevent physical deletion of financial and audit records
CREATE OR REPLACE FUNCTION public.prevent_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Physical deletion of financial or audit records (%) is prohibited', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_delete_trades
    BEFORE DELETE ON public.trades
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_payment_attempts
    BEFORE DELETE ON public.payment_attempts
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_payment_events
    BEFORE DELETE ON public.payment_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_seller_payouts
    BEFORE DELETE ON public.seller_payouts
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_refunds
    BEFORE DELETE ON public.refunds
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_escrow_operations
    BEFORE DELETE ON public.escrow_operations
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

CREATE TRIGGER trg_no_delete_trade_audit_events
    BEFORE DELETE ON public.trade_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_delete();

-- 3. Prevent modification of audit records
CREATE OR REPLACE FUNCTION public.prevent_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are immutable and cannot be updated'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_no_update_trade_audit_events
    BEFORE UPDATE ON public.trade_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_update();

-- 4. Enforce trade term immutability & legal lifecycle state transitions
CREATE OR REPLACE FUNCTION public.enforce_trade_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    valid_transition BOOLEAN := false;
BEGIN
    -- Once terms_locked is true, core financial terms cannot be mutated
    IF OLD.terms_locked THEN
        IF NEW.terms_locked = false
           OR NEW.seller_address <> OLD.seller_address
           OR COALESCE(NEW.buyer_address, '') <> COALESCE(OLD.buyer_address, '')
           OR NEW.usdc_amount_units <> OLD.usdc_amount_units
           OR NEW.fiat_amount_minor <> OLD.fiat_amount_minor
           OR NEW.fiat_currency <> OLD.fiat_currency
           OR NEW.exchange_rate_minor <> OLD.exchange_rate_minor
           OR NEW.seller_bank_code <> OLD.seller_bank_code
           OR NEW.seller_account_hash <> OLD.seller_account_hash
        THEN
            RAISE EXCEPTION 'Immutable trade terms cannot be modified after payment initialization'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- Validate lifecycle_state transitions when state changes
    IF NEW.lifecycle_state <> OLD.lifecycle_state THEN
        valid_transition := CASE OLD.lifecycle_state
            WHEN 'OPEN' THEN NEW.lifecycle_state IN ('AWAITING_PAYMENT', 'CANCELLED')
            WHEN 'AWAITING_PAYMENT' THEN NEW.lifecycle_state IN (
                'PAYMENT_CONFIRMED',
                'LATE_PAYMENT_REVIEW',
                'REFUND_PENDING',
                'CANCELLED',
                'DISPUTED'
            )
            WHEN 'PAYMENT_CONFIRMED' THEN NEW.lifecycle_state IN (
                'SELLER_PAYOUT_PENDING',
                'PAYOUT_ON_HOLD',
                'REFUND_PENDING',
                'DISPUTED'
            )
            WHEN 'SELLER_PAYOUT_PENDING' THEN NEW.lifecycle_state IN (
                'SELLER_PAYOUT_CONFIRMED',
                'PAYOUT_ON_HOLD',
                'DISPUTED'
            )
            WHEN 'PAYOUT_ON_HOLD' THEN NEW.lifecycle_state IN (
                'SELLER_PAYOUT_PENDING',
                'SELLER_PAYOUT_CONFIRMED',
                'REFUND_PENDING',
                'DISPUTED'
            )
            WHEN 'SELLER_PAYOUT_CONFIRMED' THEN NEW.lifecycle_state IN (
                'RELEASE_PENDING',
                'RELEASE_ON_HOLD',
                'DISPUTED'
            )
            WHEN 'RELEASE_PENDING' THEN NEW.lifecycle_state IN (
                'COMPLETED',
                'RELEASE_ON_HOLD',
                'DISPUTED'
            )
            WHEN 'RELEASE_ON_HOLD' THEN NEW.lifecycle_state IN (
                'RELEASE_PENDING',
                'COMPLETED',
                'DISPUTED'
            )
            WHEN 'LATE_PAYMENT_REVIEW' THEN NEW.lifecycle_state IN (
                'PAYMENT_CONFIRMED',
                'REFUND_PENDING',
                'DISPUTED'
            )
            WHEN 'REFUND_PENDING' THEN NEW.lifecycle_state IN (
                'CANCELLED',
                'DISPUTED'
            )
            ELSE false
        END;

        IF NOT valid_transition THEN
            RAISE EXCEPTION 'Illegal trade lifecycle transition from % to %',
                OLD.lifecycle_state, NEW.lifecycle_state
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- Increment version on every update for optimistic concurrency
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_trade_invariants
    BEFORE UPDATE ON public.trades
    FOR EACH ROW EXECUTE FUNCTION public.enforce_trade_invariants();

-- 5. Atomic trade transition + audit + outbox enqueue RPC
CREATE OR REPLACE FUNCTION public.transition_trade_atomic(
    p_trade_id TEXT,
    p_expected_version INTEGER,
    p_new_lifecycle_state TEXT,
    p_new_payment_state TEXT DEFAULT NULL,
    p_new_payout_state TEXT DEFAULT NULL,
    p_new_refund_state TEXT DEFAULT NULL,
    p_new_escrow_state TEXT DEFAULT NULL,
    p_actor_address TEXT DEFAULT NULL,
    p_actor_role TEXT DEFAULT 'system',
    p_event_type TEXT DEFAULT 'STATE_TRANSITION',
    p_correlation_id TEXT DEFAULT NULL,
    p_audit_metadata JSONB DEFAULT '{}'::jsonb,
    p_outbox_job_type TEXT DEFAULT NULL,
    p_outbox_dedup_key TEXT DEFAULT NULL,
    p_outbox_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS public.trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_trade public.trades;
    v_updated_trade public.trades;
BEGIN
    SELECT * INTO v_old_trade
    FROM public.trades
    WHERE trade_id = p_trade_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TRADE_NOT_FOUND: %', p_trade_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_old_trade.version <> p_expected_version THEN
        RAISE EXCEPTION 'CONCURRENT_MODIFICATION: expected version %, actual %',
            p_expected_version, v_old_trade.version
            USING ERRCODE = 'serialization_failure';
    END IF;

    UPDATE public.trades
    SET
        lifecycle_state = COALESCE(p_new_lifecycle_state, lifecycle_state),
        payment_state = COALESCE(p_new_payment_state, payment_state),
        payout_state = COALESCE(p_new_payout_state, payout_state),
        refund_state = COALESCE(p_new_refund_state, refund_state),
        escrow_state = COALESCE(p_new_escrow_state, escrow_state)
    WHERE id = v_old_trade.id
    RETURNING * INTO v_updated_trade;

    INSERT INTO public.trade_audit_events (
        trade_uuid,
        trade_id,
        actor_address,
        actor_role,
        event_type,
        previous_state,
        new_state,
        correlation_id,
        metadata
    ) VALUES (
        v_updated_trade.id,
        v_updated_trade.trade_id,
        lower(p_actor_address),
        p_actor_role,
        p_event_type,
        v_old_trade.lifecycle_state,
        v_updated_trade.lifecycle_state,
        p_correlation_id,
        p_audit_metadata
    );

    IF p_outbox_job_type IS NOT NULL AND p_outbox_dedup_key IS NOT NULL THEN
        INSERT INTO public.outbox_jobs (
            job_type,
            dedup_key,
            trade_id,
            payload
        ) VALUES (
            p_outbox_job_type,
            p_outbox_dedup_key,
            v_updated_trade.trade_id,
            p_outbox_payload
        )
        ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    RETURN v_updated_trade;
END;
$$;
