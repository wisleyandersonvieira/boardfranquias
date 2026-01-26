-- Create a security definer function to get brand details by id
-- This bypasses RLS to allow fetching brand data for authorization checks
CREATE OR REPLACE FUNCTION public.get_brand_by_id(p_brand_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  authorized_group_users UUID[],
  authorized_subgroup_users UUID[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    b.id,
    b.name,
    b.authorized_group_users,
    b.authorized_subgroup_users
  FROM brands b
  WHERE b.id = p_brand_id;
$$;