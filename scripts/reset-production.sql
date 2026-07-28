-- One-time production reset for account-owned state.
-- Keep schema, resource configuration, system-managed rooms, and seeded activities.
PRAGMA foreign_keys = ON;

DELETE FROM announcements;
DELETE FROM activities WHERE created_by IS NOT NULL;
DELETE FROM chat_rooms WHERE system_managed = 0;
DELETE FROM password_reset_codes;
DELETE FROM sessions;
DELETE FROM users;
DELETE FROM app_meta
WHERE substr(key, 1, length('user_count_metrics:')) = 'user_count_metrics:';
