-- Public Mağaza Planı bundles/history for the explicitly shared workspace.
-- Private design/customer tables, policies, functions and records are untouched.
-- No private or local bundle is automatically copied into these new tables.
BEGIN;

DO $$
DECLARE v_table text;
BEGIN
  IF pg_catalog.to_regprocedure('somass_private.validate_design_bundle(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('somass_private.shared_workspace_lock(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('somass_private.shared_mutation_slot(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply the private designs validator and shared customers migration before shared designs.';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['somass_shared_design_projects','somass_shared_design_revisions'] LOOP
    IF pg_catalog.to_regclass('public.'||v_table) IS NOT NULL
       AND pg_catalog.obj_description(pg_catalog.to_regclass('public.'||v_table),'pg_class')
         IS DISTINCT FROM 'somass-shared-designs/v1' THEN
      RAISE EXCEPTION 'Existing table public.% is not a recognized shared designs table; no changes applied',v_table;
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.somass_shared_design_projects (
  workspace_id uuid NOT NULL CHECK (workspace_id='5248c66f-a4bc-43df-906b-656960e5ce47'::uuid),
  project_key text NOT NULL CHECK (project_key ~ '^[a-zA-Z0-9_-]{1,80}$'),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  bundle jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(bundle)='object'
    AND pg_catalog.octet_length(bundle::text)<=8388608),
  payload_bytes bigint GENERATED ALWAYS AS (pg_catalog.octet_length(bundle::text)::bigint) STORED,
  mutation_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY(workspace_id,project_key)
);
COMMENT ON TABLE public.somass_shared_design_projects IS 'somass-shared-designs/v1';

CREATE TABLE IF NOT EXISTS public.somass_shared_design_revisions (
  workspace_id uuid NOT NULL CHECK (workspace_id='5248c66f-a4bc-43df-906b-656960e5ce47'::uuid),
  project_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  bundle jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(bundle)='object'
    AND pg_catalog.octet_length(bundle::text)<=8388608),
  payload_bytes bigint GENERATED ALWAYS AS (pg_catalog.octet_length(bundle::text)::bigint) STORED,
  mutation_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(workspace_id,project_key,revision),
  UNIQUE(workspace_id,project_key,mutation_id),
  FOREIGN KEY(workspace_id,project_key)
    REFERENCES public.somass_shared_design_projects(workspace_id,project_key) ON DELETE RESTRICT
);
COMMENT ON TABLE public.somass_shared_design_revisions IS 'somass-shared-designs/v1';

ALTER TABLE public.somass_shared_design_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.somass_shared_design_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS somass_shared_design_projects_read ON public.somass_shared_design_projects;
CREATE POLICY somass_shared_design_projects_read ON public.somass_shared_design_projects
  FOR SELECT TO anon,authenticated USING (workspace_id='5248c66f-a4bc-43df-906b-656960e5ce47'::uuid);
DROP POLICY IF EXISTS somass_shared_design_revisions_read ON public.somass_shared_design_revisions;
CREATE POLICY somass_shared_design_revisions_read ON public.somass_shared_design_revisions
  FOR SELECT TO anon,authenticated USING (workspace_id='5248c66f-a4bc-43df-906b-656960e5ce47'::uuid);
REVOKE ALL ON TABLE public.somass_shared_design_projects FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.somass_shared_design_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.somass_shared_design_projects TO anon,authenticated;
GRANT SELECT ON TABLE public.somass_shared_design_revisions TO anon,authenticated;

CREATE OR REPLACE FUNCTION somass_private.shared_design_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Only the owning checked save transaction may trim old shared snapshots.
  -- Browser roles have neither DELETE grants nor access to the private helper.
  IF TG_OP='DELETE'
     AND pg_catalog.current_setting('somass.shared_history_retention',true)='on'
     AND current_user=(SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class AS c WHERE c.oid=TG_RELID) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Shared design history cannot be edited or deleted outside server retention' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION somass_private.shared_design_history_immutable() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS somass_shared_design_history_immutable ON public.somass_shared_design_revisions;
CREATE TRIGGER somass_shared_design_history_immutable BEFORE UPDATE OR DELETE ON public.somass_shared_design_revisions
  FOR EACH ROW EXECUTE FUNCTION somass_private.shared_design_history_immutable();

CREATE OR REPLACE FUNCTION somass_private.shared_design_retain_history(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_history_count bigint;v_history_bytes numeric;v_current_bytes numeric;
  v_old public.somass_shared_design_revisions%ROWTYPE;v_prior_flag text;
BEGIN
  PERFORM somass_private.shared_workspace_lock(p_workspace_id);
  SELECT pg_catalog.count(*),COALESCE(pg_catalog.sum(r.payload_bytes),0)
    INTO v_history_count,v_history_bytes FROM public.somass_shared_design_revisions AS r
    WHERE r.workspace_id=p_workspace_id;
  SELECT COALESCE(pg_catalog.sum(p.payload_bytes),0) INTO v_current_bytes
    FROM public.somass_shared_design_projects AS p WHERE p.workspace_id=p_workspace_id;
  v_prior_flag:=pg_catalog.current_setting('somass.shared_history_retention',true);
  PERFORM pg_catalog.set_config('somass.shared_history_retention','on',true);
  WHILE v_history_count>200 OR v_history_bytes+v_current_bytes>104857600 LOOP
    -- Each project's newest three snapshots are protected. New projects with
    -- one/two snapshots keep all of them. Named versions INSIDE the current
    -- bundle are never removed or changed by this retention policy.
    SELECT r.* INTO v_old FROM public.somass_shared_design_revisions AS r
      JOIN (SELECT x.workspace_id,x.project_key,x.revision,
        pg_catalog.row_number() OVER(PARTITION BY x.workspace_id,x.project_key ORDER BY x.revision DESC) AS keep_rank
        FROM public.somass_shared_design_revisions AS x WHERE x.workspace_id=p_workspace_id) AS ranked
        ON ranked.workspace_id=r.workspace_id AND ranked.project_key=r.project_key AND ranked.revision=r.revision
      WHERE r.workspace_id=p_workspace_id AND ranked.keep_rank>3
      ORDER BY r.updated_at,r.project_key,r.revision LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='workspace-design-storage-limit',
        DETAIL='Shared shop storage cannot fit this save while retaining each current project and its three newest snapshots. Export a local backup; existing records remain unchanged.';
    END IF;
    DELETE FROM public.somass_shared_design_revisions AS r
      WHERE r.workspace_id=v_old.workspace_id AND r.project_key=v_old.project_key AND r.revision=v_old.revision;
    v_history_count:=v_history_count-1;v_history_bytes:=v_history_bytes-v_old.payload_bytes;
  END LOOP;
  PERFORM pg_catalog.set_config('somass.shared_history_retention',COALESCE(v_prior_flag,''),true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('somass.shared_history_retention',COALESCE(v_prior_flag,''),true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION somass_private.shared_design_retain_history(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.somass_shared_save_bundle(
  p_workspace_id uuid,p_project_key text,p_expected_revision bigint,p_mutation_id uuid,p_bundle jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current public.somass_shared_design_projects%ROWTYPE;
  v_prior public.somass_shared_design_revisions%ROWTYPE;v_stamp timestamptz;
BEGIN
  -- Same workspace lock also coordinates the joint customer/shop mutation quota.
  PERFORM somass_private.shared_workspace_lock(p_workspace_id);
  IF p_project_key IS NULL OR p_project_key !~ '^[a-zA-Z0-9_-]{1,80}$'
     OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990
     OR p_mutation_id IS NULL THEN
    RAISE EXCEPTION 'Invalid SOMASS save request' USING ERRCODE='22023';
  END IF;
  SELECT p.* INTO v_current FROM public.somass_shared_design_projects AS p
    WHERE p.workspace_id=p_workspace_id AND p.project_key=p_project_key FOR UPDATE;
  SELECT r.* INTO v_prior FROM public.somass_shared_design_revisions AS r
    WHERE r.workspace_id=p_workspace_id AND r.project_key=p_project_key AND r.mutation_id=p_mutation_id;
  IF FOUND THEN
    IF v_prior.bundle IS DISTINCT FROM p_bundle THEN
      RAISE EXCEPTION 'Mutation ID was already used for a different payload' USING ERRCODE='22023';
    END IF;
    IF v_current.revision<>v_prior.revision THEN
      RETURN pg_catalog.jsonb_build_object('status','conflict','revision',v_current.revision,
        'bundle',v_current.bundle,'updated_at',v_current.updated_at);
    END IF;
    RETURN pg_catalog.jsonb_build_object('status','saved','revision',v_current.revision,
      'bundle',v_current.bundle,'updated_at',v_current.updated_at);
  END IF;
  IF v_current.workspace_id IS NULL THEN
    IF p_expected_revision<>0 THEN
      RETURN pg_catalog.jsonb_build_object('status','conflict','revision',0,'bundle',NULL,'updated_at',NULL);
    END IF;
  ELSIF v_current.revision<>p_expected_revision THEN
    RETURN pg_catalog.jsonb_build_object('status','conflict','revision',v_current.revision,
      'bundle',v_current.bundle,'updated_at',v_current.updated_at);
  END IF;
  -- Reuse the source bundle validator, without its authenticated owner trigger.
  PERFORM somass_private.validate_design_bundle(p_bundle);
  PERFORM somass_private.shared_mutation_slot(p_workspace_id);
  v_stamp:=pg_catalog.clock_timestamp();
  IF v_current.workspace_id IS NULL THEN
    INSERT INTO public.somass_shared_design_projects(workspace_id,project_key,revision,bundle,mutation_id,updated_at)
      VALUES(p_workspace_id,p_project_key,1,p_bundle,p_mutation_id,v_stamp) RETURNING * INTO v_current;
  ELSE
    UPDATE public.somass_shared_design_projects AS p SET revision=p.revision+1,bundle=p_bundle,
      mutation_id=p_mutation_id,updated_at=v_stamp
      WHERE p.workspace_id=p_workspace_id AND p.project_key=p_project_key AND p.revision=p_expected_revision
      RETURNING p.* INTO v_current;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='conflict'; END IF;
  END IF;
  INSERT INTO public.somass_shared_design_revisions(workspace_id,project_key,revision,bundle,mutation_id,updated_at)
    VALUES(v_current.workspace_id,v_current.project_key,v_current.revision,v_current.bundle,
      v_current.mutation_id,v_current.updated_at);
  PERFORM somass_private.shared_design_retain_history(p_workspace_id);
  RETURN pg_catalog.jsonb_build_object('status','saved','revision',v_current.revision,
    'bundle',v_current.bundle,'updated_at',v_current.updated_at);
END;
$$;
REVOKE ALL ON FUNCTION public.somass_shared_save_bundle(uuid,text,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.somass_shared_save_bundle(uuid,text,bigint,uuid,jsonb) TO anon,authenticated;

COMMIT;
