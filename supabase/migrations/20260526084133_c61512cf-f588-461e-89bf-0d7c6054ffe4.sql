ALTER TABLE public.plot_units_cache
  ADD COLUMN IF NOT EXISTS sources_json jsonb,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz NOT NULL DEFAULT now();