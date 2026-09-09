import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { ContactDetailView } from "./contact-detail-view";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const { workspace, supabase } = await getWorkspace();

  const [contactRes, channelsRes, conversationsRes, customFieldsRes] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*, contact_tags(tag_id, tags(*))")
        .eq("id", contactId)
        .eq("workspace_id", workspace.id)
        .single(),
      supabase
        .from("contact_channels")
        .select("*, channels(platform, username, display_name)")
        .eq("contact_id", contactId),
      supabase
        .from("conversations")
        .select("id, platform, status, last_message_at, last_message_preview")
        .eq("contact_id", contactId)
        .eq("workspace_id", workspace.id)
        .order("last_message_at", { ascending: false }),
      supabase
        .from("contact_custom_fields")
        .select("value, custom_field_definitions(name, slug, type)")
        .eq("contact_id", contactId),
    ]);

  if (!contactRes.data) notFound();

  const contact = contactRes.data;
  const channels = channelsRes.data ?? [];
  const conversations = conversationsRes.data ?? [];
  const customFields = customFieldsRes.data ?? [];
  const tags = contact.contact_tags
    .map((ct: { tags: unknown }) => ct.tags)
    .filter(Boolean) as { id: string; name: string; color: string | null }[];

  return (
    <ContactDetailView
      contact={contact}
      tags={tags}
      channels={channels}
      conversations={conversations}
      customFields={customFields}
    />
  );
}
