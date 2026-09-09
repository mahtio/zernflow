"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Mail,
  Crown,
  Shield,
  User,
  Trash2,
  X,
  Clock,
  Plus,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  inviteTeamMember,
  removeTeamMember,
  revokeInvite,
} from "@/lib/actions/team";
import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLocale } from "@/components/locale-provider";

interface MemberDetail {
  userId: string;
  role: string;
  joinedAt: string;
  email: string;
  name: string;
}

interface PendingInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invited_by: string;
  status: string;
  created_at: string;
  expires_at: string;
}

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  member: <User className="h-3 w-3" />,
};

const roleStyles: Record<string, string> = {
  owner: "bg-amber-100 text-amber-700",
  admin: "bg-blue-100 text-blue-700",
  member: "bg-gray-100 text-gray-600",
};

export function TeamView({
  workspaceId,
  workspaceName,
  currentUserId,
  currentUserRole,
  members: initialMembers,
  pendingInvites: initialInvites,
}: {
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  currentUserRole: string;
  members: MemberDetail[];
  pendingInvites: PendingInvite[];
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const roleLabel: Record<string, string> = pt
    ? { owner: "Proprietário", admin: "Administrador", member: "Membro" }
    : { owner: "Owner", admin: "Admin", member: "Member" };
  const isOwner = currentUserRole === "owner";

  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Remove member
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || inviting) return;

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    const result = await inviteTeamMember(workspaceId, inviteEmail, inviteRole);

    if (result.error) {
      setInviteError(result.error);
    } else if (result.invite) {
      setInvites((prev) => [result.invite as PendingInvite, ...prev]);
      setInviteEmail("");
      setInviteRole("member");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    }

    setInviting(false);
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId);

    const result = await removeTeamMember(workspaceId, userId);

    if (!result.error) {
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    }

    setRemovingId(null);
  }

  async function handleRevoke(inviteId: string) {
    setRevokingId(inviteId);

    const result = await revokeInvite(inviteId);

    if (!result.error) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    }

    setRevokingId(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{pt ? "Equipe" : "Team"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {pt ? `Gerencie membros e convites de ${workspaceName}` : `Manage members and invitations for ${workspaceName}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-8 px-8 py-8">
          {/* Members list */}
          <section>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                {pt ? "Membros" : "Members"} ({members.length})
              </h2>
            </div>

            <div className="mt-4 space-y-2">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {member.name}
                        </p>
                        {member.userId === currentUserId && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            ({pt ? "você" : "you"})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        roleStyles[member.role] ?? roleStyles.member
                      )}
                    >
                      {roleIcons[member.role] ?? roleIcons.member}
                      {roleLabel[member.role] ?? member.role}
                    </span>

                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {pt ? "Entrou em" : "Joined"}{" "}
                      {new Date(member.joinedAt).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>

                    {isOwner && member.userId !== currentUserId && (
                      <button
                        onClick={() =>
                          setConfirmRemove({ userId: member.userId, name: member.name })
                        }
                        disabled={removingId === member.userId}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        title={pt ? "Remover membro" : "Remove member"}
                      >
                        {removingId === member.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Invite section (owners only) */}
          {isOwner && (
            <>
              <hr className="border-border" />

              <section>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{pt ? "Convidar um membro" : "Invite a Member"}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pt ? "Envie um link de convite. O convite expira em 7 dias." : "Send an invitation link. The invite expires in 7 days."}
                </p>

                <form onSubmit={handleInvite} className="mt-4 flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setInviteError(null);
                    }}
                    placeholder="colleague@example.com"
                    required
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="member">{pt ? "Membro" : "Member"}</option>
                    <option value="admin">{pt ? "Administrador" : "Admin"}</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!inviteEmail.trim() || inviting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {inviting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {inviting ? (pt ? "Convidando..." : "Inviting...") : (pt ? "Convidar" : "Invite")}
                  </button>
                </form>

                {inviteError && (
                  <p className="mt-2 text-xs text-destructive">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="mt-2 text-xs text-green-600">
                    {pt ? "Convite enviado com sucesso!" : "Invite sent successfully!"}
                  </p>
                )}
              </section>
            </>
          )}

          {/* Pending invites */}
          {invites.length > 0 && (
            <>
              <hr className="border-border" />

              <section>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">
                    {pt ? "Convites pendentes" : "Pending Invites"} ({invites.length})
                  </h2>
                </div>

                <div className="mt-4 space-y-2">
                  {invites.map((invite) => {
                    const isExpired =
                      new Date(invite.expires_at) < new Date();
                    return (
                      <div
                        key={invite.id}
                        className={cn(
                          "flex items-center justify-between rounded-xl border border-border bg-card p-4",
                          isExpired && "opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {invite.email}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                                  roleStyles[invite.role] ?? roleStyles.member
                                )}
                              >
                                {roleIcons[invite.role] ?? roleIcons.member}
                                {roleLabel[invite.role] ?? invite.role}
                              </span>
                              {isExpired ? (
                                <span className="text-[10px] text-destructive">
                                  {pt ? "Expirado" : "Expired"}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {pt ? "Expira em" : "Expires"}{" "}
                                  {new Date(
                                    invite.expires_at
                                  ).toLocaleDateString(locale, {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isOwner && (
                          <button
                            onClick={() => setConfirmRevoke(invite.id)}
                            disabled={revokingId === invite.id}
                            className="shrink-0 ml-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            title={pt ? "Revogar convite" : "Revoke invite"}
                          >
                            {revokingId === invite.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!confirmRemove}
        title={pt ? "Remover membro" : "Remove member"}
        message={pt ? `Tem certeza de que deseja remover ${confirmRemove?.name ?? "este membro"} do espaço de trabalho?` : `Are you sure you want to remove ${confirmRemove?.name ?? "this member"} from the workspace?`}
        confirmLabel={pt ? "Remover" : "Remove"}
        cancelLabel={pt ? "Cancelar" : "Cancel"}
        destructive
        onConfirm={() => {
          if (confirmRemove) handleRemove(confirmRemove.userId);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
      <ConfirmDialog
        open={!!confirmRevoke}
        title={pt ? "Revogar convite" : "Revoke invite"}
        message={pt ? "Tem certeza de que deseja revogar este convite?" : "Are you sure you want to revoke this invitation?"}
        confirmLabel={pt ? "Revogar" : "Revoke"}
        cancelLabel={pt ? "Cancelar" : "Cancel"}
        destructive
        onConfirm={() => {
          if (confirmRevoke) handleRevoke(confirmRevoke);
          setConfirmRevoke(null);
        }}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
