/* eslint-disable @typescript-eslint/no-explicit-any */
import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import AgentActions from "../agent-actions";

export const dynamic="force-dynamic";

export default async function AgentRecordsPage(){
 const s=await createClient();const{data:{user}}=await s.auth.getUser();if(!user)redirect("/platform/login");
 const{data:role}=await s.from("platform_roles").select("role").eq("user_id",user.id).eq("status","active").maybeSingle();if(role?.role!=="super_admin")redirect("/platform/login");
 const[{data:agents,error:agentsError},{data:profiles,error:profilesError},{data:businesses}]=await Promise.all([
  s.from("platform_roles").select("user_id,full_name,email,phone,agent_code,territory,status,created_at").eq("role","agent").order("created_at",{ascending:false}),
  s.from("platform_agent_profiles").select("id,application_id,linked_user_id,full_name,agent_code,job_number,county,town,status,passport_photo_path,national_id_image_path,approved_at").order("approved_at",{ascending:false}),
  s.from("businesses").select("id,agent_user_id").not("agent_user_id","is",null)
 ]);
 if(agentsError||profilesError)throw new Error("Unable to load agent records. Refresh the page or contact support.");
 const profileByUser=new Map((profiles??[]).filter((p:any)=>p.linked_user_id).map((p:any)=>[p.linked_user_id,p]));
 const active=(agents??[]).filter((a:any)=>a.status==="active").length;
 const removed=(profiles??[]).filter((p:any)=>p.status==="revoked").length;
 return <div className="layout"><aside className="side"><div className="logo">DIGI<em>BIASHARA</em></div><div className="sidetitle">Platform</div><a className="navlink" href="/platform/dashboard">Overview</a><a className="navlink" href="/platform/businesses">Businesses</a><a className="navlink" href="/platform/categories">Categories & templates</a><a className="navlink" href="/platform/agents">Applications & agents</a><a className="navlink active" href="/platform/agents/records">Agent records</a><a className="navlink" href="/platform/subscriptions">Subscriptions & payments</a><div className="sidetitle">Account</div><form action="/logout" method="post"><button type="submit" className="navlink" style={{width:"100%",textAlign:"left",border:0,background:"transparent",cursor:"pointer",font:"inherit"}}>Sign out</button></form></aside>
 <main className="main"><header className="dashhead"><strong>Agent records</strong><span className="muted">{agents?.length??0} agent accounts</span></header><section className="dashcontent">
 <div className="eyebrow">Agent administration · Kenya</div><h1>Agent records</h1><p className="sub">A permanent record of every assigned agent. Review identity documents, view their profile and safely remove access without deleting their history or referred businesses.</p>
 <div className="stats"><div className="stat"><span>Total agent accounts</span><strong>{agents?.length??0}</strong></div><div className="stat"><span>Active agents</span><strong>{active}</strong></div><div className="stat"><span>Approved profiles</span><strong>{profiles?.length??0}</strong></div><div className="stat"><span>Removed records</span><strong>{removed}</strong></div></div>
 <div className="panel"><div className="panelhead"><h2>All agent accounts</h2><Link href="/platform/agents" className="btn secondary small">Applications & agents</Link></div>
 <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Agent</th><th>Agent ID / job no.</th><th>Area</th><th>Documents</th><th>Businesses referred</th><th>Access status</th><th>Record</th><th>Action</th></tr></thead><tbody>
 {(agents??[]).map((a:any)=>{const p:any=profileByUser.get(a.user_id);const count=(businesses??[]).filter((b:any)=>b.agent_user_id===a.user_id).length;const isRemoved=p?.status==="revoked";return <tr key={a.user_id}><td><strong>{a.full_name||"—"}</strong><div className="muted">{a.email}</div><div className="muted">{a.phone}</div></td><td>{p?.agent_code??a.agent_code??"—"}<div className="muted">{p?.job_number??"—"}</div></td><td>{p?.county??a.territory??"—"}{p?.town?", "+p.town:""}</td><td>{p?<><span className={"pill "+(p.passport_photo_path?"":"off")}>Passport {p.passport_photo_path?"uploaded":"missing"}</span><br/><span className={"pill "+(p.national_id_image_path?"":"off")}>ID {p.national_id_image_path?"uploaded":"missing"}</span></>:<span className="muted">No application profile</span>}</td><td>{count}</td><td><span className={"pill "+(isRemoved||a.status!=="active"?"off":"")}>{isRemoved?"removed":a.status}</span></td><td>{p?<Link href={"/platform/agents/records/"+p.id}>View full record →</Link>:<span className="muted">Manual agent record</span>}</td><td><AgentActions id={a.user_id} status={a.status} profileId={p?.id??null} profileStatus={p?.status??null}/></td></tr>;})}
 </tbody></table>{!(agents?.length)&&<div className="empty">No agent accounts have been assigned yet.</div>}</div>
 </div>
 <div className="panel"><h2>Removal and record retention</h2><p className="muted">Removing an agent disables their platform login and marks their approved profile as revoked. Their application, uploaded identity documents, commission history and businesses they registered remain in Digi Biashara for audit and business attribution. Removal does not delete the agent's Auth user or historical records.</p></div>
 </section></main></div>;
}
