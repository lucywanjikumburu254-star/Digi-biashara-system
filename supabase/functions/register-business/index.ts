import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return new Response(JSON.stringify({ error: "Your session is invalid. Sign in again." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let createdUserId: string | null = null;
  try {
    const body = await req.json();
    const mode = body.mode;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email) throw new Error("Owner or agent email is required.");

    if (password) {
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: String(body.full_name ?? ""), phone: String(body.phone ?? "") },
      });
      if (!error && data.user) createdUserId = data.user.id;
      else if (!/already|registered|exists|duplicate/i.test(error?.message ?? "")) throw error;
    }

    let result: string | null = null;
    if (mode === "platform_business") {
      const { data, error } = await caller.rpc("platform_register_business", {
        p_owner_email: email, p_owner_full_name: body.full_name,
        p_business_name: body.business_name, p_category_id: body.category_id,
        p_location: body.location || null, p_phone: body.phone || null,
        p_agent_user_id: body.agent_user_id || null, p_monthly_fee: Number(body.monthly_fee ?? 3000),
      });
      if (error) throw error;
      result = data;
    } else if (mode === "agent_business") {
      const { data, error } = await caller.rpc("agent_register_business", {
        p_owner_email: email, p_business_name: body.business_name,
        p_category_id: body.category_id, p_location: body.location || null,
        p_phone: body.phone || null, p_monthly_fee: Number(body.monthly_fee ?? 3000),
      });
      if (error) throw error;
      result = data;
    } else if (mode === "agent_account") {
      const { data, error } = await caller.rpc("platform_assign_agent", {
        p_email: email, p_full_name: body.full_name, p_phone: body.phone || null,
        p_territory: body.territory || null, p_agent_code: body.agent_code || null,
      });
      if (error) throw error;
      result = data;
    } else {
      throw new Error("Unsupported registration type.");
    }

    return new Response(JSON.stringify({ success: true, id: result, account_created: Boolean(createdUserId) }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    const message = error instanceof Error ? error.message : "Registration failed.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
