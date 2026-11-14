import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const requestedAccountType = body.account_type == null || body.account_type === "" ? null : String(body.account_type);
    if (requestedAccountType !== null && !["paybill", "till", "pochi"].includes(requestedAccountType)) {
      return NextResponse.json({ error: "Invalid M-Pesa account type." }, { status: 400 });
    }
    const accountType = requestedAccountType;
    if (!/^[A-Z0-9]{6,20}$/.test(reference)) return NextResponse.json({ error: "Enter a valid M-Pesa transaction code (6–20 letters or numbers)." }, { status: 400 });

    const { data: memberships, error: membershipError } = await session.from("business_memberships")
      .select("role,branch_id,permissions").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active");
    if (membershipError || !memberships?.length) return NextResponse.json({ error: "An active business membership is required." }, { status: 403 });
    const allowed = memberships.some((m: any) => m.role === "owner" || (m.role === "employee" && m.branch_id === branchId && m.permissions?.sales === true));
    const { data: businessAccess, error: accessError } = await session.from("businesses")
      .select("status,subscription:business_subscriptions(status)").eq("id", businessId).maybeSingle();
    const subscriptionAccess: any = Array.isArray((businessAccess as any)?.subscription) ? (businessAccess as any).subscription[0] : (businessAccess as any)?.subscription;
    if (accessError || !businessAccess || businessAccess.status !== "active" || ["suspended", "cancelled"].includes(subscriptionAccess?.status)) {
      return NextResponse.json({ error: "This business workspace is suspended. Complete subscription payment before recording sales." }, { status: 423 });
    }
    if (!allowed) return NextResponse.json({ error: "You do not have permission to record sales for this branch." }, { status: 403 });

    const { data: saleId, error: saleError } = await session.rpc("record_manual_mpesa_sale", {
      p_business_id: businessId,
      p_branch_id: branchId,
      p_items: body.items,
      p_customer_id: body.customer_id || null,
      p_discount: Number(body.discount || 0),
      p_tax: Number(body.tax || 0),
      p_notes: String(body.notes ?? "").trim() || null,
      p_account_type: accountType,
      p_reference: reference,
    });
    if (saleError || !saleId) throw new Error(saleError?.message || "Unable to save the M-Pesa sale and transaction code.");

    return NextResponse.json({ ok: true, sale_id: saleId, message: "Manual M-Pesa payment recorded." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the manual M-Pesa sale." }, { status: 400 });
  }
}
