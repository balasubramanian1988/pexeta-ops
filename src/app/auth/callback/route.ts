// Google OAuth returns here with a code; exchange it for a session.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
    console.error("[pexeta-ops] sign-in code exchange failed:", error.message);
  }
  if (!code) console.error("[pexeta-ops] /auth/callback reached without a code:", request.url);
  return NextResponse.redirect(`${origin}/login?error=1`);
}
