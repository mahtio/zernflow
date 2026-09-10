"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { completeInviteForUser, findAuthUserByEmail, getInviteContext } from "@/lib/invite-auth";
import { getWorkspace } from "@/lib/workspace";

export async function inviteTeamMember(
  workspaceId: string,
  email: string,
  role: string
) {
  const { workspace, user, supabase } = await getWorkspace();

  if (workspace.id !== workspaceId) {
    return { error: "Workspace mismatch" };
  }

  // Only owners and admins can invite members
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only workspace owners and admins can invite members" };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return { error: "A valid email address is required" };
  }

  const validRoles = ["member", "admin"];
  if (!validRoles.includes(role)) {
    return { error: "Invalid role. Must be member or admin." };
  }

  const serviceClient = await createServiceClient();
  const existingUser = await findAuthUserByEmail(trimmedEmail);

  if (existingUser) {
    const { data: existingMembership } = await serviceClient
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingMembership) {
      return { error: "This user is already a workspace member" };
    }
  }

  const { data: existingInvite } = await supabase
    .from("workspace_invites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", trimmedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    return { error: "An invite for this email is already pending" };
  }

  const { data: invite, error: insertError } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: trimmedEmail,
      role,
      invited_by: user.id,
      status: "pending",
      auth_mode: existingUser ? "login" : "register",
    })
    .select("*")
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  return { ok: true, invite };
}

export async function removeTeamMember(
  workspaceId: string,
  userId: string
) {
  const { workspace, user, supabase } = await getWorkspace();

  if (workspace.id !== workspaceId) {
    return { error: "Workspace mismatch" };
  }

  // Validate caller is owner
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "owner") {
    return { error: "Only workspace owners can remove members" };
  }

  // Can't remove yourself
  if (userId === user.id) {
    return { error: "You cannot remove yourself from the workspace" };
  }

  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  return { ok: true };
}

export async function acceptInvite(inviteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };
  return completeInviteForUser(inviteId, user);
}

export async function registerWithInvite(
  inviteId: string,
  password: string,
  fullName: string
) {
  const context = await getInviteContext(inviteId);
  if (!context.ok) return { error: "Este convite não é válido." };
  if (context.invite.authMode !== "register") {
    return { error: "Este e-mail já possui conta.", redirectTo: `/login?invite=${encodeURIComponent(inviteId)}` };
  }

  const name = fullName.trim();
  if (!name) return { error: "Informe seu nome." };
  if (password.length < 6) return { error: "A senha deve ter pelo menos 6 caracteres." };

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return { error: "Origem da solicitação inválida." };

  const supabase = await createClient();
  const emailRedirectTo = `${origin}/auth/callback?invite=${encodeURIComponent(inviteId)}`;
  const { data, error } = await supabase.auth.signUp({
    email: context.invite.email,
    password,
    options: { data: { full_name: name, invite_id: inviteId }, emailRedirectTo },
  });

  if (error) {
    const refreshed = await getInviteContext(inviteId);
    if (refreshed.ok && refreshed.invite.authMode === "login") {
      return { error: "Este e-mail já possui conta.", redirectTo: `/login?invite=${encodeURIComponent(inviteId)}` };
    }
    return { error: error.message };
  }

  if (!data.session) {
    return { ok: true, confirmationRequired: true, email: context.invite.email };
  }

  return { ok: true, confirmationRequired: false };
}

export async function revokeInvite(inviteId: string) {
  const { user, supabase } = await getWorkspace();

  // Fetch the invite to get workspace_id
  const { data: invite, error: fetchError } = await supabase
    .from("workspace_invites")
    .select("workspace_id")
    .eq("id", inviteId)
    .single();

  if (fetchError || !invite) {
    return { error: "Invite not found" };
  }

  // Only owners and admins can revoke invites
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only workspace owners and admins can revoke invites" };
  }

  const { error: deleteError } = await supabase
    .from("workspace_invites")
    .delete()
    .eq("id", inviteId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  return { ok: true };
}

export async function transferWorkspaceOwnership(
  workspaceId: string,
  newOwnerId: string
) {
  const { workspace, supabase } = await getWorkspace();

  if (workspace.id !== workspaceId) {
    return { error: "Workspace mismatch" };
  }

  const { error } = await supabase.rpc("transfer_workspace_ownership", {
    target_workspace_id: workspaceId,
    new_owner_id: newOwnerId,
  });

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}
