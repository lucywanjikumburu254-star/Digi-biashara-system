"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import BusinessNav from "@/components/business-nav";

type Row = Record<string, any>;
type Line = { description: string; quantity: string; unit_price: string };
const money = (n: unknown) => "KSh " + Number(n ?? 0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const dateNow = () => new Date().toISOString().slice(0,10);

export default function PaymentsWorkspace({businessId,businessName,categoryName}:{businessId:string;businessName:string;categoryName:string}) {
  const db=useMemo(()=>createClient(),[]);
  const [customers,setCustomers]=useState<Row[]>([]);
  const [suppliers,setSuppliers]=useState<Row[]>([]);
  const [branches,setBranches]=useState<Row[]>([]);
  const [invoices,setInvoices]=useState<Row[]>([]);
  const [purchases,setPurchases]=useState<Row[]>([]);
  const [payments,setPayments]=useState<Row[]>([]);
  const [allocations,setAllocations]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [tab,setTab]=useState<"invoices"|"receive"|"pay"|"cheques"|"history">("invoices");
  const [invoice,setInvoice]=useState({customer_id:"",branch_id:"",issue_date:dateNow(),due_date:"",notes:""});
  const [lines,setLines]=useState<Line[]>([{description:"",quantity:"1",unit_price:""}]);
  const [payment,setPayment]=useState({direction:"in",document_id:"",branch_id:"",party_id:"",amount:"",method:"cash",payment_date:new Date().toISOString().slice(0,16),reference:"",payer_payee:"",notes:"",cheque_number:"",cheque_bank:"",cheque_date:"",cheque_deposit_date:""});
  const [stkInvoice,setStkInvoice]=useState<Row|null>(null);
  const [stkPhone,setStkPhone]=useState("");
  const notify=(s:string)=>{setMessage(s);setError("");};
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [cu,su,br,iv,pu,pa,al]=await Promise.all([
        db.from("customers").select("id,name,phone").eq("business_id",businessId).order("name"),
        db.from("suppliers").select("id,name,phone").eq("business_id",businessId).order("name"),
        db.from("branches").select("id,name").eq("business_id",businessId).eq("status","active").order("name"),
        db.from("business_invoices").select("*,customers(name,phone),branches(name)").eq("business_id",businessId).order("created_at",{ascending:false}),
        db.from("purchases").select("id,purchase_number,total,created_at,supplier_id,suppliers(name),branches(name)").eq("business_id",businessId).eq("status","received").order("created_at",{ascending:false}),
        db.from("business_payments").select("*,customers(name),suppliers(name),branches(name)").eq("business_id",businessId).order("payment_date",{ascending:false}).limit(200),
        db.from("payment_allocations").select("id,payment_id,invoice_id,purchase_id,amount").eq("business_id",businessId)
      ]);
      for(const r of [cu,su,br,iv,pu,pa,al]) if(r.error) throw r.error;
      setCustomers(cu.data??[]);setSuppliers(su.data??[]);setBranches(br.data??[]);setInvoices(iv.data??[]);setPurchases(pu.data??[]);setPayments(pa.data??[]);setAllocations(al.data??[]);
    } catch(e){setError(e instanceof Error?e.message:"Unable to load payment records.");}
    finally{setLoading(false);}
  },[db,businessId]);
  useEffect(()=>{void load();},[load]);

  const confirmedByPayment=useMemo(()=>new Map(payments.map(p=>[p.id,p.status==="confirmed"])),[payments]);
  const paidForInvoice=(id:string)=>allocations.filter(a=>a.invoice_id===id&&confirmedByPayment.get(a.payment_id)).reduce((s,a)=>s+Number(a.amount),0);
  const paidForPurchase=(id:string)=>allocations.filter(a=>a.purchase_id===id&&confirmedByPayment.get(a.payment_id)).reduce((s,a)=>s+Number(a.amount),0);
  const total=lines.reduce((s,l)=>s+Math.max(0,Number(l.quantity)||0)*Math.max(0,Number(l.unit_price)||0),0);

  async function createInvoice(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      if(!invoice.customer_id) throw new Error("Choose a customer.");
      if(!lines.length||lines.some(l=>!l.description.trim()||Number(l.quantity)<=0||Number(l.unit_price)<0||!Number.isFinite(Number(l.quantity))||!Number.isFinite(Number(l.unit_price)))) throw new Error("Enter a description, quantity and valid unit price for every invoice line.");
      if(total<=0) throw new Error("Invoice total must be greater than zero.");
      const {data:{user}}=await db.auth.getUser();
      const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
      const number="INV-"+invoice.issue_date.replace(/-/g,"")+"-"+suffix;
      const {error:insertError}=await db.from("business_invoices").insert({
        business_id:businessId,branch_id:invoice.branch_id||null,customer_id:invoice.customer_id,invoice_number:number,
        issue_date:invoice.issue_date,due_date:invoice.due_date||null,currency_code:"KES",subtotal:total,discount:0,tax:0,total,
        items:lines.map(l=>({description:l.description.trim(),quantity:Number(l.quantity),unit_price:Number(l.unit_price),line_total:Number(l.quantity)*Number(l.unit_price)})),
        notes:invoice.notes||null,status:"issued",created_by:user?.id
      });
      if(insertError) throw insertError;
      setInvoice({customer_id:"",branch_id:"",issue_date:dateNow(),due_date:"",notes:""});setLines([{description:"",quantity:"1",unit_price:""}]);notify("Invoice created. You can now receive full or part-payments against it.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to create invoice.");}
    finally{setSaving(false);}
  }

  async function recordPayment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const amount=Number(payment.amount);
      if(!Number.isFinite(amount)||amount<=0) throw new Error("Enter a payment amount greater than zero.");
      if(payment.direction==="in"&&!payment.party_id) throw new Error("Choose the customer who paid.");
      if(payment.direction==="out"&&!payment.party_id) throw new Error("Choose the supplier who was paid.");
      if(payment.method==="cheque"&&!payment.cheque_number.trim()) throw new Error("Enter the cheque number.");
      const doc=payment.document_id;
      const allocation=doc?[{...(payment.direction==="in"?{invoice_id:doc}:{purchase_id:doc}),amount}]:[];
      const {data,error:rpcError}=await db.rpc("record_business_payment",{
        p_business_id:businessId,p_direction:payment.direction,p_payment_type:payment.direction==="in"?"customer_receipt":"supplier_payment",
        p_amount:amount,p_payment_method:payment.method,p_branch_id:payment.branch_id||null,
        p_customer_id:payment.direction==="in"?payment.party_id:null,p_supplier_id:payment.direction==="out"?payment.party_id:null,
        p_payment_date:new Date(payment.payment_date).toISOString(),p_external_reference:payment.reference||null,
        p_payer_payee:payment.payer_payee||null,p_notes:payment.notes||null,p_cheque_number:payment.cheque_number||null,
        p_cheque_bank:payment.cheque_bank||null,p_cheque_date:payment.cheque_date||null,p_cheque_deposit_date:payment.cheque_deposit_date||null,
        p_allocations:allocation,p_idempotency_key:null
      });
      if(rpcError) throw rpcError;
      setPayment({direction:payment.direction,document_id:"",branch_id:"",party_id:"",amount:"",method:"cash",payment_date:new Date().toISOString().slice(0,16),reference:"",payer_payee:"",notes:"",cheque_number:"",cheque_bank:"",cheque_date:"",cheque_deposit_date:""});
      notify("Payment recorded. Receipt number has been generated.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to record payment.");}
    finally{setSaving(false);}
  }

  async function startStkPush(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!stkInvoice) return;
    setSaving(true);setError("");setMessage("");
    try{
      const balance=Math.max(0,Number(stkInvoice.total)-paidForInvoice(stkInvoice.id));
      if(!Number.isSafeInteger(balance)||balance<=0) throw new Error("The outstanding invoice balance must be a whole KSh amount for M-Pesa STK Push.");
      const response=await fetch("/api/daraja/stk-push",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({invoice_id:stkInvoice.id,phone_number:stkPhone,amount:balance})
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"Unable to send the M-Pesa prompt.");
      notify("STK request accepted by Safaricom Sandbox. Ask the customer to check their phone and approve the test payment.");
      setStkInvoice(null);setStkPhone("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to start the M-Pesa payment.");}
    finally{setSaving(false);}
  }

  async function updateCheque(row:Row,status:"deposited"|"cleared"|"bounced"|"cancelled"){
    setSaving(true);setError("");setMessage("");
    try{
      const {error:e}=await db.from("business_payments").update({cheque_status:status,...(status==="deposited"?{cheque_deposit_date:dateNow()}:{})}).eq("id",row.id).eq("business_id",businessId);
      if(e) throw e;
      notify(status==="cleared"?"Cheque cleared and payment confirmed.":status==="bounced"?"Cheque marked as bounced.":"Cheque status updated.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to update cheque status.");}
    finally{setSaving(false);}
  }

  const openInvoices=invoices.filter(i=>i.status==="issued"&&Number(i.total)-paidForInvoice(i.id)>0.004);
  const openPurchases=purchases.filter(p=>Number(p.total)-paidForPurchase(p.id)>0.004);
  const outstandingInvoices=openInvoices.reduce((s,i)=>s+Number(i.total)-paidForInvoice(i.id),0);
  const outstandingSupplier=openPurchases.reduce((s,p)=>s+Number(p.total)-paidForPurchase(p.id),0);
  const received=payments.filter(p=>p.direction==="in"&&p.status==="confirmed").reduce((s,p)=>s+Number(p.amount),0);
  const paidOut=payments.filter(p=>p.direction==="out"&&p.status==="confirmed").reduce((s,p)=>s+Number(p.amount),0);
  const field=(label:string,control:ReactNode)=><label className="field"><span>{label}</span>{control}</label>;
  const select=(value:string,onChange:(v:string)=>void,options:{value:string;label:string}[],placeholder:string)=><select value={value} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;

  return <div className="layout"><BusinessNav active="payments"/><main className="main"><header className="dashhead"><strong>{businessName}</strong><span className="muted">{categoryName}</span></header><section className="dashcontent">
    <div className="eyebrow">Business finance</div><h1>Invoices & payments</h1><p className="sub">Create customer invoices, record payments, track supplier balances and manage cheques.</p>
    {message&&<div className="success">{message}</div>}{error&&<div className="error" role="alert">{error}</div>}
    <div className="stats"><div className="stat"><span>Customer balances</span><strong>{money(outstandingInvoices)}</strong><small>{openInvoices.length} unpaid invoices</small></div><div className="stat"><span>Supplier balances</span><strong>{money(outstandingSupplier)}</strong><small>{openPurchases.length} unpaid purchases</small></div><div className="stat"><span>Payments received</span><strong>{money(received)}</strong><small>Confirmed receipts</small></div><div className="stat"><span>Payments made</span><strong>{money(paidOut)}</strong><small>Confirmed outgoing</small></div></div>
    <div className="payment-tabs">{([["invoices","Invoices"],["receive","Receive payment"],["pay","Pay supplier"],["cheques","Cheque register"],["history","Payment history"]] as const).map(([key,label])=><button type="button" key={key} className={tab===key?"selected":""} onClick={()=>{setTab(key);if(key==="pay"||key==="receive")setPayment(p=>({...p,direction:key==="pay"?"out":"in",party_id:"",document_id:""}));}}>{label}</button>)}</div>
    {tab==="invoices"&&<><form className="panel workspace-form" onSubmit={createInvoice}><div className="panelhead"><div><h2>Create customer invoice</h2><p className="muted compact-help">This is a business invoice, separate from Digi Biashara subscription billing.</p></div></div><div className="form-grid">
      {field("Customer",select(invoice.customer_id,v=>setInvoice(p=>({...p,customer_id:v})),customers.map(c=>({value:c.id,label:c.name+(c.phone?" · "+c.phone:"")})),"Select customer"))}
      {field("Branch",select(invoice.branch_id,v=>setInvoice(p=>({...p,branch_id:v})),branches.map(b=>({value:b.id,label:b.name})),"All branches"))}
      {field("Issue date",<input type="date" value={invoice.issue_date} onChange={e=>setInvoice(p=>({...p,issue_date:e.target.value}))} required/>)}
      {field("Due date",<input type="date" min={invoice.issue_date} value={invoice.due_date} onChange={e=>setInvoice(p=>({...p,due_date:e.target.value}))}/>)}
    </div><div className="payment-lines"><div className="panelhead"><h3>Invoice items</h3><button type="button" className="btn secondary small" onClick={()=>setLines(v=>[...v,{description:"",quantity:"1",unit_price:""}])}>+ Add item</button></div>
      {lines.map((l,i)=><div className="payment-line" key={i}><label className="field"><span>Description</span><input value={l.description} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,description:e.target.value}:x))} required placeholder="Product or service"/></label><label className="field"><span>Qty</span><input type="number" min="0.01" step="0.01" value={l.quantity} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))} required/></label><label className="field"><span>Unit price (KSh)</span><input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,unit_price:e.target.value}:x))} required/></label><strong>{money(Number(l.quantity||0)*Number(l.unit_price||0))}</strong>{lines.length>1&&<button type="button" className="text-button" onClick={()=>setLines(v=>v.filter((_,j)=>j!==i))}>Remove</button>}</div>)}
      </div>{field("Notes",<input value={invoice.notes} onChange={e=>setInvoice(p=>({...p,notes:e.target.value}))} placeholder="Optional notes"/>)}
      <div className="payment-total"><span>Invoice total</span><strong>{money(total)}</strong></div><div className="form-actions"><button className="btn" disabled={saving}>{saving?"Saving…":"Create invoice"}</button></div></form>
      {stkInvoice&&<form className="panel workspace-form" onSubmit={startStkPush}>
        <div className="panelhead"><div><h2>Request M-Pesa payment</h2><p className="muted compact-help">{stkInvoice.invoice_number} · Outstanding {money(Number(stkInvoice.total)-paidForInvoice(stkInvoice.id))}</p></div><button type="button" className="btn secondary small" onClick={()=>setStkInvoice(null)}>Cancel</button></div>
        <label className="field"><span>Customer M-Pesa phone number</span><input type="tel" inputMode="tel" value={stkPhone} onChange={e=>setStkPhone(e.target.value)} placeholder="07XXXXXXXX or 2547XXXXXXXX" required/></label>
        <p className="muted compact-help">Sandbox only. This sends a test prompt; it does not charge a real customer.</p>
        <div className="form-actions"><button className="btn" disabled={saving}>{saving?"Sending…":"Send STK prompt"}</button></div>
      </form>}
      <div className="panel"><div className="panelhead"><h2>Customer invoices</h2><button className="btn secondary small" type="button" onClick={()=>void load()}>Refresh</button></div>{loading?<div className="empty">Loading…</div>:invoices.length===0?<div className="empty">No invoices yet. Create the first one above.</div>:<div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>M-Pesa</th></tr></thead><tbody>{invoices.map(i=>{const paid=paidForInvoice(i.id),balance=Math.max(0,Number(i.total)-paid),late=i.due_date&&i.due_date<dateNow()&&balance>0.004;return <tr key={i.id}><td><Link className="sale-link" href={"/admin/payments/invoice/"+i.id}>{i.invoice_number}</Link></td><td>{i.customers?.name??"—"}</td><td>{i.issue_date}</td><td>{i.due_date??"—"}</td><td>{money(i.total)}</td><td>{money(paid)}</td><td>{money(balance)}</td><td><span className={"pill "+(i.status==="void"?"off":balance<=0.004?"":"warn")}>{i.status==="void"?"Void":balance<=0.004?"Paid":late?"Overdue":paid>0?"Part-paid":"Unpaid"}</span></td><td><button type="button" className="btn secondary small" disabled={saving||balance<=0.004} onClick={()=>{setStkInvoice(i);setStkPhone(i.customers?.phone??"");}}>Request M-Pesa</button></td></tr>})}</tbody></table></div>}</div></>}
    {(tab==="receive"||tab==="pay")&&<form className="panel workspace-form" onSubmit={recordPayment}><div className="panelhead"><div><h2>{tab==="receive"?"Receive money from a customer":"Pay a supplier"}</h2><p className="muted compact-help">Record each actual payment separately. Part-payments are supported.</p></div></div>
      {field(tab==="receive"?"Customer":"Supplier",select(payment.party_id,v=>setPayment(p=>({...p,party_id:v,document_id:""})),(tab==="receive"?customers:suppliers).map(x=>({value:x.id,label:x.name})),"Choose party"))}
      {field("Allocate to document (optional)",select(payment.document_id,v=>setPayment(p=>({...p,document_id:v})),(tab==="receive"?openInvoices.filter(i=>i.customer_id===payment.party_id).map(i=>({value:i.id,label:i.invoice_number+" · balance "+money(Number(i.total)-paidForInvoice(i.id))})):openPurchases.filter(p=>p.supplier_id===payment.party_id).map(p=>({value:p.id,label:p.purchase_number+" · balance "+money(Number(p.total)-paidForPurchase(p.id))}))),"Leave unallocated"))}
      <div className="form-grid">{field("Branch",select(payment.branch_id,v=>setPayment(p=>({...p,branch_id:v})),branches.map(b=>({value:b.id,label:b.name})),"All branches"))}
      {field("Amount (KSh)",<input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e=>setPayment(p=>({...p,amount:e.target.value}))} required/>)}
      {field("Payment method",select(payment.method,v=>setPayment(p=>({...p,method:v})),["cash","mpesa","bank","card","cheque","other"].map(v=>({value:v,label:v.toUpperCase()})),"Choose method"))}
      {field("Payment date",<input type="datetime-local" value={payment.payment_date} onChange={e=>setPayment(p=>({...p,payment_date:e.target.value}))} required/>)}
      {field("Transaction / bank reference",<input value={payment.reference} onChange={e=>setPayment(p=>({...p,reference:e.target.value}))} placeholder="M-Pesa code or bank reference"/>)}
      {field("Payer / payee name",<input value={payment.payer_payee} onChange={e=>setPayment(p=>({...p,payer_payee:e.target.value}))} placeholder="Optional"/>)}</div>
      {payment.method==="cheque"&&<div className="form-grid">{field("Cheque number",<input value={payment.cheque_number} onChange={e=>setPayment(p=>({...p,cheque_number:e.target.value}))} required/>)}{field("Bank",<input value={payment.cheque_bank} onChange={e=>setPayment(p=>({...p,cheque_bank:e.target.value}))}/>)}{field("Cheque date",<input type="date" value={payment.cheque_date} onChange={e=>setPayment(p=>({...p,cheque_date:e.target.value}))}/>)}{field("Deposit date",<input type="date" value={payment.cheque_deposit_date} onChange={e=>setPayment(p=>({...p,cheque_deposit_date:e.target.value}))}/>)}</div>}
      {field("Notes",<input value={payment.notes} onChange={e=>setPayment(p=>({...p,notes:e.target.value}))} placeholder="Optional notes"/>)}
      <p className="muted compact-help">Cheques remain pending and are not counted as paid until you mark them cleared in the Cheque register.</p><div className="form-actions"><button className="btn" disabled={saving}>{saving?"Saving…":tab==="receive"?"Record customer payment":"Record supplier payment"}</button></div></form>}
    {tab==="cheques"&&<div className="panel"><div className="panelhead"><h2>Cheque register</h2><button className="btn secondary small" type="button" onClick={()=>void load()}>Refresh</button></div>{payments.filter(p=>p.payment_method==="cheque").length===0?<div className="empty">No cheques recorded yet.</div>:<div className="table-wrap"><table className="table"><thead><tr><th>Cheque</th><th>Party</th><th>Direction</th><th>Amount</th><th>Bank</th><th>Date</th><th>Status</th><th>Update</th></tr></thead><tbody>{payments.filter(p=>p.payment_method==="cheque").map(p=><tr key={p.id}><td>{p.cheque_number}<small>{p.receipt_number}</small></td><td>{p.customers?.name??p.suppliers?.name??p.payer_payee??"—"}</td><td>{p.direction==="in"?"Received":"Issued"}</td><td>{money(p.amount)}</td><td>{p.cheque_bank??"—"}</td><td>{p.cheque_date??"—"}</td><td><span className={"pill "+(p.cheque_status==="cleared"?"":p.cheque_status==="bounced"||p.cheque_status==="cancelled"?"off":"warn")}>{p.cheque_status}</span></td><td><div className="row-actions">{p.cheque_status==="received"&&<button className="btn secondary small" type="button" disabled={saving} onClick={()=>void updateCheque(p,"deposited")}>Deposit</button>}{["received","deposited"].includes(p.cheque_status)&&<button className="btn small" type="button" disabled={saving} onClick={()=>void updateCheque(p,"cleared")}>Clear</button>}{["received","deposited"].includes(p.cheque_status)&&<button className="btn secondary small" type="button" disabled={saving} onClick={()=>void updateCheque(p,"bounced")}>Bounced</button>}</div></td></tr>)}</tbody></table></div>}</div>}
    {tab==="history"&&<div className="panel"><div className="panelhead"><h2>Payment history</h2><button className="btn secondary small" type="button" onClick={()=>void load()}>Refresh</button></div>{payments.length===0?<div className="empty">No payments recorded yet.</div>:<div className="table-wrap"><table className="table"><thead><tr><th>Receipt</th><th>Date</th><th>Party</th><th>Type</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td><Link className="sale-link" href={"/admin/payments/receipt/"+p.id}>{p.receipt_number}</Link></td><td>{new Date(p.payment_date).toLocaleString("en-KE")}</td><td>{p.customers?.name??p.suppliers?.name??p.payer_payee??"—"}</td><td>{p.direction==="in"?"Received":"Paid"}</td><td>{p.payment_method.toUpperCase()}</td><td>{p.external_reference??p.cheque_number??"—"}</td><td>{money(p.amount)}</td><td><span className={"pill "+(p.status==="confirmed"?"":p.status==="failed"||p.status==="reversed"?"off":"warn")}>{p.status}</span></td></tr>)}</tbody></table></div>}</div>}
  </section></main></div>;
}
