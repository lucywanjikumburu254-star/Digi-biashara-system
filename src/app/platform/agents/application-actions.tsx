"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
export default function ApplicationActions({id,status}:{id:string;status:string}){
 const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
 async function update(next:"reviewing"|"approved"|"rejected"){
  setBusy(true);setMsg("");
  try{
   const s=createClient();const{data:{user}}=await s.auth.getUser();
   if(!user)throw new Error("Sign in again.");
   if(next==="approved"){
    const{data,error}=await s.functions.invoke("approve-agent-application",{body:{application_id:id}});
    if(error)throw error;if(data?.error)throw new Error(data.error);
    setMsg("Approved. Agent login: registered email + phone number as temporary password. They must change it at first login.");
   }else{
    const{error}=await s.from("agent_applications").update({status:next,reviewed_by:user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    if(error)throw error;setMsg("Saved. Refresh the page to see the update.");
   }
  }catch(e){setMsg(e instanceof Error?e.message:"Update failed.");}
  finally{setBusy(false);}
 }
 return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
  {status==="pending"&&<button className="btn small secondary" disabled={busy} onClick={()=>update("reviewing")}>Review</button>}
  {["pending","reviewing"].includes(status)&&<button className="btn small" disabled={busy} onClick={()=>update("approved")}>Approve & create login</button>}
  {status!=="rejected"&&status!=="approved"&&<button className="btn small secondary" disabled={busy} onClick={()=>update("rejected")}>Reject</button>}
  {msg&&<small className="muted">{msg}</small>}
 </div>;
}