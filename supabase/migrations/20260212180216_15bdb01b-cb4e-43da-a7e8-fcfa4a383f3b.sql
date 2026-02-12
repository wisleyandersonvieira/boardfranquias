
CREATE OR REPLACE FUNCTION public.get_profile_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT name FROM public.profiles WHERE id = p_user_id;
$$;
