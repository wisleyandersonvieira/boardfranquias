-- Remove old conflicting policies
DROP POLICY IF EXISTS "All users can view all job functions" ON public.job_functions;
DROP POLICY IF EXISTS "Admins can manage all job functions" ON public.job_functions;
DROP POLICY IF EXISTS "Users can delete job functions for their store" ON public.job_functions;
DROP POLICY IF EXISTS "Users can insert job functions for their store" ON public.job_functions;
DROP POLICY IF EXISTS "Users can update job functions for their store" ON public.job_functions;