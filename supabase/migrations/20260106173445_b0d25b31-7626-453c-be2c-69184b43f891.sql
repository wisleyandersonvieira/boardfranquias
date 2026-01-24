-- Add is_active column to employee_obligation_attachments
ALTER TABLE employee_obligation_attachments 
ADD COLUMN is_active boolean NOT NULL DEFAULT true;