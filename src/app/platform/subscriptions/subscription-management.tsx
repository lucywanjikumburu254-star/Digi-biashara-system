"use client";
import {useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import SubscriptionActions from "./subscription-actions";

type Sub=Record<string,any>;
const fmt=(v?:string)=>v?new Date(v).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Nairobi"}):"—";
const localInput=(v?:string)=>{if(!v)return "";const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
export default function SubscriptionManagement({initial}:{initial:Sub[]}){
 const [rows,setRows]=useState(initial);
 const [selected,setSelected]=useState<string[]>([]);
 const [schedule,setSchedule]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [trialDays,setTrialDays]=useState("30");
 const [trialEnd,setTrialEnd]=useState<Record<string,string>>({});
 const db=useMemo(()=>createClient(),[]);
 const counts={all:rows.length,active:rows.filter(x=>x.status==="active").length,trial:rows.filter(x=>x.status==="trial").length,suspended:rows.filter(x=>x.status==="suspended").length};
 const refresh=async()=>{const {data,error}=await db.from("business_subscriptions").select("id,business_id,status,plan_code,monthly_fee,trial_days,trial_starts_at,trial_ends_at,due_at,current_period_ends_at,scheduled_suspend_at,reminder_sent_at,suspended_at,business:businesses(name,location,status)").order("created_at",{ascending:false}).limit(300);if(error)throw error;setRows(data??[]);};
 async function saveTrial(row:Sub){setBusy(true);setError("");setMessage("");try{const days=Math.max(0,Math.min(365,Number(trialDays||row.trial_days||30)));const end=trialEnd[row.business_id]||localInput(row.trial_ends_at);if(!end)throw new Error("Choose the trial end date and time.");const {error}=await db.from("business_subscriptions").update({trial_days:days,trial_ends_at:new Date(end).toISOString(),updated_at:new Date().toISOString()}).eq("business_id",row.business_id);if(error)throw error;setMessage("Trial limit saved for "+(row.business?.name??"business")+".");await refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to save trial.");}finally{setBusy(false);}}
 async function scheduleSelected(){setBusy(true);setError("");setMessage("");try{if(!selected.length)throw new Error("Select at least one business.");if(!schedule)throw new Error("Choose the suspension date and time.");const at=new Date(schedule);if(at<=new Date())throw new Error("Suspension time must be in the future.");const {error}=await db.from("business_subscriptions").update({scheduled_suspend_at:at.toISOString(),reminder_sent_at:null,suspension_reason:"Scheduled by platform administrator",updated_at:new Date().toISOString()}).in("business_id",selected);if(error)throw error;setMessage("Suspension schedule saved for "+selected.length+" businesses. Reminder will be created 24 hours before.");setSelected([]);await refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to schedule suspension.");}finally{setBusy(false);}}
 async function action(row:Sub,action:string){setBusy(true);setError("");setMessage("");try{if(action==="suspend"||action==="reactivate"){const {error}=await db.rpc("platform_set_subscription_status",{p_business_id:row.business_id,p_status:action==="suspend"?"suspended":"active",p_due_at:null,p_reason:"Updated in platform subscription control"});if(error)throw error;}else if(action==="clear"){const {error}=await db.from("business_subscriptions").update({scheduled_suspend_at:null,reminder_sent_at:null,suspension_reason:null,updated_at:new Date().toISOString()}).eq("business_id",row.business_id);if(error)throw error;}setMessage("Subscription updated.");await refresh();}catch(e){setError(e instanceof Error?e.message:"Action failed.");}finally{setBusy(false);}}
 return <div>
  <div className="stats">
   <div className="stat"><span>Total businesses</span><strong>{counts.all}</strong></div><div className="stat"><span>Active accounts</span><strong>{counts.active}</strong></div><div className="stat"><span>Trial accounts</span><strong>{counts.trial}</strong></div><div className="stat"><span>Suspended</span><strong>{counts.suspended}</strong></div>
  </div>
  {message&&<div className="success">{message}</div>}{error&&<div className="error" role="alert">{error}</div>}
  <div className="panel">
   <div className="panelhead"><div><h2>Schedule automatic suspension</h2><p className="muted" style={{fontSize:12,margin:"5px 0 0"}}>Choose a shared date and time for selected businesses. Time is East Africa Time (EAT).</p></div></div>
   <div className="schedule-grid"><label className="field"><span>Suspension date and time (EAT)</span><input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label><label className="field"><span>Trial length in days (for individual updates)</span><input type="number" min="0" max="365" value={trialDays} onChange={e=>setTrialDays(e.target.value)}/></label></div>
   <div className="notice-info">Selected businesses receive an in-app payment reminder 24 hours before suspension. When the scheduled time arrives, the system automatically suspends their workspace. Their saved business data is retained.</div>
   <div className="schedule-actions"><label><input type="checkbox" checked={selected.length===rows.filter(x=>x.status!=="suspended").length&&selected.length>0} onChange={e=>setSelected(e.target.checked?rows.filter(x=>x.status!=="suspended").map(x=>x.business_id):[])}/> Select all eligible ({rows.filter(x=>x.status!=="suspended").length})</label><button className="btn" disabled={busy||!selected.length} onClick={()=>void scheduleSelected()}>▦ Save schedule for {selected.length}</button></div>
  </div>
  <div className="panel">
   <div className="panelhead"><h2>Subscription management</h2><button className="btn secondary small" disabled={busy} onClick={()=>void refresh()}>Refresh</button></div>
   <div className="table-wrap"><table className="table"><thead><tr><th>Select</th><th>Business</th><th>Registered</th><th>Trial ends</th><th>Status</th><th>Scheduled suspension</th><th>Actions</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>
    <td><input aria-label={"Select "+row.business?.name} type="checkbox" checked={selected.includes(row.business_id)} disabled={row.status==="suspended"} onChange={e=>setSelected(v=>e.target.checked?[...v,row.business_id]:v.filter(x=>x!==row.business_id))}/></td>
    <td><strong>{row.business?.name??"Business"}</strong><small>{row.business?.location??""}</small></td>
    <td>{fmt(row.trial_starts_at)}</td>
    <td><div>{fmt(row.trial_ends_at)}</div><div className="trial-edit"><input aria-label="Trial end date" type="datetime-local" value={trialEnd[row.business_id]??localInput(row.trial_ends_at)} onChange={e=>setTrialEnd(v=>({...v,[row.business_id]:e.target.value}))}/><button className="btn secondary small" disabled={busy} onClick={()=>void saveTrial(row)}>Save trial</button></div></td>
    <td><span className={"pill "+(row.status==="suspended"?"off":row.status==="payment_due"||row.status==="grace_period"?"warn":"")}>{row.status}</span></td>
    <td>{fmt(row.scheduled_suspend_at)}{row.reminder_sent_at&&<small>Reminder sent</small>}</td>
    <td><div className="row-actions"><button className="btn secondary small" disabled={busy} onClick={()=>void action(row,row.status==="suspended"?"reactivate":"suspend")}>{row.status==="suspended"?"Reactivate":"Suspend now"}</button>{row.scheduled_suspend_at&&<button className="btn secondary small" disabled={busy} onClick={()=>void action(row,"clear")}>Clear schedule</button>}<SubscriptionActions businessId={row.business_id} status={row.status} hideStatus/></div></td>
   </tr>)}</tbody></table>{!rows.length&&<div className="empty">No subscription records found.</div>}</div>
  </div>
 </div>;
}
