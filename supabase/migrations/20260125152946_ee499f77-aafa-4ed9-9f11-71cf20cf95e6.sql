-- Add matrix_id column to document_types (nullable to allow default/standard types)
ALTER TABLE public.document_types 
ADD COLUMN matrix_id UUID REFERENCES public.matrices(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX idx_document_types_matrix_id ON public.document_types(matrix_id);

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Authenticated users can view document types" ON public.document_types;
DROP POLICY IF EXISTS "Users with cadastros write permission can delete document types" ON public.document_types;
DROP POLICY IF EXISTS "Users with cadastros write permission can insert document types" ON public.document_types;
DROP POLICY IF EXISTS "Users with cadastros write permission can update document types" ON public.document_types;

-- Create new RLS policies
-- View: user can see their matrix's types OR default types (matrix_id IS NULL)
CREATE POLICY "Users can view document types for their matrix or defaults"
ON public.document_types
FOR SELECT
USING (
  matrix_id IS NULL 
  OR matrix_id = get_user_matrix_id()
);

-- Insert: only for user's own matrix
CREATE POLICY "Users can insert document types for their matrix"
ON public.document_types
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id()
  AND user_has_permission('cadastros'::text, 'write'::permission_type)
);

-- Update: only for user's own matrix types (not defaults)
CREATE POLICY "Users can update document types for their matrix"
ON public.document_types
FOR UPDATE
USING (
  matrix_id IS NOT NULL
  AND matrix_id = get_user_matrix_id()
  AND user_has_permission('cadastros'::text, 'write'::permission_type)
);

-- Delete: only for user's own matrix types (not defaults)
CREATE POLICY "Users can delete document types for their matrix"
ON public.document_types
FOR DELETE
USING (
  matrix_id IS NOT NULL
  AND matrix_id = get_user_matrix_id()
  AND user_has_permission('cadastros'::text, 'write'::permission_type)
);