-- Add discord_channel_id to notification_preferences
-- When set, the bot posts to this channel instead of sending DMs
ALTER TABLE notification_preferences
  ADD COLUMN discord_channel_id text;

-- Set the channel for existing user
UPDATE notification_preferences
SET discord_channel_id = '1489310794125676586'
WHERE user_id = '15f2001c-2426-4fb4-911c-8b06398ac36a';
