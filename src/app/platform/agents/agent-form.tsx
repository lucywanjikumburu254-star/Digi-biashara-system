"use client";
import {useState} from "react";import {createClient} from "@/lib/supabase/client";
export default function AgentCreateForm(){
 const[email,setEmail]=useState("");const[name,setName]=useState("");const[phone,setPhone]=useState("");const[territory,setTerritory]=useState("");const[code,setCode]=useState("");const[error,setError]=useState("");const[message,setMessage]=useState("");const[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");
  try{const s=createClient();const {data,error}=await s.functions.invoke("register-business",{body:{mode:"agent_account",email,password:phone,full_name:name,phone,territory,agent_code:code}});
   if(error)throw error;if(data?.error)throw new Error(data.error);
   setMessage("Agent account activated: "+data.id+(data.account_created?" Login created.":" Existing account linked and phone number set as temporary password."));
   setEmail("");setName("");setPhone("");setTerritory("");setCode("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to assign agent role.");}finally{setBusy(false);}
 }
 return <form className="panel" onSubmit={submit}><div className="panelhead"><h2>Register an agent</h2><span className="pill">Platform admin</span></div>
 <p className="muted" style={{fontSize:13}}>The registered phone number is used as the initial password for a newly created agent login. Agents must change it immediately after signing in.</p>
 {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
 <div className="cards" style={{marginTop:10}}>
  <div className="field"><label>Agent email (login)</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
  <div className="field"><label>Full name</label><input required value={name} onChange={e=>setName(e.target.value)}/></div>
  <div className="field"><label>Phone number (temporary password)</label><input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="e.g. 07XXXXXXXX"/></div>
  <div className="field"><label>Territory / town</label><input value={territory} onChange={e=>setTerritory(e.target.value)} placeholder="e.g. Gilgil"/></div>
  <div className="field"><label>Agent code (optional)</label><input value={code} onChange={e=>setCode(e.target.value)} placeholder="Auto-generated if blank"/></div>
 </div><button className="btn" disabled={busy}>{busy?"Saving agent…":"Create agent login"}</button></form>;
}