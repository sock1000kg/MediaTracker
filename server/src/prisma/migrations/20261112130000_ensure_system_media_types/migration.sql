-- Ensure the system media types exist (idempotent). On a fresh DB there is no system user yet, so nothing is inserted and the seed creates them.
INSERT INTO "MediaType" (name, "userId", created_at)
SELECT t.name, u.id, now()
FROM (VALUES ('anime'), ('manga'), ('movie'), ('game')) AS t(name)
CROSS JOIN "User" u
WHERE u.username = 'system'
ON CONFLICT ("userId", name) DO NOTHING;
