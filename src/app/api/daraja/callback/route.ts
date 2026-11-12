import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function metadataValue(items: any[], name: string) {
  return items.find((item) => item?.Name === name)?.Value ?? null;
}

function parseTransactionDate(value: unknown) {
  const raw = String(value ?? "");
  if (!/^\\d{14}$/.test(raw)) return null;
  const iso = raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8)+"T"+
    raw.slice(8,10)+":"+raw.slice(10,12)+":"+raw.slice(12,14)+"+03:00";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "Invalid callback token." }, { status: 401 });
    const payload = await request.json();
    const callback = payload?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID || !Number.isInteger(Number(callback.ResultCode))) {
      return NextResponse.json({ error: "Invalid Daraja callback payload." }, { status: 400 });
    }

    const items = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
    const amount = metadataValue(items, "Amount");
    const receipt = metadataValue(items, "MpesaReceiptNumber");
    const phone = metadataValue(items, "PhoneNumber");
    const transactionDate = parseTransactionDate(metadataValue(items, "TransactionDate"));
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("process_daraja_stk_callback", {
      p_checkout_request_id: String(callback.CheckoutRequestID),
      p_callback_token_hash: tokenHash,
      p_result_code: Number(callback.ResultCode),
      p_result_description: String(callback.ResultDesc ?? ""),
      p_amount: amount === null ? null : Number(amount),
      p_mpesa_receipt_number: receipt === null ? null : String(receipt),
      p_phone_number: phone === null ? null : String(phone),
      p_transaction_date: transactionDate,
    });
    if (error) throw error;
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted", result: data });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Callback could not be processed." }, { status: 500 });
  }
}
