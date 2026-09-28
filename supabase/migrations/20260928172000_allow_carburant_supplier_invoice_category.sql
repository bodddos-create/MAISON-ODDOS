alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_category_check;

alter table public.supplier_invoices
  add constraint supplier_invoices_category_check
  check (
    category = any (
      array[
        'Alimentaire'::text,
        'Boissons'::text,
        'Consommable'::text,
        'Entretien'::text,
        'Carburant'::text,
        'Mobilier'::text,
        'Energie'::text,
        'Assurance'::text,
        'Telephonie'::text,
        'TPE'::text,
        'Logiciel caisse'::text
      ]
    )
  );
