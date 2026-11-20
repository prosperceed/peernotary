CREATE TABLE IF NOT EXISTS public.super_admin_wallets (
    wallet_address TEXT PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    first_authenticated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    last_authenticated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT super_admin_wallets_address_chk CHECK (
        wallet_address ~ '^0x[a-f0-9]{40}$'
    )
);

ALTER TABLE public.super_admin_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_wallets FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_super_admin_wallets_last_authenticated
    ON public.super_admin_wallets(last_authenticated_at DESC);

REVOKE ALL ON public.super_admin_wallets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'total_volume_usdc_units', COALESCE(SUM(usdc_amount_units), 0),
        'total_volume_fiat_minor', COALESCE(SUM(fiat_amount_minor), 0),
        'completed_transactions', COUNT(*) FILTER (WHERE lifecycle_state = 'COMPLETED'),
        'queued_transactions', COUNT(*) FILTER (
            WHERE lifecycle_state IN ('AWAITING_PAYMENT', 'PAYMENT_CONFIRMED', 'SELLER_PAYOUT_PENDING', 'RELEASE_PENDING')
        ),
        'active_escrows', COUNT(*) FILTER (
            WHERE escrow_state IN ('CREATED', 'FUNDED', 'FIAT_SENT', 'RELEASE_PENDING', 'ON_HOLD', 'DISPUTED')
        ),
        'total_escrow_usdc_units', COALESCE(SUM(usdc_amount_units) FILTER (
            WHERE escrow_state IN ('CREATED', 'FUNDED', 'FIAT_SENT', 'RELEASE_PENDING', 'ON_HOLD', 'DISPUTED')
        ), 0),
        'treasury_fee_usdc_units', COALESCE(SUM(platform_fee_usdc_units), 0),
        'total_users', (SELECT COUNT(*) FROM public.wallet_accounts)
    )
    FROM public.trades;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_snapshot() TO service_role;
