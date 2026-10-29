-- ONLION Onboarding · Speicher für Sprachnotizen (einmalig ausführen, nach vertrieb.sql)
-- In Supabase: SQL Editor → New query → alles einfügen → Run.

-- 1) Privater Speicher (nicht öffentlich), max. 10 MB je Datei
insert into storage.buckets (id, name, public, file_size_limit)
values ('sprachnotizen', 'sprachnotizen', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- 2) Darf das angemeldete Konto auf diesen Kunden zugreifen?
create or replace function public.can_access_customer(cid text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_partner() and exists (
    select 1 from public.docs d
    where d.collection = 'customers' and d.id = cid and d.data ->> 'partner' = public.my_email()));
$$;
revoke all on function public.can_access_customer(text) from public;
grant execute on function public.can_access_customer(text) to authenticated;

-- 3) Dateien liegen unter <kundenId>/<datei>: nur ONLION und der zuständige Partner
drop policy if exists "Sprachnotizen lesen" on storage.objects;
drop policy if exists "Sprachnotizen hochladen" on storage.objects;
drop policy if exists "Sprachnotizen löschen" on storage.objects;
create policy "Sprachnotizen lesen" on storage.objects for select to authenticated
  using (bucket_id = 'sprachnotizen' and public.can_access_customer((storage.foldername(name))[1]));
create policy "Sprachnotizen hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'sprachnotizen' and public.can_access_customer((storage.foldername(name))[1]));
create policy "Sprachnotizen löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'sprachnotizen' and public.can_access_customer((storage.foldername(name))[1]));

-- Kontrolle: 3 Zeilen
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Sprachnotizen%';
