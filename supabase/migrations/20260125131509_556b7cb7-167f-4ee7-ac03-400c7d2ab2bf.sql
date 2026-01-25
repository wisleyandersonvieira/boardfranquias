-- Tornar store_id opcional já que agora usamos matrix_id como referência principal
ALTER TABLE public.creditors
ALTER COLUMN store_id DROP NOT NULL;