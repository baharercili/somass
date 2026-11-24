-- SOMASS authenticated cloud designs v1. Run as the project's database owner.
-- No existing application tables or rows are removed.
begin;

do $$
declare table_name text;
begin
  foreach table_name in array array['somass_design_projects', 'somass_design_revisions'] loop
    if pg_catalog.to_regclass('public.' || table_name) is not null
       and pg_catalog.obj_description(pg_catalog.to_regclass('public.' || table_name), 'pg_class')
           is distinct from 'somass-cloud-designs/v1' then
      raise exception 'Existing table public.% is not a recognized SOMASS v1 table; no changes applied', table_name;
    end if;
  end loop;
end;
$$;

create schema if not exists somass_private;
revoke all on schema somass_private from public, anon, authenticated;

create table if not exists public.somass_design_projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null check (project_key ~ '^[a-zA-Z0-9_-]{1,80}$'),
  revision bigint not null check (revision >= 1),
  bundle jsonb not null,
  mutation_id uuid not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (owner_id, project_key)
);
comment on table public.somass_design_projects is 'somass-cloud-designs/v1';

create table if not exists public.somass_design_revisions (
  owner_id uuid not null,
  project_key text not null,
  revision bigint not null check (revision >= 1),
  bundle jsonb not null,
  mutation_id uuid not null,
  updated_at timestamptz not null,
  primary key (owner_id, project_key, revision),
  unique (owner_id, project_key, mutation_id),
  foreign key (owner_id, project_key) references public.somass_design_projects(owner_id, project_key) on delete cascade
);
comment on table public.somass_design_revisions is 'somass-cloud-designs/v1';

alter table public.somass_design_projects enable row level security;
alter table public.somass_design_revisions enable row level security;

-- Trigger validation also protects direct authenticated Data API writes.
create or replace function somass_private.validate_design_bundle(p_bundle jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare entry jsonb; plan jsonb; ids text[] := array[]::text[]; entry_id text;
begin
  if p_bundle is null or pg_catalog.jsonb_typeof(p_bundle) <> 'object'
     or p_bundle->>'format' is distinct from 'somass-design-versions'
     or p_bundle->'schemaVersion' is distinct from '1'::jsonb
     or pg_catalog.jsonb_typeof(p_bundle->'versions') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_bundle->'activeId') is distinct from 'string' then
    raise exception 'Invalid SOMASS design bundle' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_bundle::text) > 8388608
     or pg_catalog.jsonb_array_length(p_bundle->'versions') not between 1 and 30 then
    raise exception 'SOMASS design bundle exceeds size or version limits' using errcode = '22023';
  end if;
  for entry in select value from pg_catalog.jsonb_array_elements(p_bundle->'versions') loop
    entry_id := entry->>'id'; plan := entry->'plan';
    if pg_catalog.jsonb_typeof(entry) <> 'object'
       or pg_catalog.jsonb_typeof(entry->'id') is distinct from 'string'
       or pg_catalog.char_length(entry_id) not between 1 and 160
       or entry_id = any(ids)
       or pg_catalog.jsonb_typeof(entry->'name') is distinct from 'string'
       or pg_catalog.char_length(pg_catalog.btrim(entry->>'name')) not between 1 and 80
       or pg_catalog.jsonb_typeof(plan) is distinct from 'object'
       or plan->'version' is distinct from '1'::jsonb then
      raise exception 'Invalid or duplicate SOMASS design version' using errcode = '22023';
    end if;
    ids := pg_catalog.array_append(ids, entry_id);
    if pg_catalog.octet_length(plan::text) > 2097152
       or pg_catalog.jsonb_typeof(plan->'walls') is distinct from 'array'
       or pg_catalog.jsonb_typeof(plan->'openings') is distinct from 'array'
       or pg_catalog.jsonb_typeof(plan->'objects') is distinct from 'array'
       or pg_catalog.jsonb_typeof(plan->'name') is distinct from 'string'
       or pg_catalog.jsonb_typeof(plan->'location') is distinct from 'string' then
      raise exception 'Invalid SOMASS plan or plan exceeds 2 MiB' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(plan->'walls') > 2000
       or pg_catalog.jsonb_array_length(plan->'openings') > 2000
       or pg_catalog.jsonb_array_length(plan->'objects') > 2000
       or pg_catalog.char_length(plan->>'name') > 80
       or pg_catalog.char_length(plan->>'location') > 160 then
      raise exception 'SOMASS plan exceeds supported limits' using errcode = '22023';
    end if;
  end loop;
  if not (p_bundle->>'activeId' = any(ids)) then
    raise exception 'Active SOMASS version is missing' using errcode = '22023';
  end if;
end;
$$;
revoke all on function somass_private.validate_design_bundle(jsonb) from public, anon, authenticated;

create or replace function somass_private.guard_design_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.owner_id is distinct from auth.uid() then
    raise exception 'A signed-in owner is required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'Initial revision must be 1' using errcode = '22023';
    end if;
  else
    if new.owner_id is distinct from old.owner_id or new.project_key is distinct from old.project_key
       or new.revision <> old.revision + 1 then
      raise exception 'Owner and project are immutable; revision must advance by one' using errcode = '22023';
    end if;
  end if;
  perform somass_private.validate_design_bundle(new.bundle);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function somass_private.guard_design_write() from public, anon, authenticated;

create or replace function somass_private.snapshot_design_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.somass_design_revisions(owner_id, project_key, revision, bundle, mutation_id, updated_at)
  values(new.owner_id, new.project_key, new.revision, new.bundle, new.mutation_id, new.updated_at);
  return new;
end;
$$;
revoke all on function somass_private.snapshot_design_write() from public, anon, authenticated;

create or replace trigger somass_guard_design_write before insert or update on public.somass_design_projects
for each row execute function somass_private.guard_design_write();
create or replace trigger somass_snapshot_design_write after insert or update on public.somass_design_projects
for each row execute function somass_private.snapshot_design_write();

-- Policies are owned by this migration; no other policies are removed.
do $$
begin
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='somass_design_projects' and policyname='somass_owner_select') then
    create policy somass_owner_select on public.somass_design_projects for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='somass_design_projects' and policyname='somass_owner_insert') then
    create policy somass_owner_insert on public.somass_design_projects for insert to authenticated
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='somass_design_projects' and policyname='somass_owner_update') then
    create policy somass_owner_update on public.somass_design_projects for update to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='somass_design_revisions' and policyname='somass_history_owner_select') then
    create policy somass_history_owner_select on public.somass_design_revisions for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
end;
$$;

revoke all on public.somass_design_projects from public, anon, authenticated;
revoke all on public.somass_design_revisions from public, anon, authenticated;
grant select, insert on public.somass_design_projects to authenticated;
grant update (revision, bundle, mutation_id) on public.somass_design_projects to authenticated;
grant select on public.somass_design_revisions to authenticated;

create or replace function public.somass_save_bundle(
  p_project_key text, p_expected_revision bigint, p_mutation_id uuid, p_bundle jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_uid uuid := auth.uid(); current_row public.somass_design_projects%rowtype;
        prior_row public.somass_design_revisions%rowtype;
begin
  if owner_uid is null then
    raise exception 'Sign in before saving a SOMASS design' using errcode = '42501';
  end if;
  if p_project_key is null or p_project_key !~ '^[a-zA-Z0-9_-]{1,80}$'
     or p_expected_revision is null or p_expected_revision < 0 or p_mutation_id is null then
    raise exception 'Invalid SOMASS save request' using errcode = '22023';
  end if;
  -- One owner/project lock covers the initial insert and every CAS update.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_uid::text || ':' || p_project_key, 0));
  select * into current_row from public.somass_design_projects
    where owner_id=owner_uid and project_key=p_project_key for update;
  select * into prior_row from public.somass_design_revisions
    where owner_id=owner_uid and project_key=p_project_key and mutation_id=p_mutation_id;
  if found then
    if prior_row.bundle is distinct from p_bundle then
      raise exception 'Mutation ID was already used for a different payload' using errcode = '22023';
    end if;
    if current_row.revision <> prior_row.revision then
      return pg_catalog.jsonb_build_object('status','conflict','revision',current_row.revision,
        'bundle',current_row.bundle,'updated_at',current_row.updated_at);
    end if;
    return pg_catalog.jsonb_build_object('status','saved','revision',current_row.revision,
      'bundle',current_row.bundle,'updated_at',current_row.updated_at);
  end if;
  if current_row.owner_id is null then
    if p_expected_revision <> 0 then
      return pg_catalog.jsonb_build_object('status','conflict','revision',0,'bundle',null,'updated_at',null);
    end if;
    insert into public.somass_design_projects(owner_id,project_key,revision,bundle,mutation_id)
      values(owner_uid,p_project_key,1,p_bundle,p_mutation_id) returning * into current_row;
  else
    if current_row.revision <> p_expected_revision then
      return pg_catalog.jsonb_build_object('status','conflict','revision',current_row.revision,
        'bundle',current_row.bundle,'updated_at',current_row.updated_at);
    end if;
    update public.somass_design_projects set revision=revision+1,bundle=p_bundle,mutation_id=p_mutation_id
      where owner_id=owner_uid and project_key=p_project_key and revision=p_expected_revision
      returning * into current_row;
  end if;
  return pg_catalog.jsonb_build_object('status','saved','revision',current_row.revision,
    'bundle',current_row.bundle,'updated_at',current_row.updated_at);
end;
$$;
revoke all on function public.somass_save_bundle(text,bigint,uuid,jsonb) from public, anon;
grant execute on function public.somass_save_bundle(text,bigint,uuid,jsonb) to authenticated;

commit;
