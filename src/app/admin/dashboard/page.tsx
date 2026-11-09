/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import BusinessNav from "@/components/business-nav";

const modules = [
  ["branches","Branches","Manage up to five business locations."],
  ["catalog","Products & services","Add stock items and service prices."],
  ["sales","Sales / POS","Create sales and record payments."],
  ["inventory","Inventory","Track quantity at each branch."],
  ["purchases","Purchases","Receive goods from suppliers."],
  ["expenses","Expenses","Record operating costs."],
  ["customers","Customers","Keep customer information."],
  ["suppliers","Suppliers","Manage supplier contacts."],
  ["staff","Staff","Maintain team records and assignments."],
  ["appointments","Appointments","Book salon and service customers."],
  ["reports","Reports","Review sales and business costs."]
] as const;

export default async function OwnerDashboard(){
 const s=await createClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user) redirect("/login");
 const {data:m}=await s.from("business_memberships")
  .select("business_id,businesses(name,status,category:business_categories(name),subscription:business_subscriptions(status,monthly_fee,due_at,trial_ends_at))")
  .eq("user_id",user.id).eq("role","owner").eq("status","active").limit(1).maybeSingle();
 if(!m) redirect("/login");
 const biz:any=m.businesses;
 const sub=Array.isArray(biz?.subscription)?biz.subscription[0]:biz?.subscription;
 const isSuspended=biz?.status==="suspended"||sub?.status==="suspended"||sub?.status==="cancelled";
 const [branches,products,sales]=await Promise.all([
  s.from("branches").select("id",{count:"exact",head:true}).eq("business_id",m.business_id).eq("status","active"),
  s.from("products").select("id",{count:"exact",head:true}).eq("business_id",m.business_id).eq("is_active",true),
  s.from("sales").select("total").eq("business_id",m.business_id).eq("status","completed")
 ]);
 const salesTotal=(sales.data??[]).reduce((sum:any,row:any)=>sum+Number(row.total??0),0);
 return <div className="layout">
  <BusinessNav active="overview"/>
  <main className="main"><header className="dashhead"><strong>{biz?.name??"Your business"}</strong><span className="muted">{user.email}</span></header>
   <section className="dashcontent"><div className="eyebrow">Business owner dashboard</div><h1>Welcome to {biz?.name??"your workspace"}</h1><p className="sub">Manage your branches, products, services, sales, stock, staff and business finances.</p>
    <div className="stats">
     <div className="stat"><span>Business category</span><strong style={{fontSize:18}}>{biz?.category?.name??"Business"}</strong><small className="muted">Configured at registration</small></div>
     <div className="stat"><span>Active branches</span><strong>{branches.count??0} / 5</strong><small className="muted">Branch locations</small></div>
     <div className="stat"><span>Products & services</span><strong>{products.count??0}</strong><small className="muted">Active catalogue items</small></div>
     <div className="stat"><span>Recorded sales</span><strong style={{fontSize:18}}>KSh {salesTotal.toLocaleString("en-KE",{maximumFractionDigits:2})}</strong><small className="muted">Total of completed sales</small></div>
    </div>
    {isSuspended?<div className="panel"><span className="pill off">Business access suspended</span><h2 style={{marginTop:12}}>Your workspace is paused</h2><p className="muted">Your business data is retained. Open Billing & subscription to review your account.</p><Link className="btn" href="/admin/billing">Open billing</Link></div>:<>
      <div className="panel"><div className="panelhead"><h2>Business operations</h2><span className="pill">Workspace active</span></div><p className="muted">Choose a module to open its working form and saved records.</p><div className="cards module-cards">{modules.map(([key,label,desc])=><Link className="card" href={"/admin/"+key} key={key}><h3>{label} →</h3><p>{desc}</p></Link>)}</div></div>
      <div className="panel"><h2>Subscription</h2><p className="muted">Status: {sub?.status??"—"} · Monthly fee: KSh {Number(sub?.monthly_fee??0).toLocaleString("en-KE")} · Trial ends: {sub?.trial_ends_at?new Date(sub.trial_ends_at).toLocaleDateString("en-KE"):"—"}</p><Link className="btn secondary small" href="/admin/billing">View billing</Link></div>
    </>}
   </section>
  </main>
 </div>;
}
