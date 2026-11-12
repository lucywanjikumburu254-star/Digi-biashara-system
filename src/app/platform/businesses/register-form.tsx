"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Group={id:string;name:string};
type Category={id:string;group_id:string;name:string};
type Agent={user_id:string;full_name:string;agent_code:string|null};

export default function RegisterBusinessForm({groups,categories,agents}:{groups:Group[];categories:Category[];agents:Agent[]}){
 const [ownerEmail,setOwnerEmail]=useState("");
 const [ownerPassword,setOwnerPassword]=useState("");
 const [ownerName,setOwnerName]=useState("");
 const [business,setBusiness]=useState("");
 const [group,setGroup]=useState("");
 const [category,setCategory]=useState("");
 const [location,setLocation]=useState("");
 const [phone,setPhone]=useState("");
 const [agent,setAgent]=useState("");
 const [fee,setFee]=useState("3000");
 const [paybillEnabled,setPaybillEnabled]=useState(false);
 const [paybill,setPaybill]=useState("");
 const [paybillEnvironment,setPaybillEnvironment]=useState("sandbox");
 const [paybillKey,setPaybillKey]=useState("");
 const [paybillSecret,setPaybillSecret]=useState("");
 const [paybillPasskey,setPaybillPasskey]=useState("");
 const [tillEnabled,setTillEnabled]=useState(false);
 const [till,setTill]=useState("");
 const [tillShortcode,setTillShortcode]=useState("");
 const [tillEnvironment,setTillEnvironment]=useState("sandbox");
 const [tillKey,setTillKey]=useState("");
 const [tillSecret,setTillSecret]=useState("");
 const [tillPasskey,setTillPasskey]=useState("");
 const [pochiEnabled,setPochiEnabled]=useState(false);
 const [pochiPhone,setPochiPhone]=useState("");
 const [authorised,setAuthorised]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);

 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   const hasCredentials=Boolean(paybillKey||paybillSecret||paybillPasskey||tillKey||tillSecret||tillPasskey);
   if(hasCredentials&&!authorised) throw new Error("Confirm that the business owner has authorised you to enter their Daraja credentials.");
   const s=createClient();
   const {data,error}=await s.functions.invoke("register-business",{body:{
    mode:"platform_business",email:ownerEmail,password:ownerPassword,full_name:ownerName,
    business_name:business,category_id:category,location,phone,agent_user_id:agent,monthly_fee:Number(fee)
   }});
   if(error)throw error;
   if(data?.error)throw new Error(data.error);
   const accounts=[
    {account_type:"paybill",account_number:paybill,enabled:paybillEnabled,environment:paybillEnvironment,consumer_key:paybillKey,consumer_secret:paybillSecret,passkey:paybillPasskey},
    {account_type:"till",account_number:till,shortcode:tillShortcode,enabled:tillEnabled,environment:tillEnvironment,consumer_key:tillKey,consumer_secret:tillSecret,passkey:tillPasskey},
    {account_type:"pochi",account_number:pochiPhone,enabled:pochiEnabled}
   ];
   const hasPaymentSetup=Boolean(phone||paybillEnabled||paybill||tillEnabled||till||pochiEnabled||pochiPhone||hasCredentials);
   let paymentMessage="Payment setup can be completed later by the business owner in Settings → Payment methods.";
   if(hasPaymentSetup){
    const response=await fetch("/api/business/payment-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({business_id:data.id,contact_phone:phone,accounts})});
    const result=await response.json();
    if(!response.ok) paymentMessage="Business created, but payment setup needs attention: "+(result.error||"Unable to save the payment details.");
    else paymentMessage="Business payment details saved securely.";
   }
   setMessage("Business created. Business ID: "+data.id+(data.account_created?" Owner login created.":" Existing owner login linked.")+" "+paymentMessage);
   setOwnerEmail("");setOwnerPassword("");setOwnerName("");setBusiness("");setGroup("");setCategory("");setLocation("");setPhone("");setAgent("");
   setPaybillEnabled(false);setPaybill("");setPaybillKey("");setPaybillSecret("");setPaybillPasskey("");
   setTillEnabled(false);setTill("");setTillShortcode("");setTillKey("");setTillSecret("");setTillPasskey("");
   setPochiEnabled(false);setPochiPhone("");setAuthorised(false);
  }catch(e){setError(e instanceof Error?e.message:"Unable to register business.");}
  finally{setBusy(false);}
 }

 return <form className="panel" onSubmit={submit}>
  <div className="panelhead"><h2>Register a business</h2><span className="pill">Admin only</span></div>
  <p className="muted" style={{fontSize:13}}>Create the owner login here if they are new (ask the owner to choose and enter their password), or leave the password blank to link an existing account. This action creates the business and assigns ownership.</p>
  {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
  <div className="cards" style={{marginTop:12}}>
   <div className="field"><label>Owner account email</label><input type="email" required value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)} placeholder="owner@example.com"/></div>
   <div className="field"><label>Owner password (only for a new login)</label><input type="password" minLength={8} value={ownerPassword} onChange={e=>setOwnerPassword(e.target.value)} placeholder="Ask the owner to enter their password"/></div>
   <div className="field"><label>Owner full name</label><input required value={ownerName} onChange={e=>setOwnerName(e.target.value)}/></div>
   <div className="field"><label>Business name</label><input required value={business} onChange={e=>setBusiness(e.target.value)}/></div>
   <div className="field"><label>Business group</label><select required value={group} onChange={e=>{setGroup(e.target.value);setCategory("");}}><option value="">Select group</option>{groups.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
   <div className="field"><label>Business category</label><select required value={category} onChange={e=>setCategory(e.target.value)} disabled={!group}><option value="">Select category</option>{categories.filter(x=>x.group_id===group).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
   <div className="field"><label>Town / location</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Gilgil"/></div>
   <div className="field"><label>Business phone</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XXXXXXXX"/></div>
   <div className="field"><label>Agent attribution (optional)</label><select value={agent} onChange={e=>setAgent(e.target.value)}><option value="">Direct registration</option>{agents.map(x=><option key={x.user_id} value={x.user_id}>{x.full_name} · {x.agent_code}</option>)}</select></div>
   <div className="field"><label>Monthly subscription (KSh)</label><input type="number" min="0" step="0.01" required value={fee} onChange={e=>setFee(e.target.value)}/></div>
  </div>
  <div className="panel" style={{marginTop:16}}>
   <div className="panelhead"><h2>M-Pesa payment setup (optional)</h2><span className="pill">During registration</span></div>
   <p className="muted" style={{fontSize:13}}>Add the business's own Till, PayBill or Pochi details. Daraja credentials are encrypted before storage. Only enter credentials with the owner's permission.</p>
   <div className="field"><label><input type="checkbox" checked={paybillEnabled} onChange={e=>setPaybillEnabled(e.target.checked)}/> Enable M-Pesa PayBill</label></div>
   <div className="cards">
    <div className="field"><label>PayBill number</label><input value={paybill} onChange={e=>setPaybill(e.target.value)} placeholder="4–7 digit PayBill"/></div>
    <div className="field"><label>PayBill Daraja environment</label><select value={paybillEnvironment} onChange={e=>setPaybillEnvironment(e.target.value)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
    <div className="field"><label>PayBill Consumer Key</label><input type="password" autoComplete="new-password" value={paybillKey} onChange={e=>setPaybillKey(e.target.value)}/></div>
    <div className="field"><label>PayBill Consumer Secret</label><input type="password" autoComplete="new-password" value={paybillSecret} onChange={e=>setPaybillSecret(e.target.value)}/></div>
    <div className="field"><label>PayBill Lipa na M-Pesa Passkey</label><input type="password" autoComplete="new-password" value={paybillPasskey} onChange={e=>setPaybillPasskey(e.target.value)}/></div>
   </div>
   <div className="field" style={{marginTop:12}}><label><input type="checkbox" checked={tillEnabled} onChange={e=>setTillEnabled(e.target.checked)}/> Enable M-Pesa Till / Buy Goods</label></div>
   <div className="cards">
    <div className="field"><label>Customer-facing Till number</label><input value={till} onChange={e=>setTill(e.target.value)} placeholder="4–7 digit Till"/></div>
    <div className="field"><label>Store / Head Office shortcode</label><input value={tillShortcode} onChange={e=>setTillShortcode(e.target.value)} placeholder="Safaricom Store / HO shortcode"/></div>
    <div className="field"><label>Till Daraja environment</label><select value={tillEnvironment} onChange={e=>setTillEnvironment(e.target.value)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
    <div className="field"><label>Till Consumer Key</label><input type="password" autoComplete="new-password" value={tillKey} onChange={e=>setTillKey(e.target.value)}/></div>
    <div className="field"><label>Till Consumer Secret</label><input type="password" autoComplete="new-password" value={tillSecret} onChange={e=>setTillSecret(e.target.value)}/></div>
    <div className="field"><label>Till Lipa na M-Pesa Passkey</label><input type="password" autoComplete="new-password" value={tillPasskey} onChange={e=>setTillPasskey(e.target.value)}/></div>
   </div>
   <div className="field" style={{marginTop:12}}><label><input type="checkbox" checked={pochiEnabled} onChange={e=>setPochiEnabled(e.target.checked)}/> Enable Pochi la Biashara</label></div>
   <div className="field"><label>Pochi registered phone number</label><input type="tel" value={pochiPhone} onChange={e=>setPochiPhone(e.target.value)} placeholder="07XXXXXXXX"/></div>
   <div className="field"><label><input type="checkbox" checked={authorised} onChange={e=>setAuthorised(e.target.checked)}/> The business owner has authorised me to enter these Daraja credentials.</label></div>
   <p className="muted" style={{fontSize:12}}>Pochi is saved as a manual payment option. Daraja STK Push requires the relevant business's own approved credentials. Production credentials should only be entered after Safaricom Go-Live approval.</p>
  </div>
  <button className="btn" disabled={busy||!groups.length||!categories.length}>{busy?"Registering…":"Create business account"}</button>
 </form>;
}
