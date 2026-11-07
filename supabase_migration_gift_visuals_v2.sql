-- Additive visual metadata for the gift catalog.
-- Does not change gift ids, costs, or creator shares.
-- Do not run against live data from this agent.

ALTER TABLE mm_gift_catalog ADD COLUMN IF NOT EXISTS overlay text;

UPDATE mm_gift_catalog
SET overlay = 'face_specs',
    updated_at = now()
WHERE id = 'shady_specs';
