import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { updateWorkspaceCredentials } from "@/lib/workspace-credentials";
import {
  ensureWebhookRegistered,
  getOrCreateWorkspaceWebhookSecret,
} from "@/lib/zernio-webhook";
import { backfillInboxConversations } from "@/lib/inbox-sync";
import { isSupportedPlatform } from "@/lib/platforms";

/**
 * POST /api/v1/channels/test-key
 *
 * Tests a Zernio API key, saves it to the workspace, and auto-syncs channels.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { apiKey, workspaceId } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json(
      { error: "apiKey is required" },
      { status: 400 }
    );
  }

  // Validate the key by listing accounts
  let accounts: Array<{ _id?: string; platform?: string; username?: string; displayName?: string; profilePicture?: string }>;
  try {
    const zernio = createZernioClient(apiKey.trim());
    const res = await zernio.accounts.listAccounts();
    accounts = (res.data?.accounts ?? []) as typeof accounts;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid API key or connection error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // If workspaceId provided, save the key and sync channels
  if (workspaceId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();
    if (membership?.role !== "owner") {
      return NextResponse.json(
        { error: "Only the workspace owner can update integration keys" },
        { status: 403 }
      );
    }

    try {
      await updateWorkspaceCredentials(workspaceId, {
        late_api_key_encrypted: apiKey.trim(),
      });
    } catch (saveError) {
      return NextResponse.json(
        {
          error: `Key valid but failed to save: ${
            saveError instanceof Error ? saveError.message : "Unknown error"
          }`,
        },
        { status: 500 }
      );
    }

    const serviceClient = await createServiceClient();

    // Register (or refresh) this deployment's webhook in Zernio so inbound
    // messages/comments reach the Inbox. Best-effort: a failure here must not
    // block saving the key or syncing channels.
    try {
      const secret = await getOrCreateWorkspaceWebhookSecret(serviceClient, workspaceId);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const zernio = createZernioClient(apiKey.trim());
      await ensureWebhookRegistered(zernio, {
        appUrl,
        secret,
        events: ["message.received", "comment.received"],
      });
    } catch (err) {
      console.error("[test-key] webhook auto-registration failed:", err);
    }

    // Auto-sync channels
    const { data: existingChannels } = await supabase
      .from("channels")
      .select("*")
      .eq("workspace_id", workspaceId);

    const existingByLateId = new Map(
      (existingChannels ?? []).map((c) => [c.late_account_id, c])
    );

    for (const account of accounts) {
      if (!account._id) continue;
      if (existingByLateId.has(account._id)) continue;
      if (!isSupportedPlatform(account.platform)) continue;

      const { error: insertErr } = await serviceClient.from("channels").insert({
        workspace_id: workspaceId,
        platform: account.platform,
        late_account_id: account._id,
        username: account.username || null,
        display_name: account.displayName || account.username || null,
        profile_picture: account.profilePicture || null,
        is_active: true,
      });
      if (insertErr) {
        console.error("[test-key] channel insert failed:", insertErr);
      }
    }

    // Backfill conversations that predate webhook registration so a
    // first-time API-key setup fills the Inbox immediately (best-effort).
    try {
      const { data: activeChannels } = await serviceClient
        .from("channels")
        .select("id, late_account_id, platform")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true);

      await backfillInboxConversations({
        supabase: serviceClient,
        zernio: createZernioClient(apiKey.trim()),
        workspaceId,
        channels: activeChannels ?? [],
      });
    } catch (err) {
      console.error("[test-key] inbox backfill failed:", err);
    }
  }

  return NextResponse.json({ accounts });
}
