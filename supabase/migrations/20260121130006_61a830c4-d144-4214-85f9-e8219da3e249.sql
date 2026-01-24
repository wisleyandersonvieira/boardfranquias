-- Fix get_user_role function with correct search_path
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Also fix get_user_store_id function
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT store_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT store_id FROM public.user_stores WHERE user_id = auth.uid() LIMIT 1)
  );
$$;