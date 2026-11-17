"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

export default function AgentActions({id,status,profileId,profileStatus}:{id:string;status:string;profileId?:string|null;profileStatus?:string|null}){
 const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
 const removed=profileStatus==="revoked";
 async function change(next:"active"|"suspended"|"disabled"){
  if(next==="disabled"&&!window.confirm("Remove this agent? Their login access will be disabled immediately. Their agent record, documents, and business attribution will be retained."))return;
  setBusy(true);setMsg("");
  try{
   const s=createClient();
   const{error}=await s.rpc("platform_set_agent_status",{p_agent_user_id:id,p_status:next,p_reason:next==="disabled"?"Removed by platform administrator":next==="suspended"?"Suspended by platform administrator":"Reactivated by platform administrator"});
   if(error)throw error;
   if(profileId){
    const{error:profileError}=await s.from("platform_agent_profiles").update({status:next==="disabled"?"revoked":next,updated_at:new Date().toISOString()}).eq("id",profileId);
    if(profileError)throw new Error("Login access changed, but the agent record status could not be updated: "+profileError.message);
   }
   setMsg(next==="disabled"?"Agent removed. Access is disabled; the record has been retained.":"Agent status updated. Refresh to see the change.");
  }catch(e){setMsg(e instanceof Error?e.message:"Update failed.");}
  finally{setBusy(false);}
 }
 if(removed)return <div><span className="pill off">Removed</span><small className="muted" style={{display:"block"}}>Access revoked; history retained.</small></div>;
 return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
  {status==="active"?<button className="btn small secondary" disabled={busy} onClick={()=>change("disabled")}>{busy?"Saving…":"Remove agent"}</button>:<button className="btn small" disabled={busy} onClick={()=>change("active")}>{busy?"Saving…":"Reactivate"}</button>}
  {status==="active"&&<button className="btn small secondary" disabled={busy} onClick={()=>change("suspended")}>Suspend</button>}
  {msg&&<small className="muted" style={{display:"block",maxWidth:240}}>{msg}</small>}
 </div>;
}
