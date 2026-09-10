export type InviteAuthMode = "login" | "register";

export function inviteAuthPath(invite: { id: string; authMode: InviteAuthMode }) {
  return `/${invite.authMode}?invite=${encodeURIComponent(invite.id)}`;
}

export function safeInternalPath(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
