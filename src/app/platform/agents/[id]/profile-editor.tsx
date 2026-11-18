"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
type Profile={id:string;linked_user_id:string|null;full_name:string|null;email:string|null;phone:string|null;county:string|null;town:string|null;agent_code:string|null;job_number:string|null;passport_photo_path:string|null;national_id_image_path:string|null;status:string};
const MAX_IMAGE_SIZE=5*1024*1024;
export default function AgentProfileEditor({profile,passportUrl,nationalIdUrl}:{profile:Profile;passportUrl:string;nationalIdUrl:string}){
 const router=useRouter();
 const [form,setForm]=useState({full_name:profile.full_name??"",email:profile.email??"",phone:profile.phone??"",county:profile.county??"",town:profile.town??"",agent_code:profile.agent_code??"",job_number:profile.job_number??"",status:profile.status});
 const [passport,setPassport]=useState<File|null>(null);const [nationalId,setNationalId]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
 const change=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));
 function validateImage(file:File|null){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Upload a JPG, PNG or WEBP image.");if(file.size>MAX_IMAGE_SIZE)throw new Error("Each image must be 5 MB or smaller.");}
 async function uploadImage(s:ReturnType<typeof createClient>,file:File|null,currentPath:string|null,kind:"passport-photo"|"national-id"){
  if(!file)return currentPath;
  const extension="jpg";const path=currentPath??(profile.id+"/"+kind+".jpg");
  const {error:uploadError}=await s.storage.from("agent-application-documents").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
  if(uploadError)throw uploadError;
  return path;
 }
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   validateImage(passport);validateImage(nationalId);
   const s=createClient();
   const passportPath=await uploadImage(s,passport,profile.passport_photo_path,"passport-photo");
   const nationalPath=await uploadImage(s,nationalId,profile.national_id_image_path,"national-id");
   const {error:pe}=await s.from("platform_agent_profiles").update({full_name:form.full_name.trim(),email:form.email.trim(),phone:form.phone.trim(),county:form.county.trim(),town:form.town.trim()||null,agent_code:form.agent_code.trim(),job_number:form.job_number.trim(),status:form.status,passport_photo_path:passportPath,national_id_image_path:nationalPath,updated_at:new Date().toISOString()}).eq("id",profile.id);
   if(pe)throw pe;
   if(profile.linked_user_id){const roleStatus=form.status==="active"?"active":form.status==="suspended"?"suspended":"disabled";const {error:re}=await s.from("platform_roles").update({full_name:form.full_name.trim(),email:form.email.trim(),phone:form.phone.trim(),agent_code:form.agent_code.trim(),territory:[form.county,form.town].filter(Boolean).join(", "),status:roleStatus}).eq("user_id",profile.linked_user_id);if(re)throw re;}
   setPassport(null);setNationalId(null);setMessage("Agent details and documents updated. The identity card will use the new portrait and information.");router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"Could not update agent profile or documents.");}finally{setBusy(false);}
 }
 const field=(label:string,key:keyof typeof form,required=false)=><label className="field"><span>{label}</span><input required={required} value={form[key]} onChange={e=>change(key,e.target.value)}/></label>;
 return <>
 <form className="panel" onSubmit={save}>
  <div className="panelhead"><h2>Agent information and official documents</h2><span className="pill">Admin only</span></div>
  <p className="muted">You can correct every profile field and replace either document. Changes are reflected on the agent’s official ID after saving.</p>
  {error&&<div className="error" role="alert">{error}</div>}{message&&<div className="success" role="status">{message}</div>}
  <h3 style={{marginTop:18}}>Identity photographs and documents</h3>
  <div className="form-grid" style={{alignItems:"start"}}>
   <div className="field"><label>Passport photo used on the agent ID</label>{passport?<img src={URL.createObjectURL(passport)} alt="New selected passport portrait" style={{width:132,height:156,objectFit:"cover",borderRadius:12,border:"1px solid #dce8fb"}}/>:passportUrl?<a href={passportUrl} target="_blank" rel="noreferrer"><img src={passportUrl} alt="Current agent passport portrait" style={{width:132,height:156,objectFit:"cover",borderRadius:12,border:"1px solid #dce8fb"}}/><small style={{display:"block"}}>View current photo</small></a>:<p className="muted">No passport photo uploaded.</p>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPassport(e.target.files?.[0]??null)}/><small className="muted">Choose a replacement photo · JPG, PNG or WEBP · max 5 MB</small>{passport&&<button type="button" className="btn small secondary" onClick={()=>setPassport(null)}>Undo photo selection</button>}</div>
   <div className="field"><label>National ID document (private verification)</label>{nationalIdUrl?<a href={nationalIdUrl} target="_blank" rel="noreferrer">Open current national ID securely</a>:<p className="muted">No national ID document uploaded.</p>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setNationalId(e.target.files?.[0]??null)}/><small className="muted">Replace the ID image · JPG, PNG or WEBP · max 5 MB. Never printed on the agent card or public verification page.</small>{nationalId&&<button type="button" className="btn small secondary" onClick={()=>setNationalId(null)}>Undo document selection</button>}</div>
  </div>
  <h3 style={{marginTop:22}}>Editable agent details</h3>
  <div className="form-grid">{field("Full legal name","full_name",true)}{field("Email address","email",true)}{field("Phone number","phone",true)}{field("County","county",true)}{field("Town / area","town")}{field("Agent ID / code","agent_code",true)}{field("Job number","job_number",true)}<label className="field"><span>Agent ID status</span><select value={form.status} onChange={e=>change("status",e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select></label></div>
  <div className="form-actions"><button className="btn" disabled={busy}>{busy?"Saving details and documents…":"Save all agent changes"}</button><a className="btn secondary" href="/platform/agents">Cancel</a></div>
 </form>
 <div className="panel"><h2>Document privacy</h2><p className="muted">Passport photos and national ID documents remain in the private agent documents bucket. Only authorised platform admins can review or replace them. The public verification page and printed ID card show only the passport portrait and approved identity details, never the national ID image.</p></div>
 </>;
}
