-- Add columns for authorized users to create/edit groups and subgroups
ALTER TABLE public.brands
ADD COLUMN authorized_group_users UUID[] DEFAULT '{}',
ADD COLUMN authorized_subgroup_users UUID[] DEFAULT '{}';