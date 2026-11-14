-- Goodreads ratings are 1-5 stars and its export uses 0 for "not rated", so a rating of 0
-- on a Goodreads-sourced log means "unrated". Earlier imports stored it as 0; store NULL instead.
-- Accepted edge case: a Goodreads-imported log a user manually edited to a deliberate 0 also
-- becomes unrated. Idempotent, no schema change.
UPDATE "UserLogs" AS l SET "rating" = NULL
FROM "Media" AS m
WHERE l."mediaId" = m."id" AND m."source" = 'goodreads' AND l."rating" = 0;
