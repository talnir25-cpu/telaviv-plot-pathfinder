-- רובע 3: תיקון מקדמי צפיפות לפי תקנון תא/3616א
UPDATE zoning_rights SET density_coefficient_sqm_per_unit = 80
WHERE quarter = 3 AND zone_label = 'מגורים ב';

UPDATE zoning_rights SET density_coefficient_sqm_per_unit = 65
WHERE quarter = 3 AND zone_label = 'מגורים ג';

UPDATE zoning_rights SET density_coefficient_sqm_per_unit = 65
WHERE quarter = 3 AND zone_label = 'מגורים ומסחר';

-- רובע 4: תיקון מקדם צפיפות לרחובות ראשיים לפי תקנון תא/3729א
UPDATE zoning_rights SET density_coefficient_sqm_per_unit = 65
WHERE quarter = 4 AND zone_label = 'רחובות ראשיים';