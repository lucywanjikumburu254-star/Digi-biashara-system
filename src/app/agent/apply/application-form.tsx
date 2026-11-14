"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
const counties=["Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"];
const bucket="agent-application-documents";
const maxFileSize=5*1024*1024;
function validImage(file:File){return ["image/jpeg","image/png","image/webp"].includes(file.type)&&file.size<=maxFileSize;}
export default function AgentApplicationForm(){
 const [form,setForm]=useState({full_name:"",email:"",phone:"",county:"",town:"",communication_skills:"",experience:"",motivation:"",age_confirmed:false,smartphone_access:false,internet_access:false});
 const [photo,setPhoto]=useState<File|null>(null);const [nationalId,setNationalId]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState(false);
 function set<K extends keyof typeof form>(key:K,value:(typeof form)[K]){setForm(old=>({...old,[key]:value}));}
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   if(!photo||!nationalId)throw new Error("Upload both your passport-size photograph and National ID image.");
   if(!validImage(photo)||!validImage(nationalId))throw new Error("Use JPG, PNG or WebP images. Each file must be 5 MB or smaller.");
   const s=createClient();const applicationId=crypto.randomUUID();
   const photoPath=applicationId+"/passport-photo.jpg";const idPath=applicationId+"/national-id.jpg";
   const photoUpload=await s.storage.from(bucket).upload(photoPath,photo,{contentType:photo.type,upsert:false});
   if(photoUpload.error)throw photoUpload.error;
   const idUpload=await s.storage.from(bucket).upload(idPath,nationalId,{contentType:nationalId.type,upsert:false});
   if(idUpload.error){await s.storage.from(bucket).remove([photoPath]);throw idUpload.error;}
   const {error}=await s.from("agent_applications").insert({...form,id:applicationId,email:form.email.trim().toLowerCase(),passport_photo_path:photoPath,national_id_image_path:idPath});
   if(error){await s.storage.from(bucket).remove([photoPath,idPath]);throw error;}
   setSuccess(true);
  }catch(e){setError(e instanceof Error?e.message:"Unable to submit application. Please try again.");}
  finally{setBusy(false);}
 }
 if(success)return <div className="success" role="status"><h2>Application received!</h2><p>Your application and identity documents have been submitted securely. Our team will review them and contact you using the details provided. Your agent ID is created only after approval.</p></div>;
 return <form onSubmit={submit}>
  <div className="cards">
   <div className="field"><label>Full name (as shown on National ID)</label><input required minLength={2} value={form.full_name} onChange={e=>set("full_name",e.target.value)}/></div>
   <div className="field"><label>Email address</label><input required type="email" value={form.email} onChange={e=>set("email",e.target.value)}/></div>
   <div className="field"><label>Phone / WhatsApp number</label><input required type="tel" value={form.phone} onChange={e=>set("phone",e.target.value)}/></div>
   <div className="field"><label>County</label><select required value={form.county} onChange={e=>set("county",e.target.value)}><option value="">Select county</option>{counties.map(c=><option key={c}>{c}</option>)}</select></div>
   <div className="field"><label>Town / area</label><input value={form.town} onChange={e=>set("town",e.target.value)}/></div>
   <div className="field"><label>Communication skills / languages</label><input placeholder="e.g. English, Kiswahili" value={form.communication_skills} onChange={e=>set("communication_skills",e.target.value)}/></div>
   <div className="field"><label>Previous sales or business experience</label><textarea rows={3} value={form.experience} onChange={e=>set("experience",e.target.value)}/></div>
   <div className="field"><label>Why would you like to become an agent?</label><textarea required rows={3} value={form.motivation} onChange={e=>set("motivation",e.target.value)}/></div>
  </div>
  <div className="panel" style={{marginTop:16}}>
   <h3>Identity verification documents</h3>
   <p className="muted">Upload clear images. JPG, PNG or WebP; maximum 5 MB each. These files are private and visible only to authorised company administrators.</p>
   <div className="field"><label>Passport-size photograph *</label><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]??null)}/>{photo&&<small className="muted">{photo.name}</small>}</div>
   <div className="field" style={{marginTop:12}}><label>National ID image (front side) *</label><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setNationalId(e.target.files?.[0]??null)}/>{nationalId&&<small className="muted">{nationalId.name}</small>}</div>
  </div>
  <div className="panel" style={{marginTop:16}}>
   <label><input type="checkbox" required checked={form.age_confirmed} onChange={e=>set("age_confirmed",e.target.checked)}/> I confirm that I am 18 years or older.</label>
   <label style={{display:"block",marginTop:12}}><input type="checkbox" required checked={form.smartphone_access} onChange={e=>set("smartphone_access",e.target.checked)}/> I have access to a smartphone.</label>
   <label style={{display:"block",marginTop:12}}><input type="checkbox" required checked={form.internet_access} onChange={e=>set("internet_access",e.target.checked)}/> I have regular internet access.</label>
   <label style={{display:"block",marginTop:12}}><input type="checkbox" required/> I confirm that the documents belong to me and consent to Digital Kingdom Solutions using them for agent application review, identity verification and agent administration.</label>
  </div>
  {error&&<p className="error">{error}</p>}
  <button className="btn" disabled={busy}>{busy?"Submitting securely…":"Submit application"}</button>
 </form>;
}
