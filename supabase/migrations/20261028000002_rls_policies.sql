-- Migration: 20261028000002_rls_policies.sql
-- Purpose: Row Level Security (RLS) for all tables, ensuring strict wallet ownership
--          isolation and prohibiting direct client mutation of financial records.

-- Helper function to extract normalized authenticated wallet address from JWT claims
CREATE OR REPLACE FUNCTION public.current_wallet_address()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT lower(
        coalesce(
            nullif(current_setting('request.jwt.claim.wallet_address', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'wallet_address'),
            ''
        )
    );
$$;

-- Helper function to extract authenticated profile_id from JWT claims
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    );
$$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_jobs ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners unless bypassed by dedicated backend service_role
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_nonces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trades FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trade_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_jobs FORCE ROW LEVEL SECURITY;

-- 1. PROFILES POLICIES
-- Authenticated users can read profiles (to resolve usernames)
CREATE POLICY profiles_select_authenticated
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can only update their own username/display_name, and cannot escalate their role
CREATE POLICY profiles_update_own_safe
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = public.current_profile_id())
    WITH CHECK (
        id = public.current_profile_id()
        AND role = 'trader'
    );

-- 2. WALLET ACCOUNTS POLICIES
CREATE POLICY wallet_accounts_select_own
    ON public.wallet_accounts
    FOR SELECT
    TO authenticated
    USING (
        profile_id = public.current_profile_id()
        OR wallet_address = public.current_wallet_address()
    );

-- 3. WALLET NONCES & SESSIONS
-- Never directly accessible to browser clients; strictly backend-managed
-- (No policies granted to anon or authenticated)

-- 4. TRADES POLICIES
-- Buyers and sellers can view trades they are party to, or open market offers
CREATE POLICY trades_select_participant_or_open
    ON public.trades
    FOR SELECT
    TO authenticated
    USING (
        lifecycle_state = 'OPEN'
        OR seller_address = public.current_wallet_address()
        OR buyer_address = public.current_wallet_address()
    );

-- No INSERT/UPDATE/DELETE policies for anon or authenticated on trades:
-- all mutations must go through the authoritative Rust backend / server functions.

-- 5. PAYMENT ATTEMPTS POLICIES
-- Only the buyer or seller of the trade may read payment attempts
CREATE POLICY payment_attempts_select_own
    ON public.payment_attempts
    FOR SELECT
    TO authenticated
    USING (
        buyer_address = public.current_wallet_address()
        OR EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = payment_attempts.trade_uuid
              AND (t.seller_address = public.current_wallet_address() OR t.buyer_address = public.current_wallet_address())
        )
    );

-- 6. PAYMENT EVENTS (Webhook Inbox)
-- Strictly internal; never readable or writable by browser clients

-- 7. SELLER PAYOUTS POLICIES
CREATE POLICY seller_payouts_select_participant
    ON public.seller_payouts
    FOR SELECT
    TO authenticated
    USING (
        seller_address = public.current_wallet_address()
        OR EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = seller_payouts.trade_uuid
              AND t.buyer_address = public.current_wallet_address()
        )
    );

-- 8. REFUNDS POLICIES
CREATE POLICY refunds_select_participant
    ON public.refunds
    FOR SELECT
    TO authenticated
    USING (
        requested_by_address = public.current_wallet_address()
        OR EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = refunds.trade_uuid
              AND (t.seller_address = public.current_wallet_address() OR t.buyer_address = public.current_wallet_address())
        )
    );

-- 9. ESCROW OPERATIONS POLICIES
CREATE POLICY escrow_operations_select_participant
    ON public.escrow_operations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = escrow_operations.trade_uuid
              AND (t.seller_address = public.current_wallet_address() OR t.buyer_address = public.current_wallet_address())
        )
    );

-- 10. TRADE AUDIT EVENTS POLICIES
CREATE POLICY trade_audit_events_select_participant
    ON public.trade_audit_events
    FOR SELECT
    TO authenticated
    USING (
        actor_address = public.current_wallet_address()
        OR EXISTS (
            SELECT 1 FROM public.trades t
            WHERE t.id = trade_audit_events.trade_uuid
              AND (t.seller_address = public.current_wallet_address() OR t.buyer_address = public.current_wallet_address())
        )
    );

-- 11. OUTBOX JOBS
-- Strictly internal; no policies granted to anon or authenticated
