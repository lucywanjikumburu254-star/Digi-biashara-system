import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BusinessNav from "@/components/business-nav";
import InsightsClient from "./insights-client";
export const dynamic = "force-dynamic";
export default async function InsightsPage() {
 const s=await createClient(); const {data:{user},error}=await s.auth.getUser(); if(error||!user) redirect("/login");
 const {data:m,error:me}=await s.from("business_memberships").select("business_id").eq("user_id",user.id).eq("role","owner").eq("status","active").limit(1).maybeSingle();
 if(me||!m) redirect("/login");
 const {data:b,error:be}=await s.from("businesses").select("name,status").eq("id",m.business_id).maybeSingle();
 if(be||!b||b.status!=="active") redirect("/admin/dashboard");
 return <div className="layout"><BusinessNav active="insights"/><main className="main"><header className="dashhead"><strong>{b.name}</strong><span className="muted">Business insights</span></header><InsightsClient businessId={m.business_id} businessName={b.name}/></main></div>;
}