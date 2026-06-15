ALTER TABLE zoning_rights 
ADD COLUMN IF NOT EXISTS max_coverage_pct integer DEFAULT NULL;

-- רובע 3
UPDATE zoning_rights SET max_far=280, max_floors_above=7, max_floors_roof=1, max_coverage_pct=55, density_coefficient_sqm_per_unit=65, rova_plan_far_bonus=30 WHERE quarter=3 AND zone_label='מגורים ג';
UPDATE zoning_rights SET max_far=280, max_floors_above=6, max_floors_roof=1, max_coverage_pct=55, density_coefficient_sqm_per_unit=80, rova_plan_far_bonus=30 WHERE quarter=3 AND zone_label='מגורים ב';
UPDATE zoning_rights SET max_far=240, max_floors_above=6, max_floors_roof=1, max_coverage_pct=50, density_coefficient_sqm_per_unit=80, rova_plan_far_bonus=30 WHERE quarter=3 AND zone_label='מגורים ב מיוחד';
UPDATE zoning_rights SET max_far=150, max_floors_above=4, max_floors_roof=0, max_coverage_pct=50, density_coefficient_sqm_per_unit=120, rova_plan_far_bonus=30 WHERE quarter=3 AND zone_label='מגורים א';
UPDATE zoning_rights SET max_far=320, max_floors_above=7, max_floors_roof=1, max_coverage_pct=60, density_coefficient_sqm_per_unit=65, rova_plan_far_bonus=25 WHERE quarter=3 AND zone_label='מגורים ומסחר';

-- רובע 4
UPDATE zoning_rights SET max_far=148, max_floors_above=7, max_floors_roof=1, max_coverage_pct=65, density_coefficient_sqm_per_unit=65, rova_plan_far_bonus=30 WHERE quarter=4 AND zone_label='רחובות צפיפות גבוהה';
UPDATE zoning_rights SET max_far=148, max_floors_above=7, max_floors_roof=1, max_coverage_pct=65, density_coefficient_sqm_per_unit=65, rova_plan_far_bonus=30 WHERE quarter=4 AND zone_label='רחובות ראשיים';
UPDATE zoning_rights SET max_far=128, max_floors_above=6, max_floors_roof=1, max_coverage_pct=65, density_coefficient_sqm_per_unit=90, rova_plan_far_bonus=30 WHERE quarter=4 AND zone_label='ברירת מחדל רובע 4';
UPDATE zoning_rights SET max_far=128, max_floors_above=5, max_floors_roof=1, max_coverage_pct=65, density_coefficient_sqm_per_unit=90, rova_plan_far_bonus=30 WHERE quarter=4 AND zone_label='אזור הכרזה אונסקו';