import { getWorkspace } from "@/lib/workspace";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { workspace, supabase } = await getWorkspace();

  const [contactsRes, tagsRes, customFieldDefinitionsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, contact_tags(tag_id, tags(*)), contact_custom_fields(field_id, value)")
      .eq("workspace_id", workspace.id)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("tags")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase
      .from("custom_field_definitions")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("name"),
  ]);

  return (
    <ContactsView
      contacts={contactsRes.data ?? []}
      tags={tagsRes.data ?? []}
      customFieldDefinitions={customFieldDefinitionsRes.data ?? []}
      workspaceId={workspace.id}
    />
  );
}
