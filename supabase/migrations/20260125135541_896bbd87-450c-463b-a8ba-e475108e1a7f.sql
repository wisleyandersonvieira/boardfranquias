-- Criar função para verificar se o usuário tem perfil "Matriz"
CREATE OR REPLACE FUNCTION public.is_matriz_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_profiles up ON p.profile_id = up.id
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND up.name = 'Matriz'
  )
$$;

-- Criar função para verificar se um usuário pertence à mesma matriz
CREATE OR REPLACE FUNCTION public.user_in_same_matrix(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p1
    JOIN public.profiles p2 ON p1.matrix_id = p2.matrix_id
    WHERE p1.id = auth.uid()
      AND p2.id = target_user_id
  )
$$;

-- Criar função para verificar se uma loja pertence à matriz do usuário atual
CREATE OR REPLACE FUNCTION public.store_in_user_matrix(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.stores s ON p.matrix_id = s.matrix_id
    WHERE p.id = auth.uid()
      AND s.id = target_store_id
  )
$$;

-- Adicionar política para usuários Matriz gerenciarem vínculos de lojas na sua matriz
CREATE POLICY "Matriz users can manage user stores in their matrix"
ON public.user_stores
FOR ALL
USING (
  public.is_matriz_user() 
  AND public.user_in_same_matrix(user_id)
)
WITH CHECK (
  public.is_matriz_user() 
  AND public.user_in_same_matrix(user_id)
  AND public.store_in_user_matrix(store_id)
);