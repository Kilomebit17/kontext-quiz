-- The avatar set changed from the built-in SVG animals to the illustrated
-- monster characters (apps/web/avatars-src → packages/shared/src/avatar-catalog.ts).
-- Re-roll every account whose character is not in the new catalogue so nobody
-- is left with a placeholder. Colour index (0–7) is kept where possible.
UPDATE "users"
SET avatar = (ARRAY[
      'lime-scream','sky-smile','teal-sad','magenta-laugh','orange-tongue','amber-fangs','teal-grin',
      'navy-wink','coral-surprised','violet-happy','lime-bored','navy-cyclops','green-goofy'
    ])[floor(random() * 13) + 1]
    || '-' || COALESCE(NULLIF(regexp_replace(avatar, '^.*-', ''), '')::int % 8, floor(random() * 8)::int)
WHERE regexp_replace(avatar, '-[0-9]+$', '') NOT IN (
  'lime-scream','sky-smile','teal-sad','magenta-laugh','orange-tongue','amber-fangs','teal-grin',
  'navy-wink','coral-surprised','violet-happy','lime-bored','navy-cyclops','green-goofy'
);
