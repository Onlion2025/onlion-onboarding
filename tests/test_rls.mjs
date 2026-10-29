import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = new URL('../supabase/', import.meta.url).pathname;
const db = new PGlite();
const ex = s => db.exec(s);
await ex(`create role authenticated; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema auth to authenticated; grant execute on function auth.jwt() to authenticated;
create table public.docs (collection text not null, id text not null, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key (collection,id));
alter table public.docs enable row level security;
grant select, insert, update, delete on public.docs to authenticated;`);
await ex(fs.readFileSync(R + 'team.sql', 'utf8'));
await ex(`create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text, name text, owner_id text, primary key (bucket_id, name));
create function auth.uid() returns uuid language sql stable as $u$ select nullif(auth.jwt() ->> 'sub','')::uuid $u$; grant execute on function auth.uid() to authenticated;
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $f$;
grant usage on schema storage to authenticated; grant select, insert, delete on storage.objects to authenticated; grant execute on function storage.foldername(text) to authenticated;`);
await ex(`grant select, update on public.team to authenticated;`);  // wie Supabase-Standard; vertrieb.sql schränkt ein
const v = await db.exec(fs.readFileSync(R + 'vertrieb.sql', 'utf8'));
await ex(fs.readFileSync(R + 'sprachnotizen.sql', 'utf8'));
console.log('Policies:', v.at(-1).rows.map(r => r.tablename + ':' + r.policyname).join(' | '));
// Daten
await ex(`insert into team(email,role) values ('marc@x.de','member');
insert into team(email,role,sponsor,name) values ('p1@x.de','partner',null,'P1'),('p2@x.de','partner','p1@x.de','P2'),('p3@x.de','partner','p2@x.de','P3'),('p4@x.de','partner','p3@x.de','P4');
insert into team(email,role,status) values ('weg@x.de','partner','inaktiv');
insert into docs values ('customers','a','{"firma":"A","partner":"p1@x.de"}'),('customers','b','{"firma":"B","partner":"p2@x.de"}'),('customers','c','{"firma":"C"}'),
 ('templates','t','{}'),('legal','l','{}'),('config','provision','{}'),('zahlungen','z1','{"partner":"p1@x.de"}'),
 ('intern','kosten','{"fixkosten":4000}'),('provisionen','r1','{"partner":"p1@x.de"}'),('provisionen','r2','{"partner":"p2@x.de"}'),('gutschriften','g1','{"partner":"p1@x.de"}');`);
let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? 'OK   ' : 'FAIL ') + n); c ? pass++ : fail++; };
async function as(email, fn) {
  const sub = email === 'p1@x.de' ? '00000000-0000-0000-0000-000000000011' : '00000000-0000-0000-0000-0000000000aa';
  await ex(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ email, sub })}', false); set role authenticated;`);
  try { return await fn(); } finally { await ex('reset role'); }
}
const q = async s => (await db.query(s)).rows;
const tryq = async s => { try { await db.query(s); return true; } catch (e) { return false; } };

await as('onlion-@outlook.de', async () => {
  ok('Inhaber sieht alle Kunden', (await q(`select id from docs where collection='customers'`)).length === 3);
  ok('Inhaber sieht Kostenmodell', (await q(`select id from docs where collection='intern'`)).length === 1);
  ok('Inhaber sieht Zahlungen', (await q(`select id from docs where collection='zahlungen'`)).length === 1);
  ok('Inhaber sieht ganze Team-Liste', (await q(`select email from team`)).length === 7);
  ok('Inhaber kann Partner ändern', await tryq(`update team set name='Neu' where email='p1@x.de'`));
});
await as('marc@x.de', async () => {
  ok('Team-Mitglied (Admin) sieht alle Kunden', (await q(`select id from docs where collection='customers'`)).length === 3);
  ok('Mitglied kann sich nicht zum Inhaber machen', !(await tryq(`update team set role='owner' where email='marc@x.de'`)) || (await q(`select role from team where email='marc@x.de'`))[0].role === 'member');
  ok('Mitglied kann Partner nicht zum Admin machen', !(await tryq(`update team set role='member' where email='p1@x.de'`)));
  ok('Mitglied kann Sperrzeit nicht ändern', !(await tryq(`update team set last_reset=null where email='p1@x.de'`)));
  ok('Mitglied kann Inhaber-Zeile nicht ändern', (await q(`update team set name='x' where email='onlion-@outlook.de' returning email`)).length === 0);
  ok('Mitglied kann Partnerdaten pflegen', (await q(`update team set name='P1 neu', kleinunternehmer=true where email='p1@x.de' returning email`)).length === 1);
});
await as('p1@x.de', async () => {
  const c = await q(`select id from docs where collection='customers'`);
  ok('Partner sieht nur eigenen Kunden', c.length === 1 && c[0].id === 'a');
  ok('Partner sieht Kostenmodell nicht', (await q(`select id from docs where collection='intern'`)).length === 0);
  ok('Partner sieht keine Zahlungen', (await q(`select id from docs where collection='zahlungen'`)).length === 0);
  const p = await q(`select id from docs where collection in ('provisionen','gutschriften')`);
  ok('Partner sieht nur eigene Provisionen/Gutschriften', p.length === 2 && p.every(r => ['r1', 'g1'].includes(r.id)));
  ok('Partner liest Vorlagen/Rechtstexte/Modell', (await q(`select id from docs where collection in ('templates','legal','config')`)).length === 3);
  ok('Partner kann eigenen Kunden anlegen', await tryq(`insert into docs values ('customers','neu','{"firma":"N","partner":"p1@x.de"}')`));
  ok('Partner kann keinen Kunden für andere anlegen', !(await tryq(`insert into docs values ('customers','x','{"firma":"X","partner":"p2@x.de"}')`)));
  ok('Partner kann fremden Kunden nicht übernehmen', (await q(`update docs set data='{"partner":"p1@x.de"}' where id='b' returning id`)).length === 0);
  ok('Partner kann eigenen Kunden nicht weggeben', !(await tryq(`update docs set data='{"firma":"A","partner":"p2@x.de"}' where id='a'`)));
  ok('Partner kann keine Provision anlegen', !(await tryq(`insert into docs values ('provisionen','fake','{"partner":"p1@x.de"}')`)));
  ok('Partner kann Provision nicht ändern', (await q(`update docs set data='{"partner":"p1@x.de","betrag":99999}' where id='r1' returning id`)).length === 0);
  ok('Partner kann Modell nicht ändern', (await q(`update docs set data='{"x":1}' where collection='config' returning id`)).length === 0);
  ok('Partner kann Vorlage nicht ändern', (await q(`update docs set data='{"x":1}' where collection='templates' returning id`)).length === 0);
  ok('Partner kann eigenen Kunden nicht löschen', (await q(`delete from docs where id='a' returning id`)).length === 0);
  ok('Partner kann Vorschlag anlegen', await tryq(`insert into docs values ('vorschlaege','v1','{"von":"p1@x.de","email":"neu@x.de"}')`));
  ok('Partner kann keinen Vorschlag im fremden Namen anlegen', !(await tryq(`insert into docs values ('vorschlaege','v2','{"von":"p2@x.de"}')`)));
  const t = await q(`select email from team`);
  ok('Partner sieht in der Team-Liste nur sich', t.length === 1 && t[0].email === 'p1@x.de');
  ok('Partner kann sich nicht zum Admin machen', !(await tryq(`update team set role='owner' where email='p1@x.de'`)) && !(await tryq(`update team set name='x' where email='p1@x.de' returning email`).then(()=>q(`update team set name='x' where email='p1@x.de' returning email`)).then(r=>r.length>0,()=>false)));
  const s = await q(`select email, ebene from my_structure() order by ebene`);
  ok('Struktur zeigt 2 Ebenen (' + s.map(r => r.email + ':' + r.ebene).join(',') + ')', s.length === 2 && s[0].email === 'p2@x.de' && s[0].ebene === 1 && s[1].email === 'p3@x.de' && s[1].ebene === 2);
  ok('Partner ist kein Admin', (await q(`select public.is_admin() a`))[0].a === false);
});
await as('weg@x.de', async () => {
  ok('Inaktiver Partner sieht nichts', (await q(`select id from docs`)).length === 0);
});
await as('fremd@x.de', async () => {
  ok('Fremdes Konto sieht nichts', (await q(`select id from docs`)).length === 0 && (await q(`select email from team`)).length === 0);
  ok('Fremdes Konto: Struktur leer', (await q(`select * from my_structure()`)).length === 0);
});
ok('Werber mit Struktur nicht löschbar', !(await tryq(`delete from team where email='p2@x.de'`)));
// Sprachnotizen-Speicher
await ex(`insert into storage.objects values ('sprachnotizen','a/n1.webm','00000000-0000-0000-0000-0000000000aa'),('sprachnotizen','b/n2.webm',null),('sprachnotizen','c/n3.webm',null),('sprachnotizen','a/eigen.webm','00000000-0000-0000-0000-0000000000p1')`.replace('0000000000p1','000000000011'));
await as('p1@x.de', async () => {
  const o = await q(`select name from storage.objects`);
  ok('Partner sieht nur Notizen eigener Kunden', o.length === 2 && o.every(x => x.name.startsWith('a/')));
  ok('Partner kann bei eigenem Kunden hochladen', await tryq(`insert into storage.objects values ('sprachnotizen','a/n4.webm','00000000-0000-0000-0000-000000000011')`));
  ok('Partner löscht eigene Notiz', (await q(`delete from storage.objects where name='a/eigen.webm' returning name`)).length === 1);
  ok('Partner löscht keine ONLION-Notiz', (await q(`delete from storage.objects where name='a/n1.webm' returning name`)).length === 0);
  ok('Partner kann nicht bei fremdem Kunden hochladen', !(await tryq(`insert into storage.objects values ('sprachnotizen','b/n5.webm')`)));
  ok('Partner kann fremde Notiz nicht löschen', (await q(`delete from storage.objects where name='b/n2.webm' returning name`)).length === 0);
});
await as('onlion-@outlook.de', async () => { ok('ONLION sieht alle Notizen', (await q(`select name from storage.objects`)).length === 4); });
await as('fremd@x.de', async () => { ok('Fremde sehen keine Notizen', (await q(`select name from storage.objects`)).length === 0); });
await as('weg@x.de', async () => { ok('Inaktiver Partner sieht keine Notizen', (await q(`select name from storage.objects`)).length === 0); });
// Zyklus-Schutz: sponsor kann nicht man selbst sein
ok('Partner kann nicht sein eigener Werber sein', !(await tryq(`update team set sponsor='p1@x.de' where email='p1@x.de'`)));
// SQL zweimal ausführbar
ok('vertrieb.sql mehrfach ausführbar', await db.exec(fs.readFileSync(R + 'vertrieb.sql', 'utf8')).then(() => true, e => (console.log(e.message), false)));
ok('sprachnotizen.sql mehrfach ausführbar', await db.exec(fs.readFileSync(R + 'sprachnotizen.sql', 'utf8')).then(() => true, e => (console.log(e.message), false)));
console.log(`\n${pass}/${pass + fail} Zugriffstests bestanden`);
process.exit(fail ? 1 : 0);
