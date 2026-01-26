-- Update existing subgroups (records with parent_id not null) to link to Gela Boca brand
UPDATE public.account_groups 
SET brand_id = '0d178a05-c398-4149-a9ca-b02fcf074dde'
WHERE parent_id IS NOT NULL 
AND (brand_id IS NULL OR brand_id != '0d178a05-c398-4149-a9ca-b02fcf074dde');