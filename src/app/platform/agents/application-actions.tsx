"use client";
import {useState} from "react";import {createClient} from "@/lib/supabase/client";
export default function ApplicationActions({id,status}:{id:string;status:string}){
 const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
 async function update(next:"reviewing"|"approved"|"rejected"){
  setBusy(true);setMsg("");
  try{
   const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)throw new Error("Sign in again.");
   if(next==="approved"){
    const{data:app,error:readError}=await s.from("agent_applications").select("full_name,email,phone,county,town,agent_code").eq("id",id).single();
    if(readError||!app)throw readError??new Error("Application not found.");
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
    setMsg("Approved. Login email is the registered email. The registered phone number is now the temporary password. Change it immediately after signing in.");
   }else{
    const{error}=await s.from("agent_applications").update({status:next,reviewed_by:user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    if(error)throw error;setMsg("Saved. Refresh the page to see the update.");
   }
  }catch(e){setMsg(e instanceof Error?e.message:"Update failed.");}
  finally{setBusy(false);}
 }
 return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
  {status==="pending"&&<button className="btn small secondary" disabled={busy} onClick={()=>update("reviewing")}>Review</button>}
  {["pending","reviewing","approved"].includes(status)&&<button className="btn small" disabled={busy} onClick={()=>update("approved")}>{status==="approved"?"Create / link login":"Approve & create login"}</button>}
  {status!=="rejected"&&status!=="approved"&&<button className="btn small secondary" disabled={busy} onClick={()=>update("rejected")}>Reject</button>}
  {msg&&<small className="muted">{msg}</small>}
 </div>;
}