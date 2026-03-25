-- Remover duplicatas (manter o primeiro registro de cada par)
DELETE FROM financial_transactions WHERE id IN (
  '963bf70d-3e9e-4582-b8f1-8f1fedac8969',
  '95441400-f8cb-4b07-a81c-415a2aa56a21',
  '2089c8e2-8ac0-4767-9522-595adc182f40',
  'cdc4897f-3e63-476a-b852-5f4d503f0f8e',
  '0eef504b-570f-4faa-8035-5229cbb824fd'
);

-- Criar índice único para impedir duplicatas futuras
CREATE UNIQUE INDEX unique_financial_transaction_reference 
ON financial_transactions (reference_id, reference_type) 
WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL;