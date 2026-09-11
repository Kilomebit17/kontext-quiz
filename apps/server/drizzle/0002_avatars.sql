ALTER TABLE "users" ADD COLUMN "avatar" text DEFAULT 'cat-0' NOT NULL;--> statement-breakpoint
-- Existing accounts get a random animal too (same catalogue as @kontext/shared avatars.ts).
UPDATE "users"
SET avatar = (ARRAY['cat','fox','panda','frog','owl','bear','koala','penguin','lion','monkey','rabbit','tiger','pig','dog','octopus','unicorn'])[floor(random() * 16) + 1]
             || '-' || floor(random() * 8)::int
WHERE avatar = 'cat-0';
