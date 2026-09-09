CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(target_workspace_id uuid, new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM 1 FROM public.workspaces WHERE id = target_workspace_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace_id
      AND user_id = caller_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the workspace owner can transfer ownership';
  END IF;

  IF caller_id = new_owner_id THEN
    RAISE EXCEPTION 'You are already the workspace owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace_id
      AND user_id = new_owner_id
  ) THEN
    RAISE EXCEPTION 'The new owner must already be a workspace member';
  END IF;

  UPDATE public.workspace_members
  SET role = 'admin'
  WHERE workspace_id = target_workspace_id AND user_id = caller_id;

  UPDATE public.workspace_members
  SET role = 'owner'
  WHERE workspace_id = target_workspace_id AND user_id = new_owner_id;
END;
$$;