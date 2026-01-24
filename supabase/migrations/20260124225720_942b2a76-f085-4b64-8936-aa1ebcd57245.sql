-- Criar o perfil "Matriz" com as mesmas permissões do Administrador
INSERT INTO public.user_profiles (name, description, is_active)
VALUES ('Matriz', 'Perfil exclusivo para o usuário principal de cada matriz. Único perfil que pode criar novos usuários.', true);

-- Copiar as permissões do perfil Administrador para o perfil Matriz
INSERT INTO public.profile_permissions (profile_id, module, permission)
SELECT 
  (SELECT id FROM public.user_profiles WHERE name = 'Matriz'),
  pp.module,
  pp.permission
FROM public.profile_permissions pp
WHERE pp.profile_id = (SELECT id FROM public.user_profiles WHERE name = 'Administrador');