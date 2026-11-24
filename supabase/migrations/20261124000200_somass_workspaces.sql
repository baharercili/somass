-- Email-free SOMASS workspaces. Requires 20261124_somass_designs.sql first.
-- Supabase anonymous Auth users use the authenticated database role, not anon.
-- A workspace is recoverable with its 32-byte private capability key.
begin;

do $$
declare table_name text;
begin
  if pg_catalog.to_regclass('public.somass_design_projects') is null
     or pg_catalog.to_regclass('public.somass_design_revisions') is null
     or pg_catalog.obj_description('public.somass_design_projects'::regclass, 'pg_class')
        is distinct from 'somass-cloud-designs/v1' then
    raise exception 'Install the recognized SOMASS design schema before workspaces';
  end if;
  foreach table_name in array array['workspaces', 'workspace_members'] loop
    if pg_catalog.to_regclass('somass_private.' || table_name) is not null
       and pg_catalog.obj_description(pg_catalog.to_regclass('somass_private.' || table_name), 'pg_class')
           is distinct from 'somass-cloud-workspaces/v1' then
      raise exception 'Existing private table % is not a recognized SOMASS workspace table', table_name;
    end if;
  end loop;
end;
$$;

create table if not exists somass_private.workspaces (
  workspace_id uuid primary key,
  capability_hash bytea not null unique check(pg_catalog.octet_length(capability_hash) = 32),
  -- RESTRICT protects designs/history from cleanup of their original anonymous user.
  owner_id uuid not null references auth.users(id) on delete restrict,
  project_key text not null default 'somass-showroom' check(project_key = 'somass-showroom'),
  -- Different keys created by one user must never alias the same saved project.
  storage_project_key text not null unique check(storage_project_key = 'somass-ws-' || workspace_id::text),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
comment on table somass_private.workspaces is 'somass-cloud-workspaces/v1';

create table if not exists somass_private.workspace_members (
  workspace_id uuid not null references somass_private.workspaces(workspace_id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(workspace_id, member_id)
);
comment on table somass_private.workspace_members is 'somass-cloud-workspaces/v1';
alter table somass_private.workspaces enable row level security;
alter table somass_private.workspace_members enable row level security;
revoke all on somass_private.workspaces, somass_private.workspace_members from public, anon, authenticated;

-- This helper has no external grant. Callers reach it only through key-checked APIs.
create or replace function somass_private.resolve_workspace(p_workspace_key text)
returns somass_private.workspaces
language plpgsql security definer set search_path = '' as $$
declare
  member_uid uuid := auth.uid();
  key_hash bytea;
  new_id uuid;
  workspace somass_private.workspaces%rowtype;
begin
  if member_uid is null then
    raise exception 'A Supabase Auth session is required' using errcode = '42501';
  end if;
  if p_workspace_key is null or p_workspace_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid workspace key' using errcode = '22023';
  end if;
  key_hash := pg_catalog.sha256(pg_catalog.decode(p_workspace_key, 'hex'));
  new_id := pg_catalog.gen_random_uuid();
  insert into somass_private.workspaces(workspace_id,capability_hash,owner_id,storage_project_key)
    values(new_id,key_hash,member_uid,'somass-ws-' || new_id::text)
    on conflict(capability_hash) do nothing;
  select * into strict workspace from somass_private.workspaces
    where capability_hash=key_hash;
  insert into somass_private.workspace_members(workspace_id,member_id)
    values(workspace.workspace_id,member_uid) on conflict do nothing;
  return workspace;
end;
$$;
revoke all on function somass_private.resolve_workspace(text) from public, anon, authenticated;

-- Existing direct Data API rules remain owner-only. Only capability-scoped
-- private helpers can reach a different owner's row; this trigger also requires
-- that this exact workspace has registered the caller after key validation.
create or replace function somass_private.guard_design_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (
    new.owner_id is distinct from auth.uid() and not exists(
      select 1 from somass_private.workspaces as w
      join somass_private.workspace_members as m on m.workspace_id=w.workspace_id
      where w.owner_id=new.owner_id and w.storage_project_key=new.project_key
        and m.member_id=auth.uid()
    )
  ) then
    raise exception 'A signed-in owner or verified workspace member is required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'Initial revision must be 1' using errcode = '22023';
    end if;
  elsif new.owner_id is distinct from old.owner_id or new.project_key is distinct from old.project_key
        or new.revision <> old.revision+1 then
    raise exception 'Owner and project are immutable; revision must advance by one' using errcode = '22023';
  end if;
  perform somass_private.validate_design_bundle(new.bundle);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function somass_private.guard_design_write() from public, anon, authenticated;

create or replace function somass_private.read_workspace(p_workspace_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace somass_private.workspaces%rowtype;
        current_row public.somass_design_projects%rowtype;
begin
  workspace := somass_private.resolve_workspace(p_workspace_key);
  select * into current_row from public.somass_design_projects
    where owner_id=workspace.owner_id and project_key=workspace.storage_project_key;
  return pg_catalog.jsonb_build_object(
    'workspace_id',workspace.workspace_id,'revision',coalesce(current_row.revision,0),
    'bundle',current_row.bundle,'updated_at',current_row.updated_at);
end;
$$;
revoke all on function somass_private.read_workspace(text) from public, anon, authenticated;

create or replace function somass_private.save_workspace(
  p_workspace_key text,p_expected_revision bigint,p_mutation_id uuid,p_bundle jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace somass_private.workspaces%rowtype;
        current_row public.somass_design_projects%rowtype;
        prior_row public.somass_design_revisions%rowtype;
begin
  workspace := somass_private.resolve_workspace(p_workspace_key);
  if p_expected_revision is null or p_expected_revision<0 or p_mutation_id is null then
    raise exception 'Invalid SOMASS workspace save request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(workspace.workspace_id::text,0));
  select * into current_row from public.somass_design_projects
    where owner_id=workspace.owner_id and project_key=workspace.storage_project_key for update;
  select * into prior_row from public.somass_design_revisions
    where owner_id=workspace.owner_id and project_key=workspace.storage_project_key and mutation_id=p_mutation_id;
  if found then
    if prior_row.bundle is distinct from p_bundle then
      raise exception 'Mutation ID was already used for a different payload' using errcode = '22023';
    end if;
    if current_row.revision<>prior_row.revision then
      return pg_catalog.jsonb_build_object('status','conflict','workspace_id',workspace.workspace_id,
        'revision',current_row.revision,'bundle',current_row.bundle,'updated_at',current_row.updated_at);
    end if;
    return pg_catalog.jsonb_build_object('status','saved','workspace_id',workspace.workspace_id,
      'revision',current_row.revision,'bundle',current_row.bundle,'updated_at',current_row.updated_at);
  end if;
  if current_row.owner_id is null then
    if p_expected_revision<>0 then
      return pg_catalog.jsonb_build_object('status','conflict','workspace_id',workspace.workspace_id,
        'revision',0,'bundle',null,'updated_at',null);
    end if;
    insert into public.somass_design_projects(owner_id,project_key,revision,bundle,mutation_id)
      values(workspace.owner_id,workspace.storage_project_key,1,p_bundle,p_mutation_id)
      returning * into current_row;
  else
    if current_row.revision<>p_expected_revision then
      return pg_catalog.jsonb_build_object('status','conflict','workspace_id',workspace.workspace_id,
        'revision',current_row.revision,'bundle',current_row.bundle,'updated_at',current_row.updated_at);
    end if;
    update public.somass_design_projects set revision=revision+1,bundle=p_bundle,mutation_id=p_mutation_id
      where owner_id=workspace.owner_id and project_key=workspace.storage_project_key and revision=p_expected_revision
      returning * into current_row;
  end if;
  return pg_catalog.jsonb_build_object('status','saved','workspace_id',workspace.workspace_id,
    'revision',current_row.revision,'bundle',current_row.bundle,'updated_at',current_row.updated_at);
end;
$$;
revoke all on function somass_private.save_workspace(text,bigint,uuid,jsonb) from public, anon, authenticated;

-- Only the minimal two key-checked private functions are callable by the public
-- invoker wrappers. somass_private must NOT be added to exposed API schemas.
grant usage on schema somass_private to authenticated;
grant execute on function somass_private.read_workspace(text) to authenticated;
grant execute on function somass_private.save_workspace(text,bigint,uuid,jsonb) to authenticated;

create or replace function public.somass_workspace_read(p_workspace_key text)
returns jsonb language sql security invoker set search_path = '' as $$
  select somass_private.read_workspace(p_workspace_key);
$$;
create or replace function public.somass_workspace_save(
  p_workspace_key text,p_expected_revision bigint,p_mutation_id uuid,p_bundle jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select somass_private.save_workspace(p_workspace_key,p_expected_revision,p_mutation_id,p_bundle);
$$;
revoke all on function public.somass_workspace_read(text) from public, anon;
revoke all on function public.somass_workspace_save(text,bigint,uuid,jsonb) from public, anon;
grant execute on function public.somass_workspace_read(text) to authenticated;
grant execute on function public.somass_workspace_save(text,bigint,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
