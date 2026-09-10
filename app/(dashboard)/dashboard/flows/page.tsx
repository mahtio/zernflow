import { getWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";
import { FlowsView } from "./flows-view";

export default async function FlowsPage() {
  const { workspace, supabase } = await getWorkspace();
  const serviceClient = await createServiceClient();

  await serviceClient.rpc("purge_deleted_flows");

  const [{ data: flows }, { data: deletedFlows }, { count: channelCount }] = await Promise.all([
    supabase
      .from("flows")
      .select("id, name, description, status, updated_at, version, nodes, edges")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("flows")
      .select("id, name, deleted_at")
      .eq("workspace_id", workspace.id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("channels")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("is_active", true),
  ]);

  return <FlowsView flows={flows ?? []} deletedFlows={deletedFlows ?? []} channelCount={channelCount ?? 0} />;
}
