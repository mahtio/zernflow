import { getWorkspace } from "@/lib/workspace";
import { notFound } from "next/navigation";
import { FlowCanvas } from "@/components/flow-builder/flow-canvas";

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  const { workspace, supabase } = await getWorkspace();

  const [{ data: flow }, { data: customFields }] = await Promise.all([
    supabase
      .from("flows")
      .select("*")
      .eq("id", flowId)
      .eq("workspace_id", workspace.id)
      .single(),
    supabase
      .from("custom_field_definitions")
      .select("id, name, slug")
      .eq("workspace_id", workspace.id)
      .order("name"),
  ]);

  if (!flow) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <FlowCanvas flow={flow} customFields={customFields ?? []} />
    </div>
  );
}
