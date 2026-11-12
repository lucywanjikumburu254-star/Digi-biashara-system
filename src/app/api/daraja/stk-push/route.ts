import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalisePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^0[17]\\d{8}$/.test(digits)) return "254" + digits.slice(1);
  if (/^[17]\\d{8}$/.test(digits)) return "254" + digits;
  if (/^254[17]\\d{8}$/.test(digits)) return digits;
  return null;
}

export async function POST(request: Request) {
  let pendingSaleId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const body = await request.json();
    const phone = normalisePhone(body.phone_number);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Kenyan M-Pesa phone number, for example 0712345678 or 254712345678." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || !body.items.length) {
      return NextResponse.json({ error: "Add at least one product to the POS cart before sending the M-Pesa prompt." }, { status: 400 });
    }
    if (!body.branch_id) {
      return NextResponse.json({ error: "Select a branch before sending the M-Pesa prompt." }, { status: 400 });
    }

    const { data: memberships, error: membershipError } = await session.from("business_memberships")
      .select("business_id,role,branch_id,permissions").eq("user_id", user.id).eq("status", "active");
    if (membershipError || !memberships?.length) return NextResponse.json({ error: "An active business membership is required." }, { status: 403 });
    const membership = memberships.find((m: any) => m.role === "owner" || (m.role === "employee" && m.branch_id === body.branch_id && m.permissions?.sales === true));
    if (!membership) return NextResponse.json({ error: "You do not have permission to make POS sales for this branch." }, { status: 403 });

    const consumerKey = process.env.DARAJA_SANDBOX_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_SANDBOX_CONSUMER_SECRET;
    const passkey = process.env.DARAJA_SANDBOX_PASSKEY;
    const shortcode = process.env.DARAJA_SANDBOX_SHORTCODE;
    if (process.env.DARAJA_ENV !== "sandbox" || !consumerKey || !consumerSecret || !passkey || !shortcode) {
      return NextResponse.json({ error: "Daraja Sandbox configuration is incomplete. Check the Preview environment variables." }, { status: 503 });
    }

    const { data: sale, error: saleError } = await session.rpc("create_pending_pos_sale", {
      p_business_id: membership.business_id, p_branch_id: body.branch_id, p_items: body.items,
      p_customer_id: body.customer_id || null, p_discount: Number(body.discount || 0),
      p_tax: Number(body.tax || 0), p_notes: body.notes || null,
    });
    if (saleError || !sale?.sale_id) throw new Error(saleError?.message || "Unable to prepare the POS sale.");
    pendingSaleId = sale.sale_id;
    const amount = Number(sale.amount);
    const callbackToken = randomBytes(32).toString("hex");
    const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
    admin = createAdminClient();

    const { data: stkRequest, error: insertError } = await admin.from("daraja_stk_requests").insert({
      business_id: membership.business_id, sale_id: sale.sale_id, invoice_id: null,
      customer_id: body.customer_id || null, branch_id: body.branch_id, amount,
      currency_code: "KES", phone_number: phone, account_reference: String(sale.sale_number).slice(-12),
      callback_token_hash: callbackTokenHash, created_by: user.id, status: "pending",
    }).select("id").single();
    if (insertError) throw insertError;

    try {
      const basic = Buffer.from(consumerKey + ":" + consumerSecret).toString("base64");
      const authResponse = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
        headers: { Authorization: "Basic " + basic, Accept: "application/json" }, cache: "no-store",
      });
      const authData = await authResponse.json();
      if (!authResponse.ok || !authData.access_token) throw new Error("Safaricom Sandbox authentication failed.");

      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const timestamp = ["year","month","day","hour","minute","second"].map((key) => parts.find((part) => part.type === key)?.value ?? "").join("");
      const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");
      const callbackUrl = new URL("/api/daraja/callback?token=" + callbackToken, request.url).toString();
      const stkResponse = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: { Authorization: "Bearer " + authData.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: shortcode, Password: password, Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline", Amount: amount, PartyA: phone,
          PartyB: shortcode, PhoneNumber: phone, CallBackURL: callbackUrl,
          AccountReference: String(sale.sale_number).slice(-12), TransactionDesc: "POS sale " + sale.sale_number,
        }), cache: "no-store",
      });
      const stkData = await stkResponse.json();
      if (!stkResponse.ok || String(stkData.ResponseCode) !== "0" || !stkData.CheckoutRequestID) {
        throw new Error(stkData.errorMessage || stkData.ResponseDescription || "Safaricom did not accept the STK request.");
      }
      const { error: updateError } = await admin.from("daraja_stk_requests").update({
        merchant_request_id: stkData.MerchantRequestID, checkout_request_id: stkData.CheckoutRequestID,
        response_code: String(stkData.ResponseCode), response_description: stkData.ResponseDescription ?? "STK request accepted",
      }).eq("id", stkRequest.id);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, message: "STK prompt sent. Ask the customer to approve it on their phone.", sale_id: sale.sale_id, sale_number: sale.sale_number, amount });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initiate the Sandbox payment.";
      await admin.from("daraja_stk_requests").update({ status: "failed", response_description: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", stkRequest.id);
      await admin.from("sales").update({ status: "void" }).eq("id", sale.sale_id).eq("status", "pending_payment");
      pendingSaleId = null;
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    if (pendingSaleId && admin) await admin.from("sales").update({ status: "void" }).eq("id", pendingSaleId).eq("status", "pending_payment");
    const message = error instanceof Error ? error.message : "Unable to start the M-Pesa payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
