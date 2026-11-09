import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  const authorization = req.headers.get("Authorization");
  if (!url || !anon || !service) return json({ error: "Server authentication is not configured." }, 500);
  if (!authorization) return json({ error: "Sign in as the business owner first." }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Your session is invalid. Sign in again." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let createdUserId: string | null = null;

  try {
    const body = await req.json();
    const businessId = String(body.business_id ?? "");
    const branchId = String(body.branch_id ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const phone = String(body.phone ?? "").trim();
    const jobTitle = String(body.job_title ?? "").trim();

    if (!businessId || !branchId || !fullName || !email || !password) {
      throw new Error("Full name, email, password and assigned branch are required.");
    }
    if (password.length < 8) throw new Error("Password must contain at least 8 characters.");

    const { data: ownerMembership, error: ownerError } = await caller
      .from("business_memberships")
      .select("business_id,role,status")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (!ownerMembership) throw new Error("Only the business owner can create staff login accounts.");

    const { data: branch, error: branchError } = await caller
      .from("branches")
      .select("id")
      .eq("id", branchId)
      .eq("business_id", businessId)
      .eq("status", "active")
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) throw new Error("Choose an active branch belonging to this business.");

    const { data: existingStaff, error: staffCheckError } = await caller
      .from("business_staff")
      .select("id")
      .eq("business_id", businessId)
      .ilike("email", email)
      .maybeSingle();
    if (staffCheckError) throw staffCheckError;
    if (existingStaff) throw new Error("A staff record already uses this email address.");

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, account_type: "business_employee" },
    });
    if (createError) throw createError;
    if (!created.user) throw new Error("The staff login could not be created.");
    createdUserId = created.user.id;

    const { error: membershipInsertError } = await admin.from("business_memberships").insert({
      business_id: businessId,
      user_id: createdUserId,
      branch_id: branchId,
      role: "employee",
      status: "active",
      permissions: { sales: true },
    });
    if (membershipInsertError) throw membershipInsertError;

    const { error: staffInsertError } = await admin.from("business_staff").insert({
      business_id: businessId,
      branch_id: branchId,
      full_name: fullName,
      email,
      phone: phone || null,
      job_title: jobTitle || "Sales staff",
      employment_type: "permanent",
      monthly_salary: 0,
      status: "active",
      user_id: createdUserId,
      created_by: user.id,
    });
    if (staffInsertError) throw staffInsertError;

    return json({ success: true, staff_user_id: createdUserId });
  } catch (error) {
    if (createdUserId) {
      await admin.from("business_memberships").delete().eq("user_id", createdUserId);
      await admin.from("business_staff").delete().eq("user_id", createdUserId);
      await admin.auth.admin.deleteUser(createdUserId);
    }
    return json({ error: error instanceof Error ? error.message : "Unable to create staff account." }, 400);
  }
});