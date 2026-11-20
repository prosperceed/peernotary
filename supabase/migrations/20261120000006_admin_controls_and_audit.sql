CREATE TABLE IF NOT EXISTS public.admin_user_controls (
    wallet_address TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    reason TEXT,
    imposed_by TEXT NOT NULL,
    imposed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    lifted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT admin_user_controls_address_chk CHECK (wallet_address ~ '^0x[a-f0-9]{40}$')
);

CREATE TABLE IF NOT EXISTS public.admin_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_wallet_address TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT admin_action_log_address_chk CHECK (admin_wallet_address ~ '^0x[a-f0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at
    ON public.admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_target
    ON public.admin_action_log(target_type, target_id, created_at DESC);

ALTER TABLE public.admin_user_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_user_controls, public.admin_action_log FROM anon, authenticated;
