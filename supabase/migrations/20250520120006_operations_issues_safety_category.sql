-- Add safety category to operations issues

alter table public.operations_issues
  drop constraint if exists operations_issues_category_check;

alter table public.operations_issues
  add constraint operations_issues_category_check check (
    category in (
      'software', 'equipment', 'workflow', 'fulfillment', 'production',
      'integration', 'communication', 'process_improvement', 'safety', 'other'
    )
  );
