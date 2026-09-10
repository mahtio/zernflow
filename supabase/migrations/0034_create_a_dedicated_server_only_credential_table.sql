CREATE TABLE public.workspace_integration_credentials (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  zernio_api_key text,
  ai_api_key text,
  webhook_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);