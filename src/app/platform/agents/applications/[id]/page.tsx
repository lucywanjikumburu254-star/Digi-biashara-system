/* eslint-disable @next/next/no-img-element */
import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import ApplicationActions from "../../application-actions";

export const dynamic="force-dynamic";

export default async function AgentApplicationReviewPage({params}:{params:Promise<{id:string}>}){
 const{id}=await params;
 const s=await createClient();
 const{data:{user}}=await s.auth.getUser();if(!user)redirect("/platform/login");
 const{data:role}=await s.from("platform_roles").select("role").eq("user_id",user.id).eq("status","active").maybeSingle();
 if(role?.role!=="super_admin")redirect("/platform/login");
 const{data:a,error}=await s.from("agent_applications").select("*").eq("id",id).maybeSingle();
 if(error||!a)notFound();
 const bucket=s.storage.from("agent-application-documents");
 const[photo,idImage]=await Promise.all([
  a.passport_photo_path?bucket.createSignedUrl(a.passport_photo_path,600):Promise.resolve({data:null,error:null}),
  a.national_id_image_path?bucket.createSignedUrl(a.national_id_image_path,600):Promise.resolve({data:null,error:null})
 ]);
 const photoUrl=photo.data?.signedUrl??null;
 const idUrl=idImage.data?.signedUrl??null;
 const fmt=(v:string|null)=>v?new Date(v).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"—";
 return <div className="layout"><aside className="side"><div className="logo">DIGI<em>BIASHARA</em></div><div className="sidetitle">Platform</div><a className="navlink" href="/platform/dashboard">Overview</a><a className="navlink" href="/platform/businesses">Businesses</a><a className="navlink active" href="/platform/agents">Applications & agents</a><a className="navlink" href="/platform/agents/records">Agent records</a><a className="navlink" href="/platform/categories">Categories & templates</a><a className="navlink" href="/platform/subscriptions">Subscriptions & payments</a></aside>
 <main className="main"><header className="dashhead"><strong>Agent application review</strong><span className="muted">{a.status}</span></header><section className="dashcontent">
 <Link href="/platform/agents" className="btn secondary small">← Back to applications</Link>
 <div className="eyebrow" style={{marginTop:22}}>Applicant verification · {a.id.slice(0,8).toUpperCase()}</div><h1>{a.full_name}</h1><p className="sub">Review the applicant's details and identity documents before creating an agent login.</p>
 <div className="stats"><div className="stat"><span>Application status</span><strong style={{fontSize:18}}>{a.status}</strong></div><div className="stat"><span>Submitted</span><strong style={{fontSize:16}}>{fmt(a.created_at)}</strong></div><div className="stat"><span>Passport photo</span><strong style={{fontSize:16}}>{photoUrl?"Uploaded":"Missing / unavailable"}</strong></div><div className="stat"><span>National ID</span><strong style={{fontSize:16}}>{idUrl?"Uploaded":"Missing / unavailable"}</strong></div></div>
 <div className="panel"><div className="panelhead"><h2>Applicant information</h2><span className="pill">{a.status}</span></div><div className="cards">
  <div><small className="muted">Full legal name</small><p><strong>{a.full_name}</strong></p></div><div><small className="muted">Email address</small><p>{a.email}</p></div><div><small className="muted">Phone / WhatsApp</small><p>{a.phone}</p></div><div><small className="muted">County / town</small><p>{a.county}{a.town?", "+a.town:""}</p></div><div><small className="muted">Languages / communication</small><p>{a.communication_skills||"—"}</p></div><div><small className="muted">Age confirmation</small><p>{a.age_confirmed?"Confirmed 18+":"Not confirmed"}</p></div><div><small className="muted">Smartphone access</small><p>{a.smartphone_access?"Yes":"No"}</p></div><div><small className="muted">Internet access</small><p>{a.internet_access?"Yes":"No"}</p></div>
 </div><div style={{marginTop:18}}><small className="muted">Previous experience</small><p style={{whiteSpace:"pre-wrap"}}>{a.experience||"Not provided"}</p><small className="muted">Why they want to become an agent</small><p style={{whiteSpace:"pre-wrap"}}>{a.motivation||"Not provided"}</p></div></div>
 <div className="panel"><div className="panelhead"><h2>Passport-size photograph</h2><span className={"pill "+(photoUrl?"":"off")}>{photoUrl?"Uploaded":"Missing"}</span></div>{photoUrl?<><a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt="Applicant passport photograph" style={{display:"block",maxWidth:"100%",maxHeight:460,objectFit:"contain",border:"1px solid var(--line)",borderRadius:12,background:"#fff"}}/></a><p className="muted">Select the image to open the full-size private document. Link expires after 10 minutes.</p></>:<div className="error">No passport photo is available. This application cannot be approved.</div>}</div>
 <div className="panel"><div className="panelhead"><h2>National ID image (front)</h2><span className={"pill "+(idUrl?"":"off")}>{idUrl?"Uploaded":"Missing"}</span></div>{idUrl?<><a href={idUrl} target="_blank" rel="noreferrer"><img src={idUrl} alt="Applicant National ID image" style={{display:"block",maxWidth:"100%",maxHeight:460,objectFit:"contain",border:"1px solid var(--line)",borderRadius:12,background:"#fff"}}/></a><p className="muted">Select the image to open the full-size private document. Link expires after 10 minutes.</p></>:<div className="error">No National ID image is available. This application cannot be approved.</div>}</div>
 <ApplicationActions id={a.id} status={a.status} hasPassport={!!photoUrl} hasNationalId={!!idUrl}/>
 {a.status==="approved"&&<div className="panel"><h2>Agent account created</h2><p className="muted">The application has been approved. Use Agent records to view the agent's record, documents and access status.</p><Link className="btn" href="/platform/agents/records">Open agent records →</Link></div>}
 </section></main></div>;
}
