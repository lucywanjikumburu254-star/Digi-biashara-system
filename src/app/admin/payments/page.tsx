import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentsWorkspace from "./payments-workspace";
import BusinessSuspensionGuard from "@/components/business-suspension-guard";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: membership, error } = await supabase.from("business_memberships")
    .select("business_id,businesses!business_memberships_business_id_fkey(name,status,category:business_categories!businesses_category_id_fkey(name))")
    .eq("user_id", user.id).eq("role", "owner").eq("status", "active")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !membership) redirect("/login");
  const business: any = Array.isArray((membership as any).businesses)
    ? (membership as any).businesses[0]
    : (membership as any).businesses;
  if (!business || business.status !== "active") redirect("/admin/dashboard");
  const category = Array.isArray(business.category) ? business.category[0] : business.category;
  return <BusinessSuspensionGuard businessId={membership.business_id} businessName={business.name} audience="owner"><PaymentsWorkspace businessId={membership.business_id} businessName={business.name} categoryName={category?.name ?? "Business"} /></BusinessSuspensionGuard>;
}
