import { getWorkspace } from "@/lib/workspace";
import { SequencesView } from "./sequences-view";

export default async function SequencesPage() {
  const { workspace, supabase } = await getWorkspace();
  const { data: sequences } = await supabase.from("sequences").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false });
  const sequenceIds = (sequences ?? []).map((sequence) => sequence.id);
  let enrollmentCounts: Record<string, number> = {};

  if (sequenceIds.length > 0) {
    const { data: counts } = await supabase.from("sequence_enrollments").select("sequence_id").in("sequence_id", sequenceIds).eq("status", "active");
    if (counts) enrollmentCounts = counts.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.sequence_id]: (acc[row.sequence_id] || 0) + 1 }), {});
  }

  return <SequencesView sequences={sequences ?? []} enrollmentCounts={enrollmentCounts} />;
}
