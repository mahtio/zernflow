import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export async function getWorkspaceCredentials(workspaceId: string) {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("workspace_integration_credentials")
    .select("late_api_key_encrypted, ai_api_key, webhook_secret")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateWorkspaceCredentials(
  workspaceId: string,
  credentials: {
    late_api_key_encrypted?: string;
    ai_api_key?: string;
    webhook_secret?: string;
  }
) {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("workspace_integration_credentials").upsert(
    {
      workspace_id: workspaceId,
      ...credentials,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  );

  if (error) throw error;
}
