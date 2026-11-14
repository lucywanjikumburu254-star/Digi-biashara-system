import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PosReports from "./pos-reports";

export default async function PosReportsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await db.from("business_memberships")
    .select("business_id,role,branch_id,permissions,businesses(name)")
    .eq("user_id", user.id).eq("status", "active").in("role", ["owner", "employee"])
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/login");
  if (membership.role !== "owner" && membership.permissions?.sales !== true) redirect("/admin/sales");
  const business: any = membership.businesses;
  return <PosReports businessId={membership.business_id} businessName={business?.name ?? "Business"} role={membership.role} assignedBranchId={membership.branch_id} />;
}
