-- Imports used to write mixed-case statuses ("Completed", "In progress").
-- Fold every status onto the four canonical lowercase values; anything else becomes NULL.
UPDATE "UserLogs" SET status = lower(trim(status)) WHERE status IS NOT NULL AND status <> lower(trim(status));
UPDATE "UserLogs" SET status = NULL WHERE status IS NOT NULL AND status NOT IN ('completed', 'in progress', 'wishlist', 'dropped');
