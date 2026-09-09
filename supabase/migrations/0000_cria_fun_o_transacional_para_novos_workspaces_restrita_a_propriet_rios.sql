CREATE OR REPLACE FUNCTION public.create_workspace(workspace_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  trimmed_name text := btrim(workspace_name);
  new_workspace_id uuid;
  new_slug text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trimmed_name = '' OR length(trimmed_name) > 100 THEN
    RAISE EXCEPTION 'Workspace name must be between 1 and 100 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = caller_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only workspace owners can create workspaces';
  END IF;

  new_workspace_id := gen_random_uuid();
  new_slug := trim(both '-' from lower(regexp_replace(trimmed_name, '[^a-zA-Z0-9]+', '-', 'g')));
  IF new_slug = '' THEN
    new_slug := 'workspace';
  END IF;
  new_slug := new_slug || '-' || substr(new_workspace_id::text, 1, 8);

  INSERT INTO public.workspaces (id, name, slug)
  VALUES (new_workspace_id, trimmed_name, new_slug);

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, caller_id, 'owner');

  RETURN new_workspace_id;
END;
$$;