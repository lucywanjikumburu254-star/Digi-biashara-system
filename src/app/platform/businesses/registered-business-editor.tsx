"use client";
import { useState } from "react";

type Business = { id:string; name:string; category_id:string|null; location:string|null; phone:string|null; category?:{name:string}|null };
type Category = { id:string; name:string; group_id:string };
type Account = { account_type:"paybill"|"till"|"pochi"; account_number:string; shortcode?:string; environment?:"sandbox"|"production"; enabled:boolean; connection_status?:string; credentials_configured?:boolean };

export default function RegisteredBusinessEditor({ businesses, categories }: { businesses:Business[]; categories:Category[] }) {
 const [selected,setSelected]=useState<Business|null>(null);
 const [name,setName]=useState(""); const [category,setCategory]=useState(""); const [location,setLocation]=useState(""); const [phone,setPhone]=useState("");
 const [paybill,setPaybill]=useState(""); const [paybillEnabled,setPaybillEnabled]=useState(false); const [paybillEnv,setPaybillEnv]=useState<"sandbox"|"production">("sandbox"); const [paybillKey,setPaybillKey]=useState(""); const [paybillSecret,setPaybillSecret]=useState(""); const [paybillPasskey,setPaybillPasskey]=useState(""); const [paybillConfigured,setPaybillConfigured]=useState(false);
 const [till,setTill]=useState(""); const [shortcode,setShortcode]=useState(""); const [tillEnabled,setTillEnabled]=useState(false); const [tillEnv,setTillEnv]=useState<"sandbox"|"production">("sandbox"); const [tillKey,setTillKey]=useState(""); const [tillSecret,setTillSecret]=useState(""); const [tillPasskey,setTillPasskey]=useState(""); const [tillConfigured,setTillConfigured]=useState(false);
 const [pochi,setPochi]=useState(""); const [pochiEnabled,setPochiEnabled]=useState(false);
 const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");

 async function openEditor(b:Business) {
  setSelected(b); setName(b.name); setCategory(b.category_id??""); setLocation(b.location??""); setPhone(b.phone??"");
  setPaybill("");setPaybillEnabled(false);setPaybillEnv("sandbox");setPaybillKey("");setPaybillSecret("");setPaybillPasskey("");setPaybillConfigured(false);
  setTill("");setShortcode("");setTillEnabled(false);setTillEnv("sandbox");setTillKey("");setTillSecret("");setTillPasskey("");setTillConfigured(false);
  setPochi("");setPochiEnabled(false);setError("");setMessage("");setLoading(true);
  try {
   const response=await fetch("/api/business/payment-settings?business_id="+encodeURIComponent(b.id));
   const data=await response.json(); if(!response.ok) throw new Error(data.error||"Could not load payment settings.");
   for(const a of (data.accounts??[]) as Account[]) {
    if(a.account_type==="paybill"){setPaybill(a.account_number);setPaybillEnabled(a.enabled);setPaybillEnv(a.environment??"sandbox");setPaybillConfigured(Boolean(a.credentials_configured));}
    if(a.account_type==="till"){setTill(a.account_number);setShortcode(a.shortcode??"");setTillEnabled(a.enabled);setTillEnv(a.environment??"sandbox");setTillConfigured(Boolean(a.credentials_configured));}
    if(a.account_type==="pochi"){setPochi(a.account_number);setPochiEnabled(a.enabled);}
   }
  } catch(e){setError(e instanceof Error?e.message:"Could not load this business's settings.");}
  finally{setLoading(false);}
 }

 async function save(e:React.FormEvent) {
  e.preventDefault(); if(!selected)return; setBusy(true);setError("");setMessage("");
  try {
   const profile=await fetch("/api/platform/businesses/"+encodeURIComponent(selected.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,category_id:category,location,phone})});
   const profileData=await profile.json(); if(!profile.ok) throw new Error(profileData.error||"Business details could not be updated.");
   const accounts:Account[]=[
    {account_type:"paybill",account_number:paybill,enabled:paybillEnabled,environment:paybillEnv,...(paybillKey?{consumer_key:paybillKey}:{}),...(paybillSecret?{consumer_secret:paybillSecret}:{}),...(paybillPasskey?{passkey:paybillPasskey}:{})} as Account,
    {account_type:"till",account_number:till,shortcode,enabled:tillEnabled,environment:tillEnv,...(tillKey?{consumer_key:tillKey}:{}),...(tillSecret?{consumer_secret:tillSecret}:{}),...(tillPasskey?{passkey:tillPasskey}:{})} as Account,
    {account_type:"pochi",account_number:pochi,enabled:pochiEnabled}
   ];
   const payment=await fetch("/api/business/payment-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({business_id:selected.id,contact_phone:phone,accounts})});
   const paymentData=await payment.json(); if(!payment.ok) throw new Error(paymentData.error||"Business details saved, but payment settings could not be saved.");
   setMessage("Business details and payment methods updated. Refresh the page to see the latest business information.");
   setPaybillKey("");setPaybillSecret("");setPaybillPasskey("");setTillKey("");setTillSecret("");setTillPasskey("");
  } catch(e){setError(e instanceof Error?e.message:"Unable to save changes.");}
  finally{setBusy(false);}
 }

 return <div className="panel">
  <div className="panelhead"><h2>Registered businesses</h2><span className="muted">{businesses.length} accounts · select Edit to update</span></div>
  <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Business</th><th>Category</th><th>Location</th><th>Phone</th><th>Action</th></tr></thead><tbody>
   {businesses.map(b=><tr key={b.id}><td><strong>{b.name}</strong></td><td>{b.category?.name??"—"}</td><td>{b.location??"—"}</td><td>{b.phone??"—"}</td><td><button type="button" className="btn" onClick={()=>openEditor(b)}>Edit business</button></td></tr>)}
  </tbody></table>{!businesses.length&&<div className="empty">No businesses have been registered yet.</div>}</div>
  {selected&&<div role="dialog" aria-modal="true" aria-label={"Edit "+selected.name} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:20,overflowY:"auto"}}>
   <form className="panel" onSubmit={save} style={{width:"min(900px,100%)",margin:"20px auto",maxHeight:"none"}}>
    <div className="panelhead"><h2>Edit business: {selected.name}</h2><button type="button" className="btn secondary" onClick={()=>setSelected(null)}>Close</button></div>
    {loading&&<p className="muted">Loading saved payment settings…</p>}
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    <h3>Business details</h3><div className="cards">
     <div className="field"><label>Business name</label><input required value={name} onChange={e=>setName(e.target.value)}/></div>
     <div className="field"><label>Business category</label><select required value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
     <div className="field"><label>Town / location</label><input value={location} onChange={e=>setLocation(e.target.value)}/></div>
     <div className="field"><label>Business contact phone</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XXXXXXXX"/></div>
    </div>
    <h3 style={{marginTop:20}}>M-Pesa payment methods</h3><p className="muted" style={{fontSize:13}}>Existing credentials remain securely stored when the credential boxes are left blank. Enter new credentials only when replacing them.</p>
    <div className="panel" style={{marginTop:12}}>
     <div className="field"><label><input type="checkbox" checked={paybillEnabled} onChange={e=>setPaybillEnabled(e.target.checked)}/> Enable PayBill</label></div>
     <div className="cards"><div className="field"><label>PayBill number</label><input value={paybill} onChange={e=>setPaybill(e.target.value)}/></div><div className="field"><label>Environment</label><select value={paybillEnv} onChange={e=>setPaybillEnv(e.target.value as "sandbox"|"production")}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
      <div className="field"><label>Consumer Key {paybillConfigured?"(configured; blank keeps current)":""}</label><input type="password" autoComplete="new-password" value={paybillKey} onChange={e=>setPaybillKey(e.target.value)}/></div><div className="field"><label>Consumer Secret</label><input type="password" autoComplete="new-password" value={paybillSecret} onChange={e=>setPaybillSecret(e.target.value)}/></div><div className="field"><label>Lipa na M-Pesa Passkey</label><input type="password" autoComplete="new-password" value={paybillPasskey} onChange={e=>setPaybillPasskey(e.target.value)}/></div>
     </div>
    </div>
    <div className="panel" style={{marginTop:12}}>
     <div className="field"><label><input type="checkbox" checked={tillEnabled} onChange={e=>setTillEnabled(e.target.checked)}/> Enable Till / Buy Goods</label></div>
     <div className="cards"><div className="field"><label>Customer-facing Till number</label><input value={till} onChange={e=>setTill(e.target.value)}/></div><div className="field"><label>Store / Head Office shortcode</label><input value={shortcode} onChange={e=>setShortcode(e.target.value)}/></div><div className="field"><label>Environment</label><select value={tillEnv} onChange={e=>setTillEnv(e.target.value as "sandbox"|"production")}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
      <div className="field"><label>Consumer Key {tillConfigured?"(configured; blank keeps current)":""}</label><input type="password" autoComplete="new-password" value={tillKey} onChange={e=>setTillKey(e.target.value)}/></div><div className="field"><label>Consumer Secret</label><input type="password" autoComplete="new-password" value={tillSecret} onChange={e=>setTillSecret(e.target.value)}/></div><div className="field"><label>Lipa na M-Pesa Passkey</label><input type="password" autoComplete="new-password" value={tillPasskey} onChange={e=>setTillPasskey(e.target.value)}/></div>
     </div>
    </div>
    <div className="panel" style={{marginTop:12}}><div className="field"><label><input type="checkbox" checked={pochiEnabled} onChange={e=>setPochiEnabled(e.target.checked)}/> Enable Pochi la Biashara</label></div><div className="field"><label>Pochi registered phone number</label><input value={pochi} onChange={e=>setPochi(e.target.value)} placeholder="07XXXXXXXX"/></div></div>
    <div style={{display:"flex",gap:10,marginTop:18}}><button className="btn" disabled={busy||loading}>{busy?"Saving…":"Save all changes"}</button><button type="button" className="btn secondary" onClick={()=>setSelected(null)}>Close</button></div>
   </form>
  </div>}
 </div>;
}
