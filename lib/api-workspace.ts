import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { WORKSPACE_COOKIE } from "@/lib/workspace";

export async function getApiWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const selectedId = (await cookies()).get(WORKSPACE_COOKIE)?.value;

  if (selectedId) {
    const { data: selectedMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", selectedId)
      .maybeSingle();

    if (selectedMembership) return selectedMembership.workspace_id;
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  return membership?.workspace_id ?? null;
}
