CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
GRANT SELECT (id, org_id, name, key_prefix, created_at, last_used_at, revoked_at) ON public.api_keys TO authenticated;
GRANT INSERT (name, key_prefix, key_hash) ON public.api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org select" ON public.api_keys FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "org insert" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "org update" ON public.api_keys FOR UPDATE TO authenticated USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
CREATE TRIGGER set_org_id BEFORE INSERT ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_org_id();