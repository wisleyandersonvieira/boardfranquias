-- Make store_id nullable since period blocks are matrix-level, not store-level
ALTER TABLE public.period_blocks ALTER COLUMN store_id DROP NOT NULL;