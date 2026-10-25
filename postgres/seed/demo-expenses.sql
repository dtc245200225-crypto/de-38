-- Synthetic examples for the Expense Tracker demo; safe to rerun.
INSERT INTO public.expenses (title, amount, category)
SELECT 'Sample lunch', 45000.00, 'Ăn uống'
WHERE NOT EXISTS (
  SELECT 1 FROM public.expenses
  WHERE title = 'Sample lunch' AND category = 'Ăn uống'
);

INSERT INTO public.expenses (title, amount, category)
SELECT 'Sample movie ticket', 120000.00, 'Giải trí'
WHERE NOT EXISTS (
  SELECT 1 FROM public.expenses
  WHERE title = 'Sample movie ticket' AND category = 'Giải trí'
);
