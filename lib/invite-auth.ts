import "server-only";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace";

export type InviteAuthMode = "login" | "register";
export type InviteInvalidReason = "not-found" | "expired" | "accepted" | "revoked";

export interface InviteContext {
  id: string;
  email: string;
  role: "member" | "admin";
  authMode: InviteAuthMode;
  workspaceId: string;
  workspaceName: string;
}

export type InviteContextResult =
  | { ok: true; invite: InviteContext }
  | { ok: false; reason: InviteInvalidReason };

export function inviteAuthPath(invite: Pick<InviteContext, "id" | "authMode">) {
  return `/${invite.authMode}?invite=${encodeURIComponent(invite.id)}`;
}

export function safeInternalPath(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const serviceClient = await createServiceClient();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }

  return null;
}

export async function getInviteContext(inviteId: string): Promise<InviteContextResult> {
  const serviceClient = await createServiceClient();
  const { data: invite } = await serviceClient
    .from("workspace_invites")
    .select("id, workspace_id, email, role, status, expires_at, auth_mode")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite) return { ok: false, reason: "not-found" };
  if (invite.status === "accepted") return { ok: false, reason: "accepted" };
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const authUser = await findAuthUserByEmail(invite.email);
  const currentMode: InviteAuthMode = authUser ? "login" : "register";

  if (currentMode !== invite.auth_mode) {
    await serviceClient
      .from("workspace_invites")
      .update({ auth_mode: currentMode })
      .eq("id", invite.id)
      .eq("status", "pending");
  }

  const { data: workspace } = await serviceClient
    .from("workspaces")
    .select("name")
    .eq("id", invite.workspace_id)
    .single();

  return {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role as "member" | "admin",
      authMode: currentMode,
      workspaceId: invite.workspace_id,
      workspaceName: workspace?.name ?? "Workspace",
    },
  };
}

export async function completeInviteForUser(inviteId: string, user: User) {
  if (!user.email) return { error: "Sua conta não possui um e-mail válido." };

  const context = await getInviteContext(inviteId);
  if (!context.ok) return { error: "Este convite não está mais disponível." };
  if (context.invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: "Use o endereço de e-mail que recebeu o convite.", code: "email_mismatch" as const };
  }

  const serviceClient = await createServiceClient();
  const { data: workspaceId, error } = await serviceClient.rpc("accept_workspace_invite", {
    target_invite_id: inviteId,
    target_user_id: user.id,
    target_email: user.email,
  });

  if (error || !workspaceId) return { error: error?.message ?? "Não foi possível aceitar o convite." };

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true as const, workspaceId };
}
