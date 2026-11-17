"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type Application={
 id:string;full_name:string;email:string;phone:string;county:string;town:string|null;
 communication_skills:string|null;experience:string|null;motivation:string|null;
 age_confirmed:boolean;smartphone_access:boolean;internet_access:boolean;
 passport_photo_path:string|null;national_id_image_path:string|null;
};
const MAX=5*1024*1024;
const valid=(f:File)=>["image/jpeg","image/png","image/webp"].includes(f.type)&&f.size<=MAX;
export default function ApplicationEditor({application}:{application:Application}){
 const router=useRouter();
 const [form,setForm]=useState({
  full_name:application.full_name,email:application.email,phone:application.phone,
  county:application.county,town:application.town??"",
  communication_skills:application.communication_skills??"",
  experience:application.experience??"",motivation:application.motivation??"",
  age_confirmed:application.age_confirmed,smartphone_access:application.smartphone_access,
  internet_access:application.internet_access
 });
 const [photo,setPhoto]=useState<File|null>(null),[nationalId,setNationalId]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 function field<K extends keyof typeof form>(key:K,value:(typeof form)[K]){setForm(old=>({...old,[key]:value}));}
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   if(!form.full_name.trim()||!form.email.trim()||!form.phone.trim()||!form.county.trim())throw new Error("Complete the name, email, phone and county fields.");
   if(photo&&!valid(photo))throw new Error("Passport photo must be JPG, PNG or WebP and no larger than 5 MB.");
   if(nationalId&&!valid(nationalId))throw new Error("National ID image must be JPG, PNG or WebP and no larger than 5 MB.");
   const s=createClient(),bucket=s.storage.from("agent-application-documents");
   const updates:any={...form,full_name:form.full_name.trim(),email:form.email.trim().toLowerCase(),phone:form.phone.trim(),county:form.county.trim(),town:form.town.trim()||null,communication_skills:form.communication_skills.trim()||null,experience:form.experience.trim()||null,motivation:form.motivation.trim()||null,updated_at:new Date().toISOString()};
   if(photo){
    const path=application.id+"/"+crypto.randomUUID()+"/passport-photo.jpg";
    const {error}=await bucket.upload(path,photo,{contentType:photo.type,upsert:false});
    if(error)throw error;updates.passport_photo_path=path;
   }
   if(nationalId){
    const path=application.id+"/"+crypto.randomUUID()+"/national-id.jpg";
    const {error}=await bucket.upload(path,nationalId,{contentType:nationalId.type,upsert:false});
    if(error)throw error;updates.national_id_image_path=path;
   }
   const {error}=await s.from("agent_applications").update(updates).eq("id",application.id).in("status",["pending","reviewing"]);
   if(error)throw error;
   setMessage("Application details saved. Review the updated documents before approving.");
   setPhoto(null);setNationalId(null);router.refresh();
  }catch(err){setMessage(err instanceof Error?err.message:"Could not save application changes.");}
  finally{setBusy(false);}
 }
 const input={width:"100%",padding:11,border:"1px solid var(--line)",borderRadius:9,background:"var(--surface)",color:"inherit"} as const;
 const label={display:"block",fontSize:13,fontWeight:600,marginBottom:6} as const;
 return <form className="panel" onSubmit={save}>
  <div className="panelhead"><h2>Edit application before approval</h2><span className="pill">Admin editing</span></div>
  <p className="muted">Correct the applicant's form or upload documents on their behalf. Existing files remain private. New uploads replace the document shown on this application.</p>
  <div className="cards">
   <div><label style={label}>Full legal name</label><input required style={input} value={form.full_name} onChange={e=>field("full_name",e.target.value)}/></div>
   <div><label style={label}>Email address</label><input required type="email" style={input} value={form.email} onChange={e=>field("email",e.target.value)}/></div>
   <div><label style={label}>Phone / WhatsApp</label><input required style={input} value={form.phone} onChange={e=>field("phone",e.target.value)}/></div>
   <div><label style={label}>County</label><input required style={input} value={form.county} onChange={e=>field("county",e.target.value)}/></div>
   <div><label style={label}>Town / area</label><input style={input} value={form.town} onChange={e=>field("town",e.target.value)}/></div>
   <div><label style={label}>Languages / communication skills</label><input style={input} value={form.communication_skills} onChange={e=>field("communication_skills",e.target.value)}/></div>
   <div><label style={label}>Previous experience</label><textarea rows={3} style={input} value={form.experience} onChange={e=>field("experience",e.target.value)}/></div>
   <div><label style={label}>Why they want to become an agent</label><textarea rows={3} style={input} value={form.motivation} onChange={e=>field("motivation",e.target.value)}/></div>
  </div>
  <div style={{display:"grid",gap:12,marginTop:18}}>
   <div><label style={label}>Add / replace passport-size photo</label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]??null)}/><small className="muted">{photo?photo.name:application.passport_photo_path?"Current photo will be kept unless a new one is selected.":"No photo uploaded yet."}</small></div>
   <div><label style={label}>Add / replace National ID image (front)</label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setNationalId(e.target.files?.[0]??null)}/><small className="muted">{nationalId?nationalId.name:application.national_id_image_path?"Current ID image will be kept unless a new one is selected.":"No ID image uploaded yet."}</small></div>
  </div>
  <div style={{display:"grid",gap:10,marginTop:18}}>
   <label><input type="checkbox" checked={form.age_confirmed} onChange={e=>field("age_confirmed",e.target.checked)}/> Applicant is confirmed to be 18 or older</label>
   <label><input type="checkbox" checked={form.smartphone_access} onChange={e=>field("smartphone_access",e.target.checked)}/> Has access to a smartphone</label>
   <label><input type="checkbox" checked={form.internet_access} onChange={e=>field("internet_access",e.target.checked)}/> Has regular internet access</label>
  </div>
  {message&&<div className={message.startsWith("Application details saved")?"success":"error"} role="status" style={{marginTop:14}}>{message}</div>}
  <button className="btn" disabled={busy} style={{marginTop:16}}>{busy?"Saving securely…":"Save application changes"}</button>
 </form>;
}
