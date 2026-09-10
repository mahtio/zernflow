import { getWorkspace } from "@/lib/workspace";
import { getWorkspaceCredentials } from "@/lib/workspace-credentials";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const { workspace, role } = await getWorkspace();
  const credentials = await getWorkspaceCredentials(workspace.id);

  return (
    <SettingsView
      workspace={{
        id: workspace.id,
        name: workspace.name,
        hasApiKey: !!credentials?.late_api_key_encrypted,
        hasAiKey: !!credentials?.ai_api_key,
        globalKeywords: (workspace.global_keywords as string[]) ?? [],
      }}
      role={role}
    />
  );
}
