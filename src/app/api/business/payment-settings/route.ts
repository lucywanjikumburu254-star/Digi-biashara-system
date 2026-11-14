import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptDarajaSecret } from "@/lib/daraja-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountInput = {
  account_type: "paybill" | "till" | "pochi";
  account_number: string;
  shortcode?: string;
  environment?: "sandbox" | "production";
  enabled?: boolean;
  consumer_key?: string;
  consumer_secret?: string;
  passkey?: string;
};

function normaliseKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return "254" + digits.slice(1);
  if (/^[17]\d{8}$/.test(digits)) return "254" + digits;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}

async function getActor(businessId: string, allowEmployeeRead = false) {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };

  const [{ data: platformRole }, { data: membership }] = await Promise.all([
    session.from("platform_roles").select("role").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    session.from("business_memberships").select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  const isPlatformAdmin = platformRole?.role === "super_admin";
  const isOwner = membership?.role === "owner";
  const isAllowedMemberRead = allowEmployeeRead && Boolean(membership);
  if (!isPlatformAdmin && !isOwner && !isAllowedMemberRead) {
    return { response: NextResponse.json({ error: "Only the business owner or Digi Biashara platform administrator can manage payment settings." }, { status: 403 }) };
  }
  if (!isPlatformAdmin) {
    const { data: business, error: businessError } = await session.from("businesses")
      .select("status,subscription:business_subscriptions(status)").eq("id", businessId).maybeSingle();
    const subscriptionAccess: any = Array.isArray((business as any)?.subscription) ? (business as any).subscription[0] : (business as any)?.subscription;
    if (businessError || !business || business.status !== "active" || ["suspended", "cancelled"].includes(subscriptionAccess?.status)) {
      return { response: NextResponse.json({ error: "This business workspace is suspended. Payment settings are unavailable until access is restored." }, { status: 423 }) };
    }
  }
  return { session, user, isPlatformAdmin, isOwner };
}

export async function GET(request: Request) {
  try {
    const businessId = new URL(request.url).searchParams.get("business_id") ?? "";
    if (!businessId) return NextResponse.json({ error: "Business ID is required." }, { status: 400 });
    const actor = await getActor(businessId, true);
    if ("response" in actor) return actor.response;

    const admin = createAdminClient();
    const [{ data: business, error: businessError }, { data: rows, error: rowsError }] = await Promise.all([
      admin.from("businesses").select("id,phone").eq("id", businessId).maybeSingle(),
      admin.from("business_mpesa_accounts").select("account_type,account_number,shortcode,environment,enabled,connection_status,consumer_key_ciphertext,consumer_secret_ciphertext,passkey_ciphertext").eq("business_id", businessId),
    ]);
    if (businessError) throw businessError;
    if (rowsError) throw rowsError;
    return NextResponse.json({
      contact_phone: business?.phone ?? "",
      sandbox_fallback_available: !(rows ?? []).some((row: any) => row.account_type === "paybill") && process.env.DARAJA_ENV === "sandbox" && Boolean(process.env.DARAJA_SANDBOX_CONSUMER_KEY && process.env.DARAJA_SANDBOX_CONSUMER_SECRET && process.env.DARAJA_SANDBOX_PASSKEY && process.env.DARAJA_SANDBOX_SHORTCODE),
      accounts: (rows ?? []).map((row: any) => ({
        account_type: row.account_type,
        account_number: row.account_number,
        shortcode: row.shortcode ?? "",
        environment: row.environment ?? "sandbox",
        enabled: row.enabled,
        connection_status: row.connection_status,
        credentials_configured: Boolean(row.consumer_key_ciphertext && row.consumer_secret_ciphertext && row.passkey_ciphertext),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const businessId = String(body.business_id ?? "");
    if (!businessId) return NextResponse.json({ error: "Business ID is required." }, { status: 400 });
    const actor = await getActor(businessId);
    if ("response" in actor) return actor.response;

    const contactPhoneRaw = String(body.contact_phone ?? "").trim();
    const contactPhone = contactPhoneRaw ? normaliseKenyanPhone(contactPhoneRaw) : null;
    if (contactPhoneRaw && !contactPhone) {
      return NextResponse.json({ error: "Enter a valid Kenyan business phone number." }, { status: 400 });
    }
    if (!Array.isArray(body.accounts)) {
      return NextResponse.json({ error: "Payment account details are missing." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: business, error: businessError } = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle();
    if (businessError) throw businessError;
    if (!business) return NextResponse.json({ error: "Business account was not found." }, { status: 404 });

    for (const input of body.accounts as AccountInput[]) {
      if (!["paybill", "till", "pochi"].includes(input.account_type)) throw new Error("Unsupported M-Pesa account type.");
      const type = input.account_type;
      const accountNumberRaw = String(input.account_number ?? "").trim();
      const enabled = Boolean(input.enabled);
      if (!accountNumberRaw) {
        if (enabled) throw new Error("Enter the account number for every enabled payment method.");
        const { error: deleteError } = await admin.from("business_mpesa_accounts")
          .delete().eq("business_id", businessId).eq("account_type", type);
        if (deleteError) throw deleteError;
        continue;
      }
      let accountNumber = accountNumberRaw;
      let shortcode: string | null = null;
      let environment: "sandbox" | "production" | null = null;
      if (type === "pochi") {
        const phone = normaliseKenyanPhone(accountNumberRaw);
        if (!phone) throw new Error("Enter a valid Kenyan phone number for Pochi la Biashara.");
        accountNumber = phone;
      } else if (type === "paybill") {
        if (!/^\d{4,7}$/.test(accountNumberRaw)) throw new Error("Enter a valid 4–7 digit PayBill number.");
        shortcode = accountNumberRaw;
        environment = input.environment === "production" ? "production" : "sandbox";
      } else {
        if (!/^\d{4,7}$/.test(accountNumberRaw)) throw new Error("Enter a valid 4–7 digit Till number.");
        const storeCode = String(input.shortcode ?? "").trim();
        if (storeCode && !/^\d{4,7}$/.test(storeCode)) throw new Error("Enter a valid optional Safaricom Store or Head Office shortcode.");
        shortcode = storeCode || null;
        environment = input.environment === "production" ? "production" : "sandbox";
      }

      const { data: existing, error: existingError } = await admin.from("business_mpesa_accounts")
        .select("consumer_key_ciphertext,consumer_secret_ciphertext,passkey_ciphertext")
        .eq("business_id", businessId).eq("account_type", type).maybeSingle();
      if (existingError) throw existingError;

      let keyCipher = existing?.consumer_key_ciphertext ?? null;
      let secretCipher = existing?.consumer_secret_ciphertext ?? null;
      let passkeyCipher = existing?.passkey_ciphertext ?? null;
      if (type !== "pochi") {
        const supplied = [input.consumer_key, input.consumer_secret, input.passkey].map((v) => String(v ?? "").trim());
        const count = supplied.filter(Boolean).length;
        if (count !== 0 && count !== 3) throw new Error("For " + type + ", enter the Consumer Key, Consumer Secret and Passkey together.");
        if (count === 3) {
          keyCipher = encryptDarajaSecret(supplied[0]);
          secretCipher = encryptDarajaSecret(supplied[1]);
          passkeyCipher = encryptDarajaSecret(supplied[2]);
        }
      } else {
        keyCipher = null; secretCipher = null; passkeyCipher = null;
      }

      const credentialsConfigured = Boolean(keyCipher && secretCipher && passkeyCipher);
      const { error: saveError } = await admin.from("business_mpesa_accounts").upsert({
        business_id: businessId,
        account_type: type,
        account_number: accountNumber,
        shortcode,
        environment,
        enabled,
        consumer_key_ciphertext: keyCipher,
        consumer_secret_ciphertext: secretCipher,
        passkey_ciphertext: passkeyCipher,
        connection_status: credentialsConfigured ? "configured" : "not_connected",
        last_connection_error: null,
        updated_by: actor.user.id,
      }, { onConflict: "business_id,account_type" });
      if (saveError) throw saveError;
    }

    const { error: phoneError } = await admin.from("businesses").update({
      phone: contactPhone,
      updated_at: new Date().toISOString(),
    }).eq("id", businessId);
    if (phoneError) throw phoneError;

    return NextResponse.json({ ok: true, message: "Business payment settings saved securely." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save payment settings." }, { status: 400 });
  }
}
