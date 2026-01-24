-- Criar função para verificar se o usuário tem permissão de escrita no módulo cadastros
CREATE OR REPLACE FUNCTION public.has_cadastros_write_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.user_profiles up ON p.profile_id = up.id
    LEFT JOIN public.profile_permissions pp ON pp.profile_id = up.id
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        -- Check if user has admin role in profiles table
        p.role = 'admin'
        -- Or has write/admin permission for cadastros module
        OR (pp.module = 'cadastros' AND pp.permission IN ('write', 'admin'))
      )
  )
$$;

-- Remover política antiga de gerenciamento
DROP POLICY IF EXISTS "Admins can manage account groups" ON public.account_groups;

-- Criar novas políticas baseadas em permissões
CREATE POLICY "Users with write permission can insert account groups" 
ON public.account_groups 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_cadastros_write_permission());

CREATE POLICY "Users with write permission can update account groups" 
ON public.account_groups 
FOR UPDATE 
TO authenticated
USING (public.has_cadastros_write_permission());

CREATE POLICY "Users with write permission can delete account groups" 
ON public.account_groups 
FOR DELETE 
TO authenticated
USING (public.has_cadastros_write_permission());