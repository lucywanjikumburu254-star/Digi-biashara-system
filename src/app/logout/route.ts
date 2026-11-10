import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET requests must never mutate authentication state. Next.js may prefetch
// links, so signing out on GET can unexpectedly terminate a user's session.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
