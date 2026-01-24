-- Add 'disabled' value to the permission_type enum
ALTER TYPE permission_type ADD VALUE IF NOT EXISTS 'disabled';