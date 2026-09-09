import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const mediaId = request.nextUrl.searchParams.get("mediaId");
  if (!conversationId || !mediaId || !/^[A-Za-z0-9._-]+$/.test(mediaId)) {
    return NextResponse.json({ error: "Invalid media request" }, { status: 400 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("workspace_id")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  try {
    const mediaResponse = await fetch(
      `https://zernio.com/api/v1/whatsapp/media/${encodeURIComponent(mediaId)}`,
      {
        headers: { Authorization: `Bearer ${workspace.late_api_key_encrypted}` },
        cache: "no-store",
      }
    );

    if (!mediaResponse.ok || !mediaResponse.body) {
      return NextResponse.json(
        { error: "Attachment is unavailable or expired" },
        { status: mediaResponse.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", mediaResponse.headers.get("content-type") ?? "application/octet-stream");
    headers.set("Cache-Control", "private, max-age=300");
    const disposition = mediaResponse.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new NextResponse(mediaResponse.body, { headers });
  } catch (error) {
    console.error("Failed to fetch Zernio media:", error);
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
  }
}
