-- Drop the existing check constraint and recreate it with the new value
ALTER TABLE employee_obligations 
DROP CONSTRAINT IF EXISTS employee_obligations_recurrence_type_check;

ALTER TABLE employee_obligations 
ADD CONSTRAINT employee_obligations_recurrence_type_check 
CHECK (recurrence_type IN ('unica', 'periodica', 'documentacao'));