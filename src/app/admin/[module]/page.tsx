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

  // Resolve the owner membership independently from business joins. This
  // keeps navigation authorization stable even if a related business/category
  // record cannot be expanded by PostgREST.
  const { data: membership, error: membershipError } = await supabase
    .from("business_memberships")
    .select("business_id")
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

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("name,status,category:business_categories(name),subscription:business_subscriptions(status)")
    .eq("id", membership.business_id)
    .maybeSingle();

  if (businessError || !business) {
    return (
      <main className="wrap">
        <h1>Business workspace temporarily unavailable</h1>
        <p className="muted">Your sign-in is still active, but we could not load your business details. Please try again or contact Digi Biashara support.</p>
        <a className="btn" href="/admin/dashboard">Return to dashboard</a>
      </main>
    );
  }

  const subscription = Array.isArray((business as any).subscription) ? (business as any).subscription[0] : (business as any).subscription;\n  if (business.status !== "active" || ["suspended","cancelled"].includes(subscription?.status)) redirect("/admin/dashboard");

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
