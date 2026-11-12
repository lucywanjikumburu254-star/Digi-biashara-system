import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentSettingsForm from "./payment-settings-form";

export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: membership } = await supabase.from("business_memberships")
    .select("business_id").eq("user_id", user.id).eq("role", "owner").eq("status", "active")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/admin/dashboard");
  const { data: business } = await supabase.from("businesses")
    .select("name,status").eq("id", membership.business_id).maybeSingle();
  if (!business || business.status !== "active") redirect("/admin/dashboard");
  return <PaymentSettingsForm businessId={membership.business_id} businessName={business.name} />;
}
