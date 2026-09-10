import { NextResponse } from "next/server";
import { completeInviteForUser, safeInternalPath } from "@/lib/invite-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteId = searchParams.get("invite");
  const next = safeInternalPath(searchParams.get("next"));

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  if (inviteId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/login?invite=${encodeURIComponent(inviteId)}&error=auth`);

    const result = await completeInviteForUser(inviteId, user);
    if (result.ok) return NextResponse.redirect(`${origin}/dashboard`);
    if (result.code === "email_mismatch") {
      return NextResponse.redirect(`${origin}/invite/${encodeURIComponent(inviteId)}`);
    }
    return NextResponse.redirect(`${origin}/invite/${encodeURIComponent(inviteId)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
