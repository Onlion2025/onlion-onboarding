-- ONLION Onboarding · Vertriebspartner & Provisionen (einmalig ausführen, nach team.sql)
-- In Supabase: SQL Editor → New query → alles einfügen → Run.
-- Rollen: owner / member = ONLION (voller Zugriff), partner = Vertriebspartner (nur eigene Kunden).

-- 1) Partnerdaten in der Team-Liste
alter table public.team drop constraint if exists team_role_check;
alter table public.team add constraint team_role_check check (role in ('owner', 'member', 'partner'));
alter table public.team add column if not exists sponsor          text references public.team(email) on update cascade on delete set null;
alter table public.team add column if not exists status           text not null default 'aktiv';
alter table public.team drop constraint if exists team_status_check;
alter table public.team add constraint team_status_check check (status in ('aktiv', 'inaktiv'));
alter table public.team add column if not exists name             text;
alter table public.team add column if not exists firma            text;
alter table public.team add column if not exists adresse          text;
alter table public.team add column if not exists steuer_nr        text;
alter table public.team add column if not exists kleinunternehmer boolean not null default false;
alter table public.team add column if not exists vertrag_am       date;
alter table public.team add column if not exists sonder           jsonb;
-- Werber kann nicht gelöscht werden, solange er Partner in seiner Struktur hat
alter table public.team drop constraint if exists team_sponsor_fkey;
alter table public.team add constraint team_sponsor_fkey foreign key (sponsor) references public.team(email) on update cascade on delete restrict;
alter table public.team drop constraint if exists team_sponsor_not_self;
alter table public.team add constraint team_sponsor_not_self check (sponsor is null or sponsor <> email);

-- 2) Prüffunktionen
create or replace function public.my_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team where email = public.my_email() and role in ('owner', 'member'));
$$;

create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team where email = public.my_email() and role = 'partner' and status = 'aktiv');
$$;

-- bisherige Funktion: jetzt „Admin oder aktiver Partner“
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_partner();
$$;

-- Struktur eines Partners (2 Ebenen), ohne Adressen oder Kundendaten
create or replace function public.my_structure()
returns table (email text, name text, ebene int, status text)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select t.email, t.name, 1 as ebene, t.status from public.team t
      where t.sponsor = public.my_email() and t.role = 'partner'
    union all
    select t.email, t.name, tree.ebene + 1, t.status from public.team t
      join tree on t.sponsor = tree.email
      where tree.ebene < 2 and t.role = 'partner'
  )
  select email, name, ebene, status from tree where public.is_team_member();
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_partner() from public;
revoke all on function public.is_team_member() from public;
revoke all on function public.my_structure() from public;
grant execute on function public.my_email() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_partner() to authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.my_structure() to authenticated;

-- 3) Team-Liste: ONLION sieht und pflegt alle, Partner nur den eigenen Eintrag
drop policy if exists "Team liest Team" on public.team;
drop policy if exists "Admin liest Team" on public.team;
drop policy if exists "Admin ändert Team" on public.team;
drop policy if exists "Partner liest sich" on public.team;
create policy "Admin liest Team" on public.team for select to authenticated using (public.is_admin());
-- ONLION darf nur Partnerdaten ändern: keine Rollen, keine E-Mail, keine Sperrzeiten
revoke update on public.team from authenticated;
grant update (name, firma, adresse, steuer_nr, kleinunternehmer, vertrag_am, sonder, status, sponsor) on public.team to authenticated;
create policy "Admin ändert Team" on public.team for update to authenticated
  using (public.is_admin() and role = 'partner') with check (public.is_admin() and role = 'partner');
create policy "Partner liest sich" on public.team for select to authenticated using (email = public.my_email());

-- 4) Daten: ONLION alles, Partner nur eigene Kunden und eigene Abrechnung
drop policy if exists "Nur Team" on public.docs;
drop policy if exists "Admin alles" on public.docs;
drop policy if exists "Partner liest Stammdaten" on public.docs;
drop policy if exists "Partner eigene Kunden" on public.docs;
drop policy if exists "Partner liest eigene Kunden" on public.docs;
drop policy if exists "Partner legt Kunden an" on public.docs;
drop policy if exists "Partner ändert eigene Kunden" on public.docs;
drop policy if exists "Partner eigene Abrechnung" on public.docs;
drop policy if exists "Partner Vorschlag anlegen" on public.docs;
drop policy if exists "Partner Vorschlag lesen" on public.docs;

create policy "Admin alles" on public.docs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Partner liest Stammdaten" on public.docs for select to authenticated
  using (public.is_partner() and collection in ('templates', 'legal', 'config'));

-- Partner: eigene Kunden lesen, anlegen, ändern – aber nicht löschen
create policy "Partner liest eigene Kunden" on public.docs for select to authenticated
  using (public.is_partner() and collection = 'customers' and data ->> 'partner' = public.my_email());
create policy "Partner legt Kunden an" on public.docs for insert to authenticated
  with check (public.is_partner() and collection = 'customers' and data ->> 'partner' = public.my_email());
create policy "Partner ändert eigene Kunden" on public.docs for update to authenticated
  using (public.is_partner() and collection = 'customers' and data ->> 'partner' = public.my_email())
  with check (public.is_partner() and collection = 'customers' and data ->> 'partner' = public.my_email());

create policy "Partner eigene Abrechnung" on public.docs for select to authenticated
  using (public.is_partner() and collection in ('provisionen', 'gutschriften') and data ->> 'partner' = public.my_email());

create policy "Partner Vorschlag anlegen" on public.docs for insert to authenticated
  with check (public.is_partner() and collection = 'vorschlaege' and data ->> 'von' = public.my_email());

create policy "Partner Vorschlag lesen" on public.docs for select to authenticated
  using (public.is_partner() and collection = 'vorschlaege' and data ->> 'von' = public.my_email());

-- Kontrolle: 8 Policies auf docs, 3 auf team
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('docs', 'team') order by tablename, policyname;
