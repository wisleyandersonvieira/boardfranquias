-- Add UPDATE policy for employee_obligation_attachments
CREATE POLICY "Users can update obligation attachments" 
ON employee_obligation_attachments 
FOR UPDATE 
USING (auth.role() = 'authenticated'::text)
WITH CHECK (auth.role() = 'authenticated'::text);