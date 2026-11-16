import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BusinessSuspensionGuard from "@/components/business-suspension-guard";
import DigiAiAssistant from "./digi-ai-assistant";

export const dynamic = "force-dynamic";

export default async function DigiAiAssistantPage() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data: membership, error } = await db.from("business_memberships")
    .select("business_id,role,branch_id,permissions,businesses!business_memberships_business_id_fkey(name)")
    .eq("user_id", user.id).eq("status", "active").in("role", ["owner", "employee"])
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (error || !membership) redirect("/login");
  if (membership.role !== "owner" && membership.permissions?.sales !== true) redirect("/admin/sales");

  const business: any = membership.businesses;
  const name = business?.name ?? "Business";
  return <BusinessSuspensionGuard businessId={membership.business_id} businessName={name} audience={membership.role === "owner" ? "owner" : "staff"}>
    <DigiAiAssistant businessId={membership.business_id} businessName={name} role={membership.role} assignedBranchId={membership.branch_id} />
  </BusinessSuspensionGuard>;
}
