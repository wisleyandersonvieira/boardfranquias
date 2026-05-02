-- Corrige escalada de privilégio via self-update da coluna role em profiles.
-- A política anterior permitia UPDATE irrestrito na própria linha, incluindo o campo role.
-- A nova política usa WITH CHECK para garantir que o role não pode ser alterado pelo próprio usuário.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );
