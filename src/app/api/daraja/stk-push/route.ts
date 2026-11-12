import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalisePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\\D/g, "");
  if (/^0[17]\\d{8}$/.test(digits)) return "254" + digits.slice(1);
  if (/^[17]\\d{8}$/.test(digits)) return "254" + digits;
  if (/^254[17]\\d{8}$/.test(digits)) return digits;
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const body = await request.json();
    const invoiceId = String(body.invoice_id ?? "");
    const phone = normalisePhone(body.phone_number);
    const amount = Number(body.amount);
    if (!invoiceId || !phone || !Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid invoice, Kenyan M-Pesa phone number and whole-KSh amount." }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await session.from("business_memberships")
      .select("business_id").eq("user_id", user.id).eq("role", "owner").eq("status", "active")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Only an active business owner can initiate this Sandbox payment." }, { status: 403 });

    const admin = createAdminClient();
    const { data: invoice, error: invoiceError } = await admin.from("business_invoices")
      .select("id,business_id,branch_id,customer_id,invoice_number,total,status,currency_code")
      .eq("id", invoiceId).eq("business_id", membership.business_id).maybeSingle();
    if (invoiceError || !invoice || invoice.status !== "issued") {
      return NextResponse.json({ error: "Invoice not found or is not payable." }, { status: 404 });
    }

    const { data: allocations, error: allocationError } = await admin.from("payment_allocations")
      .select("amount,business_payments!inner(status)").eq("invoice_id", invoice.id);
    if (allocationError) throw allocationError;
    const paid = (allocations ?? []).filter((a: any) => a.business_payments?.status === "confirmed")
      .reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    const outstanding = Math.max(0, Number(invoice.total) - paid);
    if (amount > outstanding || outstanding <= 0) {
      return NextResponse.json({ error: "The requested amount exceeds the invoice balance. Refresh the invoice and try again." }, { status: 409 });
    }

    const { data: recent, error: pendingError } = await admin.from("daraja_stk_requests")
      .select("id").eq("invoice_id", invoice.id).eq("status", "pending")
      .gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
    if (pendingError) throw pendingError;
    if (recent?.length) return NextResponse.json({ error: "There is already a pending STK request for this invoice. Wait for its result before sending another." }, { status: 409 });

    const consumerKey = process.env.DARAJA_SANDBOX_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_SANDBOX_CONSUMER_SECRET;
    const passkey = process.env.DARAJA_SANDBOX_PASSKEY;
    const shortcode = process.env.DARAJA_SANDBOX_SHORTCODE;
    if (process.env.DARAJA_ENV !== "sandbox" || !consumerKey || !consumerSecret || !passkey || !shortcode) {
      return NextResponse.json({ error: "Daraja Sandbox configuration is incomplete. Check the Vercel Sandbox variables." }, { status: 503 });
    }

    const callbackToken = randomBytes(32).toString("hex");
    const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
    const accountReference = String(invoice.invoice_number).slice(-12);
    const { data: stkRequest, error: insertError } = await admin.from("daraja_stk_requests").insert({
      business_id: invoice.business_id, invoice_id: invoice.id, customer_id: invoice.customer_id,
      branch_id: invoice.branch_id, amount, currency_code: "KES", phone_number: phone,
      account_reference: accountReference, callback_token_hash: callbackTokenHash,
      created_by: user.id, status: "pending",
    }).select("id").single();
    if (insertError) throw insertError;

    try {
      const basic = Buffer.from(consumerKey + ":" + consumerSecret).toString("base64");
      const authResponse = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
        headers: { Authorization: "Basic " + basic, Accept: "application/json" },
        cache: "no-store",
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
          AccountReference: accountReference, TransactionDesc: "Invoice " + accountReference,
        }),
        cache: "no-store",
      });
      const stkData = await stkResponse.json();
      if (!stkResponse.ok || String(stkData.ResponseCode) !== "0" || !stkData.CheckoutRequestID) {
        throw new Error(stkData.errorMessage || stkData.ResponseDescription || "Safaricom did not accept the STK request.");
      }

      const { error: updateError } = await admin.from("daraja_stk_requests").update({
        merchant_request_id: stkData.MerchantRequestID,
        checkout_request_id: stkData.CheckoutRequestID,
        response_code: String(stkData.ResponseCode),
        response_description: stkData.ResponseDescription ?? "STK request accepted",
      }).eq("id", stkRequest.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true, message: "STK prompt accepted by Safaricom Sandbox. The customer must approve it on their phone.",
        request_id: stkRequest.id,
      });
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : "Unable to initiate the Sandbox payment.";
      await admin.from("daraja_stk_requests").update({
        status: "failed", response_description: safeMessage.slice(0, 500), updated_at: new Date().toISOString(),
      }).eq("id", stkRequest.id);
      return NextResponse.json({ error: safeMessage }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start the M-Pesa payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
