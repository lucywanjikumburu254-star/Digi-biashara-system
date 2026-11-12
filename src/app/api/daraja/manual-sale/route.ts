import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const body = await request.json();
    const businessId = String(body.business_id ?? "");
    const branchId = String(body.branch_id ?? "");
    const reference = String(body.reference ?? "").trim().toUpperCase();
    if (!businessId || !branchId) return NextResponse.json({ error: "Business and branch are required." }, { status: 400 });
    if (!/^[A-Z0-9]{6,20}$/.test(reference)) return NextResponse.json({ error: "Enter a valid M-Pesa transaction code (6–20 letters or numbers)." }, { status: 400 });

    const { data: memberships, error: membershipError } = await session.from("business_memberships")
      .select("role,branch_id,permissions").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active");
    if (membershipError || !memberships?.length) return NextResponse.json({ error: "An active business membership is required." }, { status: 403 });
    const allowed = memberships.some((m: any) => m.role === "owner" || (m.role === "employee" && m.branch_id === branchId && m.permissions?.sales === true));
    if (!allowed) return NextResponse.json({ error: "You do not have permission to record sales for this branch." }, { status: 403 });

    const { data: saleId, error: saleError } = await session.rpc("record_sale", {
      p_business_id: businessId,
      p_branch_id: branchId,
      p_items: body.items,
      p_customer_id: body.customer_id || null,
      p_payment_method: "mpesa",
      p_discount: Number(body.discount || 0),
      p_tax: Number(body.tax || 0),
      p_amount_paid: null,
      p_notes: [String(body.notes ?? "").trim(), "Manual " + String(body.account_type ?? "M-Pesa") + " payment reference: " + reference].filter(Boolean).join(" · "),
    });
    if (saleError || !saleId) throw new Error(saleError?.message || "Unable to save the M-Pesa sale.");

    const admin = createAdminClient();
    const { error: updateError } = await admin.from("sales").update({ mpesa_transaction_code: reference })
      .eq("id", saleId).eq("business_id", businessId);
    if (updateError) throw updateError;

    await admin.from("audit_logs").insert({
      actor_user_id: user.id, business_id: businessId, event_type: "sale.mpesa_manual_reference_added",
      entity_type: "sale", entity_id: saleId,
      details: { account_type: String(body.account_type ?? "mpesa"), reference },
    });

    return NextResponse.json({ ok: true, sale_id: saleId, message: "Manual M-Pesa payment recorded." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the manual M-Pesa sale." }, { status: 400 });
  }
}
