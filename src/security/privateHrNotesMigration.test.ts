import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

let db: PGlite;
const owner = '00000000-0000-0000-0000-000000000001';
const brent = '00000000-0000-0000-0000-000000000003';
const trent = '00000000-0000-0000-0000-000000000004';
const other = '00000000-0000-0000-0000-000000000002';
async function session(uid: string, role = 'admin') {
  await db.exec('reset role');
  await db.query("select set_config('app.uid',$1,false),set_config('app.role',$2,false)",[uid,role]);
  await db.exec('set role authenticated');
}
beforeAll(async () => {
  const windowStub = globalThis.window;
  Reflect.deleteProperty(globalThis,'window');
  try { db = await PGlite.create(); } finally { globalThis.window = windowStub; }
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    insert into auth.users values ('${owner}','matthew.zinni@btwglobal.com'),('${other}','orlando.gomez@btwglobal.com'),('${brent}','brent.wynne@btwglobal.com'),('${trent}','trent.wynne@btwglobal.com');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function public.orbis_is_admin() returns boolean language sql as $$ select current_setting('app.role',true)='admin' $$;
    create function public.orbis_hr_staff_child_accessible(emp text) returns boolean language sql as $$
      select public.orbis_is_admin() or (current_setting('app.role',true)='supervisor' and emp='team') $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.employee_notes (id int primary key,employee_id text,note_type text,note_text text);
    grant select,insert,update,delete on public.employee_notes to authenticated;
    grant select on public.employee_notes to anon;
    alter table public.employee_notes enable row level security;
    create policy legacy_staff on public.employee_notes for all to authenticated
      using(public.orbis_hr_staff_child_accessible(employee_id)) with check(public.orbis_hr_staff_child_accessible(employee_id));
    -- Simulate a stray permissive policy: the private guard must still win.
    create policy stray on public.employee_notes for all to authenticated using(true) with check(true);
    insert into public.employee_notes values (1,'team','General','private meeting'),(2,'team','At-Risk Flag','shared flag'),(3,'outside','Impact Player Flag','other team');
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261014180000_private_hr_notes.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261014190000_shared_hr_notes_leadership.sql',import.meta.url),'utf8'));
},20000);
afterAll(async()=>{await db?.close();});
describe.sequential('private HR Notes database enforcement',()=>{
  it('lets Matthew read, create, edit and delete private notes',async()=>{
    await session(owner);
    expect((await db.query('select id from employee_notes order by id')).rows).toEqual([{id:1},{id:2},{id:3}]);
    await db.exec("insert into employee_notes values(4,'team','Coaching','private'); update employee_notes set note_text='edited' where id=4");
    expect((await db.query('delete from employee_notes where id=4 returning id')).rows).toEqual([{id:4}]);
  });
  it.each([brent, trent])('lets leadership account %s read, create and edit the same notes', async (uid) => {
    await session(uid);
    expect((await db.query('select id from employee_notes where id=1')).rows).toEqual([{id:1}]);
    expect((await db.query("update employee_notes set note_text='shared edit' where id=1 returning id")).rows).toEqual([{id:1}]);
    await db.exec("insert into employee_notes values(8,'team','General','leadership'); update employee_notes set note_text='leadership edited' where id=8");
    expect((await db.query('select note_text from employee_notes where id=8')).rows).toEqual([{note_text:'leadership edited'}]);
    await db.exec('delete from employee_notes where id=8');
    await expect(db.query('select * from hr_notes_access')).rejects.toThrow('permission denied');
    await session(uid,'user');
    expect((await db.query('select id from employee_notes where id=1')).rows).toEqual([]);
  });
  it('blocks every other admin from private reads, writes and ownership changes',async()=>{
    await session(other);
    expect((await db.query('select id from employee_notes order by id')).rows).toEqual([{id:2},{id:3}]);
    expect((await db.query("update employee_notes set note_type='At-Risk Flag' where id=1 returning id")).rows).toEqual([]);
    expect((await db.query('delete from employee_notes where id=1 returning id')).rows).toEqual([]);
    await expect(db.exec("insert into employee_notes values(5,'team','General','unauthorized')")).rejects.toThrow('row-level security');
    await expect(db.exec(`update hr_notes_owner set user_id='${other}'`)).rejects.toThrow('permission denied');
    await expect(db.query('select * from hr_notes_owner')).rejects.toThrow('permission denied');
  });
  it('preserves scoped operational flags for supervisors but hides HR notes',async()=>{
    await session(other,'supervisor');
    expect((await db.query('select id from employee_notes')).rows).toEqual([{id:2}]);
    await db.exec("insert into employee_notes values(6,'team','At-Risk Cleared','resolved'); delete from employee_notes where id=6");
    await expect(db.exec("insert into employee_notes values(7,'outside','At-Risk Flag','blocked')")).rejects.toThrow('row-level security');
  });
  it('denies employees, revoked owners and anonymous access',async()=>{
    await session(other,'user');
    expect((await db.query('select * from employee_notes')).rows).toEqual([]);
    await session(owner,'');
    expect((await db.query('select * from employee_notes')).rows).toEqual([]);
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from employee_notes')).rejects.toThrow('permission denied');
  });
  it('prevents private notes from being relabeled into shared flags, even by Matthew',async()=>{
    await session(owner);
    await expect(db.exec("update employee_notes set note_type='At-Risk Flag' where id=1")).rejects.toThrow('cannot be converted');
    await expect(db.exec("update employee_notes set note_type='General' where id=2")).rejects.toThrow('cannot be converted');
  });
  it('fails closed if no owner is configured',async()=>{
    await db.exec('reset role; delete from hr_notes_access');
    await session(owner);
    expect((await db.query('select * from employee_notes where id=1')).rows).toEqual([]);
  });
});
