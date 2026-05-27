-- Link employee documents to a performance review (optional FK).

alter table public.employee_documents
  add column if not exists review_id uuid references public.employee_reviews (id) on delete set null;

create index if not exists employee_documents_review_id_idx
  on public.employee_documents (review_id)
  where review_id is not null;
