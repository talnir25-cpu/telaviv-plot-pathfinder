
ALTER TABLE public.plot_units_cache
  ADD COLUMN IF NOT EXISTS built_area numeric,
  ADD COLUMN IF NOT EXISTS built_area_source text,
  ADD COLUMN IF NOT EXISTS built_area_confidence text;
