-- Usernames become unique ignoring case. Any names that already collide keep the oldest
-- holder; later holders get a short suffix from their id (still 3-20 characters).
UPDATE "users" AS u
SET "display_name" = left(u."display_name", 14) || '_' || substr(replace(u."id"::text, '-', ''), 28, 5)
FROM (
  SELECT "id", row_number() OVER (PARTITION BY lower("display_name") ORDER BY "created_at", "id") AS rn
  FROM "users"
  WHERE "display_name" IS NOT NULL
) AS d
WHERE u."id" = d."id" AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_lower_uq" ON "users" USING btree (lower("display_name")) WHERE "users"."display_name" IS NOT NULL;
