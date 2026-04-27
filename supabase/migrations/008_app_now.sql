-- Migration 008 — server clock helper.
--
-- Mobile devices can have wrong system clocks (manual time adjustments,
-- traveling across time zones with auto-time off, etc.). When the client
-- computes "is this chat archived?" using `Date.now()`, the result is
-- unreliable.
--
-- Instead, mobile fetches `app_now()` once on screen load and uses the
-- returned epoch-ms as the "now" reference for archival / timing checks.

CREATE OR REPLACE FUNCTION app_now()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
$$;

GRANT EXECUTE ON FUNCTION app_now() TO authenticated, anon, service_role;

-- Flush PostgREST cache so the new RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
