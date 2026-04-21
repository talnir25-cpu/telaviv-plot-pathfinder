-- Cache table for storing existing units count per plot
CREATE TABLE public.plot_units_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gush INTEGER NOT NULL,
  helka INTEGER NOT NULL,
  existing_units INTEGER NOT NULL,
  existing_floors INTEGER,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'govmap_bldg', 'estimate'
  building_count INTEGER,
  total_floor_area NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (gush, helka)
);

CREATE INDEX idx_plot_units_cache_gush_helka ON public.plot_units_cache (gush, helka);

-- Public read access (no auth required for this app yet)
ALTER TABLE public.plot_units_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plot units cache"
ON public.plot_units_cache
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert plot units cache"
ON public.plot_units_cache
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update plot units cache"
ON public.plot_units_cache
FOR UPDATE
USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_plot_units_cache_updated_at
BEFORE UPDATE ON public.plot_units_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();