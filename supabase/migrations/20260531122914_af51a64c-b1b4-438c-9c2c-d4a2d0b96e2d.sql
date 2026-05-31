
CREATE TABLE public.zoning_rights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_code TEXT NOT NULL,
  quarter INTEGER NOT NULL,
  zone_label TEXT NOT NULL,
  location_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  coverage_pct INTEGER,
  max_far INTEGER NOT NULL,
  max_floors_above INTEGER NOT NULL,
  max_floors_roof INTEGER DEFAULT 0,
  density_coefficient_sqm_per_unit INTEGER NOT NULL,
  min_unit_size_sqm INTEGER,
  setback_front_m NUMERIC(4,1),
  setback_side_m NUMERIC(4,1),
  setback_rear_m NUMERIC(4,1),
  tama38_far_bonus INTEGER DEFAULT 0,
  pinui_far_bonus INTEGER DEFAULT 0,
  rova_plan_far_bonus INTEGER DEFAULT 0,
  tama38_units_bonus_pct INTEGER DEFAULT 0,
  pinui_units_bonus_pct INTEGER DEFAULT 0,
  source_citation TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (plan_code, zone_label, location_filter)
);

GRANT SELECT ON public.zoning_rights TO anon;
GRANT SELECT ON public.zoning_rights TO authenticated;
GRANT ALL ON public.zoning_rights TO service_role;

ALTER TABLE public.zoning_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read zoning rights"
  ON public.zoning_rights FOR SELECT
  USING (true);

CREATE TRIGGER update_zoning_rights_updated_at
  BEFORE UPDATE ON public.zoning_rights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_zoning_rights_quarter ON public.zoning_rights(quarter);
CREATE INDEX idx_zoning_rights_plan ON public.zoning_rights(plan_code);

-- ============ Seed: רבע 3 (תא/3616/א) ============
INSERT INTO public.zoning_rights
  (plan_code, quarter, zone_label, location_filter, coverage_pct, max_far,
   max_floors_above, max_floors_roof, density_coefficient_sqm_per_unit,
   min_unit_size_sqm, setback_front_m, setback_side_m, setback_rear_m,
   tama38_far_bonus, pinui_far_bonus, rova_plan_far_bonus,
   tama38_units_bonus_pct, pinui_units_bonus_pct,
   source_citation, notes)
VALUES
  ('תא/3616/א', 3, 'מגורים א', '{"area":"rest"}', 35, 150, 4, 1, 100, 80,
   5.0, 3.0, 5.0, 50, 100, 30, 60, 150,
   'תא/3616/א, פרק זכויות, מגורים א', 'בנייה נמוכת קומות'),
  ('תא/3616/א', 3, 'מגורים ב', '{"area":"rest"}', 40, 200, 5, 1, 80, 70,
   3.0, 2.5, 5.0, 60, 120, 40, 75, 180,
   'תא/3616/א, פרק זכויות, מגורים ב', null),
  ('תא/3616/א', 3, 'מגורים ב מיוחד', '{"area":"declaration"}', 45, 240, 6, 1, 70, 65,
   0.0, 2.5, 4.5, 60, 120, 50, 75, 200,
   'תא/3616/א, אזור הצהרה', 'אזור הצהרה — נסיגות מוקלות'),
  ('תא/3616/א', 3, 'מגורים ג', '{"area":"rest"}', 45, 280, 7, 1, 65, 60,
   3.0, 2.5, 5.0, 70, 140, 60, 90, 220,
   'תא/3616/א, פרק זכויות, מגורים ג', 'ייעוד שכיח ברובע'),
  ('תא/3616/א', 3, 'מגורים ומסחר', '{"area":"market_street"}', 50, 320, 7, 1, 75, 60,
   0.0, 2.5, 4.5, 60, 130, 50, 80, 200,
   'תא/3616/א, חזית מסחרית', 'קומת קרקע מסחרית'),
  ('תא/3616/א', 3, 'מסחר', '{}', 60, 280, 5, 0, 0, null,
   0.0, 0.0, 0.0, 0, 0, 0, 0, 0,
   'תא/3616/א, ייעוד מסחרי', 'ללא יח״ד');

-- ============ Seed: רבע 4 (תא/3729/א) ============
INSERT INTO public.zoning_rights
  (plan_code, quarter, zone_label, location_filter, coverage_pct, max_far,
   max_floors_above, max_floors_roof, density_coefficient_sqm_per_unit,
   min_unit_size_sqm, setback_front_m, setback_side_m, setback_rear_m,
   tama38_far_bonus, pinui_far_bonus, rova_plan_far_bonus,
   tama38_units_bonus_pct, pinui_units_bonus_pct,
   source_citation, notes)
VALUES
  ('תא/3729/א', 4, 'מגורים א', '{}', 35, 160, 5, 1, 100, 80,
   5.0, 3.0, 5.0, 50, 100, 30, 60, 150,
   'תא/3729/א, פרק זכויות, מגורים א', null),
  ('תא/3729/א', 4, 'מגורים ב', '{}', 40, 200, 6, 1, 85, 70,
   4.0, 3.0, 5.0, 60, 120, 40, 75, 180,
   'תא/3729/א, פרק זכויות, מגורים ב', null),
  ('תא/3729/א', 4, 'מגורים ב מיוחד', '{}', 45, 248, 7, 1, 75, 65,
   3.0, 2.5, 5.0, 60, 120, 50, 75, 200,
   'תא/3729/א, פרק זכויות, מגורים ב מיוחד', null),
  ('תא/3729/א', 4, 'מגורים ג', '{}', 45, 280, 8, 1, 70, 60,
   4.0, 3.0, 5.0, 70, 140, 60, 90, 220,
   'תא/3729/א, פרק זכויות, מגורים ג', 'ייעוד שכיח ברובע'),
  ('תא/3729/א', 4, 'מגורים ומסחר', '{"area":"market_street"}', 50, 320, 8, 1, 80, 60,
   0.0, 3.0, 5.0, 60, 130, 50, 80, 200,
   'תא/3729/א, חזית מסחרית', 'קומת קרקע מסחרית'),
  ('תא/3729/א', 4, 'מסחר', '{}', 60, 280, 6, 0, 0, null,
   0.0, 0.0, 0.0, 0, 0, 0, 0, 0,
   'תא/3729/א, ייעוד מסחרי', 'ללא יח״ד');
