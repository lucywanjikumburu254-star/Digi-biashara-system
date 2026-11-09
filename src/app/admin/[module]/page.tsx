import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Workspace from "./workspace";

const MODULES = ["branches","catalog","customers","suppliers","sales","inventory","purchases","expenses","staff","appointments","reports"] as const;

export default async function BusinessModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!MODULES.includes(module as typeof MODULES[number])) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("business_memberships")
    .select("business_id,businesses(name,status,category:business_categories(name))")
    .eq("user_id", user.id).eq("role", "owner").eq("status", "active")
    .limit(1).maybeSingle();
  if (!membership) redirect("/login");
  const business: any = membership.businesses;
  if (!business || business.status !== "active") redirect("/admin/dashboard");
  return <Workspace moduleName={module as typeof MODULES[number]} businessId={membership.business_id}
    businessName={business.name} categoryName={business.category?.name ?? "Business"} />;
}
