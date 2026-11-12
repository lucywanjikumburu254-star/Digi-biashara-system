import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  try {
    const { businessId } = await params;
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { data: role, error: roleError } = await session.from("platform_roles").select("role").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (roleError) throw roleError;
    if (role?.role !== "super_admin") return NextResponse.json({ error: "Only a platform administrator can edit registered businesses." }, { status: 403 });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const categoryId = String(body.category_id ?? "");
    const location = String(body.location ?? "").trim();
    const phoneRaw = String(body.phone ?? "").trim();
    if (!name || !categoryId) return NextResponse.json({ error: "Business name and category are required." }, { status: 400 });
    if (phoneRaw && !/^(?:\\+?254|0)?[17]\\d{8}$/.test(phoneRaw.replace(/[\\s-]/g, ""))) {
      return NextResponse.json({ error: "Enter a valid Kenyan business phone number." }, { status: 400 });
    }
    const phone = phoneRaw ? (phoneRaw.replace(/[\\s-]/g, "").startsWith("0") ? "254" + phoneRaw.replace(/[\\s-]/g, "").slice(1) : phoneRaw.replace(/[\\s-]/g, "").replace(/^\\+/, "")) : null;
    const admin = createAdminClient();
    const { error } = await admin.from("businesses").update({ name, category_id: categoryId, location: location || null, phone }).eq("id", businessId);
    if (error) throw error;
    return NextResponse.json({ ok: true, message: "Business details updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update business." }, { status: 400 });
  }
}
