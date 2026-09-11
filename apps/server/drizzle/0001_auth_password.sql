ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
-- Backfill handles for existing (email / Google) accounts from the email local part,
-- suffixing duplicates: olena, olena2, olena3 …
WITH base AS (
  SELECT id,
         lower(regexp_replace(split_part(coalesce(email, 'host'), '@', 1), '[^[:alnum:]_.-]', '', 'g')) AS handle,
         row_number() OVER (
           PARTITION BY lower(regexp_replace(split_part(coalesce(email, 'host'), '@', 1), '[^[:alnum:]_.-]', '', 'g'))
           ORDER BY created_at, id
         ) AS n
  FROM "users"
  WHERE nickname IS NULL
)
UPDATE "users" u
SET nickname = left(CASE WHEN base.handle = '' THEN 'host' ELSE base.handle END, 18)
               || CASE WHEN base.n = 1 THEN '' ELSE base.n::text END
FROM base
WHERE u.id = base.id;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "nickname" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_nickname_lower_idx" ON "users" USING btree (lower("nickname"));
