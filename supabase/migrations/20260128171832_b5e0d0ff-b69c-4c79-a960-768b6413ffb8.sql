
-- Remover a constraint única atual (apenas parameter_key)
ALTER TABLE public.system_parameters 
DROP CONSTRAINT IF EXISTS system_parameters_parameter_key_key;

-- Criar nova constraint única composta (parameter_key + matrix_id)
-- Isso permite que cada matriz tenha suas próprias configurações de parâmetros
ALTER TABLE public.system_parameters
ADD CONSTRAINT system_parameters_parameter_key_matrix_id_key 
UNIQUE (parameter_key, matrix_id);
