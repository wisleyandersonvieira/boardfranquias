-- Add new fields for expense payment tracking and notes
ALTER TABLE public.cash_control_expenses 
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS notes text;