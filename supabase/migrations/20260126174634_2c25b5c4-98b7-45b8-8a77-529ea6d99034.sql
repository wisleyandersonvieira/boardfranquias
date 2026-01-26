-- Corrigir URLs antigas de anexos que apontam para o projeto Supabase antigo
-- Extrair apenas o path relativo (após 'account-documents/')

UPDATE cash_control_expenses
SET attachments = (
  SELECT jsonb_agg(
    CASE 
      WHEN att->>'path' LIKE '%qyqohixqddotjgijftcw.supabase.co%' THEN
        jsonb_set(
          att,
          '{path}',
          to_jsonb(
            regexp_replace(
              att->>'path',
              '^https://qyqohixqddotjgijftcw\.supabase\.co/storage/v1/object/public/account-documents/',
              ''
            )
          )
        )
      ELSE att
    END
  )
  FROM jsonb_array_elements(attachments) AS att
)
WHERE attachments IS NOT NULL 
AND attachments::text LIKE '%qyqohixqddotjgijftcw%';