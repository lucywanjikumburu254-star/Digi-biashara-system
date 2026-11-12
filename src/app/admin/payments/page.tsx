import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsWorkspace from "./payments-workspace";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: membership, error } = await supabase.from("business_memberships")
    .select("business_id").eq("user_id", user.id).eq("role", "owner").eq("status", "active")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !membership) redirect("/login");
  const { data: business } = await supabase.from("businesses")
    .select("name,status,category:business_categories(name)").eq("id", membership.business_id).maybeSingle();
  if (!business || business.status !== "active") redirect("/admin/dashboard");
  const category = Array.isArray(business.category) ? business.category[0] : business.category;
  return <PaymentsWorkspace businessId={membership.business_id} businessName={business.name} categoryName={category?.name ?? "Business"} />;
}
