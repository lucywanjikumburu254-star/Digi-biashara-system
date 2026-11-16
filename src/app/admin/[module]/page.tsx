import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";

const MODULES = ["branches","catalog","customers","suppliers","sales","inventory","purchases","expenses","staff","appointments","reports"] as const;

export default async function BusinessModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!MODULES.includes(module as typeof MODULES[number])) redirect("/admin/dashboard");

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  // One joined request replaces separate membership and business lookups.
  const { data: membership, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id,businesses!business_memberships_business_id_fkey(name,status,category:business_categories!businesses_category_id_fkey(name),subscription:business_subscriptions!business_subscriptions_business_id_fkey(status))")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <main className="wrap">
        <h1>We could not verify your business access</h1>
        <p className="muted">Your sign-in has not been cancelled. Please refresh this page. If the problem continues, contact Digi Biashara support.</p>
        <a className="btn" href="/admin/dashboard">Return to dashboard</a>
      </main>
    );
  }
  if (!membership) redirect("/login");

  const business: any = Array.isArray((membership as any).businesses)
    ? (membership as any).businesses[0]
    : (membership as any).businesses;

  if (!business) {
    return (
      <main className="wrap">
        <h1>Business workspace temporarily unavailable</h1>
        <p className="muted">Your sign-in is still active, but we could not load your business details. Please try again or contact Digi Biashara support.</p>
        <a className="btn" href="/admin/dashboard">Return to dashboard</a>
      </main>
    );
  }

  const subscription = Array.isArray(business.subscription) ? business.subscription[0] : business.subscription;
  if (business.status !== "active" || ["suspended","cancelled"].includes(subscription?.status)) redirect("/admin/dashboard");

  const category = Array.isArray(business.category) ? business.category[0] : business.category;
  return (
    <Workspace
      moduleName={module as typeof MODULES[number]}
      businessId={membership.business_id}
      businessName={business.name}
      categoryName={category?.name ?? "Business"}
    />
  );
}
