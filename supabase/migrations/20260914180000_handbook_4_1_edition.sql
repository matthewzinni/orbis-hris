-- Name the current handbook edition on unsigned forms and the shared signing link.
-- Signed records keep the wording that was issued at the time of signature.

alter table public.handbook_acknowledgment_forms
  alter column document_title set default 'Employee Handbook 4.1 effective 1 September 2026',
  alter column acknowledgment_text set default 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook 4.1, effective 1 September 2026. I understand that the handbook is not a contract of employment and that policies may change at any time.';

alter table public.handbook_group_links
  alter column document_title set default 'Employee Handbook 4.1 effective 1 September 2026',
  alter column acknowledgment_text set default 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook 4.1, effective 1 September 2026. I understand that the handbook is not a contract of employment and that policies may change at any time.';

update public.handbook_group_links
set
  document_title = 'Employee Handbook 4.1 effective 1 September 2026',
  acknowledgment_text = 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook 4.1, effective 1 September 2026. I understand that the handbook is not a contract of employment and that policies may change at any time.'
where id = 'employee-handbook';

update public.handbook_acknowledgment_forms
set
  document_title = 'Employee Handbook 4.1 effective 1 September 2026',
  acknowledgment_text = 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook 4.1, effective 1 September 2026. I understand that the handbook is not a contract of employment and that policies may change at any time.'
where signed_at is null;
