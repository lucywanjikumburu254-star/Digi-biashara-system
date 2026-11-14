import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import EmployeeSales from "./employee-sales";
import BrandLogo from "@/components/brand-logo";

export default async function EmployeeDashboard(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect("/login");

  const {data:m,error}=await s.from("business_memberships")
    .select("business_id,branch_id,permissions,businesses(name,status)")
    .eq("user_id",user.id).eq("role","employee").eq("status","active")
    .order("created_at",{ascending:true}).limit(1).maybeSingle();

  if(error||!m||!m.branch_id||m.permissions?.sales!==true) redirect("/login");
  const business:any=m.businesses;
  if(business?.status!=="active"){
    return <main className="wrap"><BrandLogo /><h1>Business access paused</h1><p className="muted">Your business owner should contact platform support about the subscription. Business data remains stored.</p><form action="/logout" method="post"><button type="submit" className="btn">Sign out</button></form></main>;
  }

  const {data:branch}=await s.from("branches").select("id,name").eq("id",m.branch_id).eq("business_id",m.business_id).eq("status","active").maybeSingle();
  if(!branch) return <main className="wrap"><Link className="logo" href="/">DIGI<em>BIASHARA</em></Link><h1>Branch access unavailable</h1><p className="muted">Ask the business owner to assign you to an active branch.</p><form action="/logout" method="post"><button type="submit" className="btn">Sign out</button></form></main>;

  return <EmployeeSales businessId={m.business_id} businessName={business?.name??"Your business"} branchId={branch.id} branchName={branch.name}/>;
}
