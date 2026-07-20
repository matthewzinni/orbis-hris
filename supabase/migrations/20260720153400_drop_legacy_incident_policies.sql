-- Remove legacy permissive incident_reports policies that OR with HR-staff policies
-- and would otherwise allow any authenticated user to access incidents.

drop policy if exists "Allow authenticated users to delete incident reports" on public.incident_reports;
drop policy if exists "Allow authenticated users to insert incident reports" on public.incident_reports;
drop policy if exists "Allow authenticated users to select incident reports" on public.incident_reports;
drop policy if exists "Allow authenticated users to update incident reports" on public.incident_reports;
drop policy if exists "Only Matthew can delete incident reports" on public.incident_reports;
drop policy if exists "Scoped insert incident_reports" on public.incident_reports;
drop policy if exists "Scoped select incident_reports" on public.incident_reports;
drop policy if exists "Scoped update incident_reports" on public.incident_reports;
