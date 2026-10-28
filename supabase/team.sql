-- ONLION Onboarding · Team-Zugang (einmalig ausführen)
-- In Supabase: SQL Editor → New query → alles einfügen → Run.
-- Ersetzt die bisherige Policy „Nur angemeldete Nutzer“ bzw. „Nur ONLION-Konto“.
-- Danach sehen nur Konten, die im Team stehen, Kunden und Vorlagen.

-- 1) Team-Liste. Ändern darf sie nur der Server (Einladen/Entfernen in der App).
create table if not exists public.team (
  email     text        primary key check (email = lower(email)),
  role      text        not null default 'member' check (role in ('owner', 'member')),
  user_id   uuid,
  last_reset timestamptz,
  added_at  timestamptz not null default now()
);
alter table public.team enable row level security;
alter table public.team add column if not exists last_reset timestamptz;

-- Inhaber-Konto eintragen. Muss die E-Mail deines Supabase-Logins sein und
-- genau ALLOWED_USER_EMAIL in Netlify entsprechen (sonst hier anpassen).
insert into public.team (email, role) values ('onlion-@outlook.de', 'owner')
on conflict (email) do update set role = 'owner';

-- 2) Prüffunktion: Ist das angemeldete Konto im Team?
create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_team_member() from public;
grant execute on function public.is_team_member() to authenticated;

-- 3) Team-Mitglieder dürfen die Team-Liste lesen (nicht ändern)
drop policy if exists "Team liest Team" on public.team;
create policy "Team liest Team" on public.team
  for select to authenticated using (public.is_team_member());

-- 4) Kundendaten nur für das Team
drop policy if exists "Nur angemeldete Nutzer" on public.docs;
drop policy if exists "Nur ONLION-Konto" on public.docs;
drop policy if exists "Nur Team" on public.docs;
create policy "Nur Team" on public.docs
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- Kontrolle: Es sollten genau zwei Policies erscheinen („Nur Team“, „Team liest Team“)
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('docs', 'team');
