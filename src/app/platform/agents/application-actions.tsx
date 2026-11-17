"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

export default function ApplicationActions({id,status,hasPassport,hasNationalId,ageConfirmed}:{id:string;status:string;hasPassport:boolean;hasNationalId:boolean;ageConfirmed:boolean}){
 const[passportChecked,setPassportChecked]=useState(false);
 const[idChecked,setIdChecked]=useState(false);
 const[busy,setBusy]=useState(false);
 const[msg,setMsg]=useState("");
 const documentsReady=hasPassport&&hasNationalId&&passportChecked&&idChecked&&ageConfirmed;
 async function update(next:"reviewing"|"approved"|"rejected"){
  if(next==="approved"&&!documentsReady){setMsg("Open and verify both identity documents before approving.");return;}
  if(next==="rejected"&&!window.confirm("Reject this agent application? The application record and uploaded documents will be retained."))return;
  setBusy(true);setMsg("");
  try{
   const s=createClient();
   const{data:{user}}=await s.auth.getUser();if(!user)throw new Error("Sign in again.");
   const{data:app,error:readError}=await s.from("agent_applications")
    .select("full_name,email,phone,county,town,agent_code,status,age_confirmed,passport_photo_path,national_id_image_path")
    .eq("id",id).single();
   if(readError||!app)throw readError??new Error("Application not found.");
   if(next==="approved"){
    if(app.status==="approved")throw new Error("This application has already been approved.");
    if(!app.passport_photo_path||!app.national_id_image_path)throw new Error("Both passport photo and National ID must be uploaded.");\n    if(!app.age_confirmed)throw new Error("Confirm that the applicant is 18 or older before approving.");
    const bucket=s.storage.from("agent-application-documents");
    const[photo,idImage]=await Promise.all([
     bucket.createSignedUrl(app.passport_photo_path,60),
     bucket.createSignedUrl(app.national_id_image_path,60)
    ]);
    if(photo.error||idImage.error)throw new Error("One or both identity documents could not be opened. Refresh the application and check the uploads.");
    const{data:account,error:accountError}=await s.functions.invoke("register-business",{body:{
     mode:"agent_account",email:app.email,password:app.phone,full_name:app.full_name,phone:app.phone,
     territory:[app.county,app.town].filter(Boolean).join(", "),agent_code:app.agent_code
    }});
    if(accountError)throw accountError;if(account?.error)throw new Error(account.error);
    const{error:updateError}=await s.from("agent_applications").update({
     status:"approved",linked_agent_user_id:account.id,reviewed_by:user.id,
     reviewed_at:new Date().toISOString(),approved_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq("id",id);
    if(updateError)throw updateError;
    setMsg("Application approved and agent login created. The agent can now sign in and change the temporary password.");
   }else{
    const{error}=await s.from("agent_applications").update({
     status:next,reviewed_by:user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq("id",id);
    if(error)throw error;
    setMsg(next==="rejected"?"Application rejected. Its record and documents remain available for audit.":"Application marked as under review.");
   }
  }catch(e){setMsg(e instanceof Error?e.message:"Update failed.");}
  finally{setBusy(false);}
 }
 if(status==="approved")return <div className="success" role="status">This application has already been approved. Use Agent records to manage the agent's access.</div>;
 return <section className="panel">
  <h2>Identity verification checklist</h2>
  <p className="muted">Open each full-size document, compare it with the applicant's details, then tick both confirmations. Approval remains locked until both documents are available and checked, and the applicant is confirmed to be 18 or older.</p>
  <label style={{display:"flex",gap:10,alignItems:"flex-start",margin:"14px 0"}}>
   <input type="checkbox" checked={passportChecked} disabled={!hasPassport||busy} onChange={e=>setPassportChecked(e.target.checked)}/>
   <span><strong>Passport photo reviewed</strong><small className="muted" style={{display:"block"}}>{hasPassport?"I have opened and checked the uploaded passport-size photograph.":"Passport photo is missing or unavailable."}</small></span>
  </label>
  <label style={{display:"flex",gap:10,alignItems:"flex-start",margin:"14px 0"}}>
   <input type="checkbox" checked={idChecked} disabled={!hasNationalId||busy} onChange={e=>setIdChecked(e.target.checked)}/>
   <span><strong>National ID reviewed</strong><small className="muted" style={{display:"block"}}>{hasNationalId?"I have opened and checked the uploaded National ID image.":"National ID image is missing or unavailable."}</small></span>
  </label>
  {!ageConfirmed&&<div className="error" role="alert">Age confirmation is not checked. Update the application form before approval.</div>}\n  {msg&&<div className={msg.startsWith("Application approved")?"success":"error"} role="status">{msg}</div>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:18}}>
   <button className="btn" disabled={busy||!documentsReady||!["pending","reviewing"].includes(status)} onClick={()=>update("approved")}>{busy?"Processing…":"Approve & create agent login"}</button>
   {status==="pending"&&<button className="btn secondary" disabled={busy} onClick={()=>update("reviewing")}>Mark under review</button>}
   <button className="btn secondary" disabled={busy||status==="rejected"} onClick={()=>update("rejected")}>Reject application</button>
  </div>
 </section>;
}
