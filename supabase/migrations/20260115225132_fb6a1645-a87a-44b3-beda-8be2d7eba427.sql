-- Adicionar coluna is_registered (Registrado) na tabela employees
ALTER TABLE public.employees 
ADD COLUMN is_registered boolean NOT NULL DEFAULT false;