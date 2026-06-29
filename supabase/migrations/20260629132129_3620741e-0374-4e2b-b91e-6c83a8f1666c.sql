ALTER TABLE zoning_rights ALTER COLUMN max_far DROP NOT NULL;
ALTER TABLE zoning_rights ALTER COLUMN max_floors_above DROP NOT NULL;
ALTER TABLE zoning_rights ALTER COLUMN density_coefficient_sqm_per_unit DROP NOT NULL;

ALTER TABLE zoning_rights
  ADD COLUMN IF NOT EXISTS rights_basis TEXT DEFAULT 'far_legacy',
  ADD COLUMN IF NOT EXISTS service_area_ratio_pct INTEGER,
  ADD COLUMN IF NOT EXISTS requires_manual_classification BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_note TEXT;

COMMENT ON COLUMN zoning_rights.rights_basis IS
  'far_legacy = שורות ישנות מבוססות FAR שגוי (לא בשימוש בקוד החדש) | floors_density = מבוסס טבלה 5: קומות × מקדם צפיפות (תקנוני)';
COMMENT ON COLUMN zoning_rights.service_area_ratio_pct IS
  'יחס שטח שירות מתוך שטח עיקרי, לתיעוד בלבד — אינו נכנס לחישוב יח״ד/IRR';
COMMENT ON COLUMN zoning_rights.requires_manual_classification IS
  'true = לא ניתן לקבוע אוטומטית לאיזו שורת זכויות המגרש משתייך — נדרש סיווג ידני לפני חישוב';

-- ייחודיות לוגית כדי לאפשר ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS zoning_rights_plan_zone_filter_uniq
  ON zoning_rights (plan_code, zone_label, (location_filter::text));

DELETE FROM zoning_rights WHERE plan_code IN ('תא/3616/א', 'תא/3729/א');

-- רובע 3 (תא/3616/א)
INSERT INTO zoning_rights
  (plan_code, quarter, zone_label, location_filter, rights_basis,
   max_floors_above, max_floors_roof, density_coefficient_sqm_per_unit,
   service_area_ratio_pct, setback_front_m, setback_side_m, setback_rear_m,
   requires_manual_classification, classification_note,
   source_citation, notes)
VALUES
  ('תא/3616/א', 3, 'בן יהודה/דיזנגוף מצפון לארלוזורוב', '{"streets":["בן יהודה","דיזנגוף"],"area":"north_of_arlozorov"}', 'floors_density',
   7, 1, 80, NULL, 0.0, 2.5, 4.5, false, NULL,
   'תא/3616/א, טבלה 5, עמ׳ 28', 'כל גודל מגרש'),
  ('תא/3616/א', 3, 'שאר הרחובות מצפון לארלוזורוב', '{"area":"north_of_arlozorov_rest"}', 'floors_density',
   6, 1, 65, NULL, NULL, 2.5, 4.5, false, NULL,
   'תא/3616/א, טבלה 5, עמ׳ 28', 'קו בניין קדמי לפי תכנית מאושרת אחרת'),
  ('תא/3616/א', 3, 'בן יהודה/דיזנגוף מדרום לארלוזורוב', '{"streets":["בן יהודה","דיזנגוף"],"area":"south_of_arlozorov"}', 'floors_density',
   6, 1, NULL, 20, NULL, 2.5, 4.5, true,
   'מקדם הצפיפות בתקנון מוגדר כ-20% משטחי הבנייה הכוללים (לפי תכנית עפ״י תקנה) — אינו מקדם מ"ר/יח"ד קבוע. דורש בדיקה תכנונית נקודתית לפני חישוב יח"ד.',
   'תא/3616/א, טבלה 5, עמ׳ 28', NULL),
  ('תא/3616/א', 3, 'המלך ג׳ורג׳/בוגרשוב', '{"streets":["המלך ג׳ורג׳","בוגרשוב"],"min_plot_area_sqm":750,"max_coverage_pct":55}', 'floors_density',
   6, 1, 65, NULL, 0.0, 2.5, 4.5, false, 'מקדם תקף למגרשים 750 מ"ר ומעלה עם תכסית עד 55%',
   'תא/3616/א, טבלה 5, עמ׳ 28', NULL),
  ('תא/3616/א', 3, 'שאר הרחובות (אבן גבירול/הירקון) — מגרש קטן', '{"area":"rest","max_plot_area_sqm":500}', 'floors_density',
   5, 1, 65, NULL, 0.0, 2.5, 4.5, false, NULL,
   'תא/3616/א, טבלה 5, עמ׳ 28', 'מגרש מתחת ל-500 מ"ר'),
  ('תא/3616/א', 3, 'מגרש גדול / ארלוזורוב והירקון', '{"area":"large_plot_or_arlozorov_hayarkon","min_plot_area_sqm":500}', 'floors_density',
   6, 1, 65, NULL, 0.0, 3.0, 5.0, false, NULL,
   'תא/3616/א, טבלה 5, עמ׳ 28', 'מגרש 500 מ"ר ומעלה, או כל מגרש ברחוב ארלוזורוב/הירקון')
ON CONFLICT (plan_code, zone_label, (location_filter::text)) DO NOTHING;

-- רובע 4 (תא/3729/א)
INSERT INTO zoning_rights
  (plan_code, quarter, zone_label, location_filter, rights_basis,
   max_floors_above, max_floors_roof, density_coefficient_sqm_per_unit,
   setback_side_m, setback_rear_m,
   requires_manual_classification, classification_note,
   source_citation, notes)
VALUES
  ('תא/3729/א', 4, 'רחובות ראשיים (פנקס/נמיר/ז׳בוטינסקי/ויצמן)', '{"streets":["פנקס","דרך נמיר","ז׳בוטינסקי","ויצמן"],"area":"outside_low_rise"}', 'floors_density',
   8, 1, 90, 3.0, 5.0, false, NULL,
   'תא/3729/א, טבלה 5, עמ׳ 28', 'מחוץ לתחום התכניות לבנייה נמוכה. קו בניין קדמי לפי תכנית מאושרת אחרת'),
  ('תא/3729/א', 4, 'ארלוזורוב', '{"streets":["ארלוזורוב"],"area":"outside_low_rise"}', 'floors_density',
   7, 1, 90, 3.0, 5.0, false, NULL,
   'תא/3729/א, טבלה 5, עמ׳ 28', 'מחוץ לתחום התכניות לבנייה נמוכה'),
  ('תא/3729/א', 4, 'שאר הרחובות (מחוץ לבנייה נמוכה)', '{"area":"outside_low_rise_rest"}', 'floors_density',
   6, 1, 90, 3.0, 5.0, false, NULL,
   'תא/3729/א, טבלה 5, עמ׳ 28', 'מחוץ לתחום התכניות לבנייה נמוכה'),
  ('תא/3729/א', 4, 'יהודה המכבי/נמיר/ארלוזורוב — מגרשים ספציפיים (חריג)', '{"streets":["יהודה המכבי","נמיר","ארלוזורוב"],"area":"outside_low_rise_exception"}', 'floors_density',
   2, 1, 65, 3.0, 5.0, true,
   'חריג נקודתי למגרשים ספציפיים בלבד ברחובות אלו (לא לכל הרחוב) — נדרש אימות נקודתי איזה מגרש נכלל בחריג.',
   'תא/3729/א, טבלה 5, עמ׳ 28', NULL),
  ('תא/3729/א', 4, 'בנייה נמוכה (לא-קוטג׳) — תכניות 117/478', '{"plan_refs":["117","478"],"area":"low_rise"}', 'floors_density',
   4, 1, 90, 2.5, 5.0, true,
   'דורש סיווג ידני: שייכות המגרש לתכנית 117 (אזור פנקס) או 478 (אזור יהודה המכבי) אינה ניתנת לקביעה אוטומטית.',
   'תא/3729/א, טבלה 5, עמ׳ 29', NULL),
  ('תא/3729/א', 4, 'בנייה נמוכה (לא-קוטג׳) — תכנית 122, למעט יהודה המכבי', '{"plan_refs":["122"],"area":"low_rise","excludes_street":"יהודה המכבי"}', 'floors_density',
   3, 1, 90, 2.5, 5.0, true,
   'דורש סיווג ידני: שייכות המגרש לתכנית 122 (אזור פנקס) אינה ניתנת לקביעה אוטומטית.',
   'תא/3729/א, טבלה 5, עמ׳ 29', NULL),
  ('תא/3729/א', 4, 'תכניות 478/117/122 ברחוב יהודה המכבי', '{"plan_refs":["478","117","122"],"streets":["יהודה המכבי"],"area":"low_rise"}', 'floors_density',
   6, 1, 90, 2.5, 5.0, true,
   'דורש סיווג ידני: שייכות המגרש לתכניות אלו אינה ניתנת לקביעה אוטומטית.',
   'תא/3729/א, טבלה 5, עמ׳ 29', NULL),
  ('תא/3729/א', 4, 'רחוב ברנדיס — תכנית 478 (חריג קומות חלקיות)', '{"plan_refs":["478"],"streets":["ברנדיס"],"area":"low_rise"}', 'floors_density',
   6, 1, 65, 2.5, 5.0, true,
   'דורש סיווג ידני: שייכות המגרש לתכנית 478 לאורך רחוב ברנדיס אינה ניתנת לקביעה אוטומטית.',
   'תא/3729/א, טבלה 5, עמ׳ 29', NULL),
  ('תא/3729/א', 4, 'בנייה נמוכה ברחובות ראשיים', '{"area":"low_rise_main_streets"}', 'floors_density',
   2, 1, NULL, 2.5, 5.0, true,
   'מגרשים אלה מוגבלים ל-2 קומות + חדרי יציאה לגג/עליית גג, יח"ד יחידה (1 יח"ד למגרש) — לא מקדם צפיפות סטנדרטי. דורש סיווג ידני + לוגיקה נפרדת.',
   'תא/3729/א, טבלה 5/4.1.4, עמ׳ 30', NULL)
ON CONFLICT (plan_code, zone_label, (location_filter::text)) DO NOTHING;