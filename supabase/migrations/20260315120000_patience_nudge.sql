-- ═══════════════════════════════════════════════════════════
--  Patience Nudge: recurring reminders for neutral-zone scores
-- ═══════════════════════════════════════════════════════════

-- Add patience_nudge to event type enum
ALTER TYPE alert_event_type ADD VALUE 'patience_nudge';

-- Make alert_id nullable (nudge events are global, not tied to a specific alert)
ALTER TABLE alert_events ALTER COLUMN alert_id DROP NOT NULL;

-- Drop the foreign key constraint and re-add it to allow nulls
ALTER TABLE alert_events DROP CONSTRAINT alert_events_alert_id_fkey;
ALTER TABLE alert_events
    ADD CONSTRAINT alert_events_alert_id_fkey
    FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;

-- Add nudge preferences to notification_preferences
ALTER TABLE notification_preferences
    ADD COLUMN nudge_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN nudge_frequency text NOT NULL DEFAULT 'daily' CHECK (nudge_frequency IN ('daily', 'every_12h', 'every_6h', 'off')),
    ADD COLUMN nudge_time time NOT NULL DEFAULT '10:00';
