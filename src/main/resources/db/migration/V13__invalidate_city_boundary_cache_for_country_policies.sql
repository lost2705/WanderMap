-- Stage C changed municipality semantics for these countries. Boundary cache is
-- reconstructable derived data and will be requalified lazily on the next request.
DELETE FROM city_boundaries AS boundary
USING cities AS city
WHERE boundary.city_id = city.id
  AND city.country_code IN ('NL', 'FR', 'IT', 'LI');
