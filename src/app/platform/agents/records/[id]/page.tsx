/* eslint-disable @next/next/no-img-element */
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import AgentActions from "../../agent-actions";

export const dynamic="force-dynamic";

export default async function AgentRecordDetailPage({params}:{params:Promise<{id:string}>}){
 const{id}=await params;const s=await createClient();const{data:{user}}=await s.auth.getUser();if(!user)redirect("/platform/login");
 const{data:role}=await s.from("platform_roles").select("role").eq("user_id",user.id).eq("status","active").maybeSingle();if(role?.role!=="super_admin")redirect("/platform/login");
 const{data:p,error}=await s.from("platform_agent_profiles").select("*").eq("id",id).maybeSingle();if(error||!p)notFound();
 const[{data:account},{data:application},{data:businesses}]=await Promise.all([
  p.linked_user_id?s.from("platform_roles").select("user_id,full_name,email,phone,status,agent_code,territory,created_at").eq("user_id",p.linked_user_id).eq("role","agent").maybeSingle():Promise.resolve({data:null}),
  s.from("agent_applications").select("id,full_name,email,phone,county,town,experience,motivation,communication_skills,created_at,status,passport_photo_path,national_id_image_path").eq("id",p.application_id).maybeSingle(),
  p.linked_user_id?s.from("businesses").select("id,name,status,created_at").eq("agent_user_id",p.linked_user_id).order("created_at",{ascending:false}):Promise.resolve({data:[]})
 ]);
 const bucket=s.storage.from("agent-application-documents");
 const[photo,idImage]=await Promise.all([
  p.passport_photo_path?bucket.createSignedUrl(p.passport_photo_path,600):Promise.resolve({data:null}),
  p.national_id_image_path?bucket.createSignedUrl(p.national_id_image_path,600):Promise.resolve({data:null})
 ]);
 const fmt=(v:string|null)=>v?new Date(v).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"—";
 return <div className="layout"><aside className="side"><div className="logo">DIGI<em>BIASHARA</em></div><div className="sidetitle">Platform</div><a className="navlink" href="/platform/dashboard">Overview</a><a className="navlink" href="/platform/businesses">Businesses</a><a className="navlink" href="/platform/agents">Applications & agents</a><a className="navlink active" href="/platform/agents/records">Agent records</a><a className="navlink" href="/platform/categories">Categories & templates</a><a className="navlink" href="/platform/subscriptions">Subscriptions & payments</a></aside>
 <main className="main"><header className="dashhead"><strong>Agent record</strong><span className="muted">{p.agent_code}</span></header><section className="dashcontent">
 <Link href="/platform/agents/records" className="btn secondary small">← Back to agent records</Link><div className="eyebrow" style={{marginTop:22}}>Permanent agent record</div><h1>{p.full_name}</h1><p className="sub">Agent ID {p.agent_code} · Job number {p.job_number}</p>
 <div className="stats"><div className="stat"><span>Agent status</span><strong style={{fontSize:18}}>{p.status==="revoked"?"Removed":p.status}</strong></div><div className="stat"><span>Assigned area</span><strong style={{fontSize:16}}>{p.county}{p.town?", "+p.town:""}</strong></div><div className="stat"><span>Approved on</span><strong style={{fontSize:16}}>{fmt(p.approved_at)}</strong></div><div className="stat"><span>Businesses referred</span><strong>{businesses?.length??0}</strong></div></div>
 <div className="panel"><div className="panelhead"><h2>Agent details</h2><span className={"pill "+(p.status==="active"?"":"off")}>{p.status==="revoked"?"removed":p.status}</span></div><div className="cards"><div><small className="muted">Full name</small><p><strong>{p.full_name}</strong></p></div><div><small className="muted">Email</small><p>{account?.email??p.email}</p></div><div><small className="muted">Phone</small><p>{account?.phone??p.phone}</p></div><div><small className="muted">Agent ID</small><p>{p.agent_code}</p></div><div><small className="muted">Job number</small><p>{p.job_number}</p></div><div><small className="muted">Location</small><p>{p.county}{p.town?", "+p.town:""}</p></div></div></div>
 <div className="panel"><div className="panelhead"><h2>Passport photo</h2><span className={"pill "+(photo.data?.signedUrl?"":"off")}>{photo.data?.signedUrl?"Uploaded":"Missing"}</span></div>{photo.data?.signedUrl?<a href={photo.data.signedUrl} target="_blank" rel="noreferrer"><img src={photo.data.signedUrl} alt="Agent passport photo" style={{display:"block",maxWidth:"100%",maxHeight:420,objectFit:"contain",border:"1px solid var(--line)",borderRadius:12}}/></a>:<p className="muted">No passport photo is stored for this profile.</p>}</div>
 <div className="panel"><div className="panelhead"><h2>National ID</h2><span className={"pill "+(idImage.data?.signedUrl?"":"off")}>{idImage.data?.signedUrl?"Uploaded":"Missing"}</span></div>{idImage.data?.signedUrl?<a href={idImage.data.signedUrl} target="_blank" rel="noreferrer"><img src={idImage.data.signedUrl} alt="Agent National ID" style={{display:"block",maxWidth:"100%",maxHeight:420,objectFit:"contain",border:"1px solid var(--line)",borderRadius:12}}/></a>:<p className="muted">No National ID image is stored for this profile.</p>}</div>
 <div className="panel"><div className="panelhead"><h2>Agent access management</h2>{account&&<AgentActions id={account.user_id} status={account.status} profileId={p.id} profileStatus={p.status}/>}</div><p className="muted">Removing an agent revokes platform access but preserves this record, identity documents, commission history and referred business attribution.</p></div>
 <div className="panel"><h2>Businesses registered by this agent</h2>{businesses?.length?<div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Business</th><th>Status</th><th>Registered</th></tr></thead><tbody>{businesses.map((b:any)=><tr key={b.id}><td>{b.name}</td><td>{b.status}</td><td>{fmt(b.created_at)}</td></tr>)}</tbody></table></div>:<p className="muted">No businesses have been attributed to this agent yet.</p>}</div>
 {application&&<div className="panel"><h2>Original application</h2><p className="muted">Submitted {fmt(application.created_at)} · {application.status}</p><p>{application.experience||"No experience details supplied."}</p><p>{application.motivation||"No motivation statement supplied."}</p><Link href={"/platform/agents/applications/"+application.id}>Open original application →</Link></div>}
 </section></main></div>;
}
