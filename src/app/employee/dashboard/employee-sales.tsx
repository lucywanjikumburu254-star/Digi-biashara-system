"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/components/brand-logo";

type Item = { id:string; name:string; selling_price:number; item_type:string; track_stock:boolean };
type Customer = { id:string; name:string; phone:string|null };
type Sale = { id:string; sale_number:string; created_at:string; total:number; amount_paid:number; balance:number; payment_method:string; mpesa_transaction_code?:string|null; customers?:{name:string}|{name:string}[]|null };

type View = "home" | "new-sale" | "sales" | "mpesa" | "profile";

const money=(value:number)=>"KSh "+Number(value??0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const methodName=(value:string)=>value?.startsWith("mpesa")?"M-Pesa":value==="cash"?"Cash":value==="card"?"Card":value==="bank"?"Bank":value==="credit"?"Credit":value||"—";

export default function EmployeeSales({businessId,branchId,branchName}:{businessId:string;branchId:string;branchName:string}) {
  const db=useMemo(()=>createClient(),[]);
  const [products,setProducts]=useState<Item[]>([]);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [sales,setSales]=useState<Sale[]>([]);
  const [productId,setProductId]=useState("");
  const [quantity,setQuantity]=useState("1");
  const [price,setPrice]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [paymentMethod,setPaymentMethod]=useState("cash");
  const [amountPaid,setAmountPaid]=useState("");
  const [mpesaCode,setMpesaCode]=useState("");
  const [notes,setNotes]=useState("");
  const [cart,setCart]=useState<{product_id:string;quantity:number;unit_price:number}[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [view,setView]=useState<View>("home");
  const [staffName,setStaffName]=useState("Team member");
  const [staffEmail,setStaffEmail]=useState("");
  const [userId,setUserId]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const [{data:{user}},p,c,s]=await Promise.all([
      db.auth.getUser(),
      db.from("products").select("id,name,selling_price,item_type,track_stock").eq("business_id",businessId).eq("is_active",true).order("name"),
      db.from("customers").select("id,name,phone").eq("business_id",businessId).order("name"),
      db.from("sales").select("id,sale_number,created_at,total,amount_paid,balance,payment_method,mpesa_transaction_code,customers(name)").eq("business_id",businessId).eq("branch_id",branchId).order("created_at",{ascending:false}).limit(40)
    ]);
    const failed=[p,c,s].find(x=>x.error);
    if(failed?.error) setError(failed.error.message);
    setProducts(p.data??[]);setCustomers(c.data??[]);setSales((s.data??[]) as Sale[]);
    if(user){setUserId(user.id);setStaffEmail(user.email??"");const {data:staff}=await db.from("business_staff").select("full_name,email").eq("business_id",businessId).eq("user_id",user.id).maybeSingle();if(staff?.full_name)setStaffName(staff.full_name);}
    setLoading(false);
  },[db,businessId,branchId]);

  useEffect(()=>{void load();},[load]);

  const todayKey=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Nairobi"});
  const todaySales=sales.filter(s=>new Date(s.created_at).toLocaleDateString("en-CA",{timeZone:"Africa/Nairobi"})===todayKey);
  const todayTotal=todaySales.reduce((sum,s)=>sum+Number(s.total??0),0);
  const todayPaid=todaySales.reduce((sum,s)=>sum+Number(s.amount_paid??0),0);
  const todayBalance=todaySales.reduce((sum,s)=>sum+Number(s.balance??0),0);
  const todayMpesa=todaySales.filter(s=>s.payment_method?.startsWith("mpesa")).reduce((sum,s)=>sum+Number(s.amount_paid??0),0);
  const mpesaSales=sales.filter(s=>s.payment_method?.startsWith("mpesa"));
  const subtotal=cart.reduce((sum,line)=>sum+line.quantity*line.unit_price,0);
  const selectedProduct=products.find(x=>x.id===productId);

  function addItem(){
    const product=selectedProduct,qty=Number(quantity),rate=Number(price||product?.selling_price||0);
    if(!product||qty<=0||rate<0||!Number.isFinite(qty)||!Number.isFinite(rate)){setError("Select an item and enter a valid quantity and price.");return;}
    setCart(lines=>[...lines,{product_id:product.id,quantity:qty,unit_price:rate}]);
    setProductId("");setQuantity("1");setPrice("");setError("");
  }

  async function completeSale(){
    if(!cart.length){setError("Add at least one product or service.");return;}
    if(paymentMethod==="mpesa"&&!/^[A-Z0-9]{6,20}$/.test(mpesaCode.trim().toUpperCase())){setError("Enter the M-Pesa transaction code from the customer's confirmation message.");return;}
    setSaving(true);setError("");setMessage("");
    try{
      if(paymentMethod==="mpesa"){
        const accountType=null;
        const response=await fetch("/api/daraja/manual-sale",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          business_id:businessId,branch_id:branchId,items:cart,customer_id:customerId||null,
          discount:0,tax:0,notes:notes||null,account_type:accountType,reference:mpesaCode.trim().toUpperCase()
        })});
        const payload=await response.json();
        if(!response.ok) throw new Error(payload.error||"Unable to save the M-Pesa sale.");
      }else{
        const {error:rpcError}=await db.rpc("record_sale",{
          p_business_id:businessId,p_branch_id:branchId,p_items:cart,
          p_customer_id:customerId||null,p_payment_method:paymentMethod,
          p_discount:0,p_tax:0,p_amount_paid:amountPaid===""?null:Number(amountPaid),
          p_notes:notes||null
        });
        if(rpcError) throw rpcError;
      }
      setCart([]);setCustomerId("");setPaymentMethod("cash");setAmountPaid("");setMpesaCode("");setNotes("");
      setMessage(paymentMethod==="mpesa"?"M-Pesa sale and transaction code recorded successfully. The code is saved with this sale; it is not independently verified by Safaricom.":"Sale completed successfully. Stock has been updated.");
      setView("home");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to complete this sale.");}
    finally{setSaving(false);}
  }

  const customerName=(s:Sale)=>Array.isArray(s.customers)?(s.customers[0]?.name??"Walk-in customer"):(s.customers?.name??"Walk-in customer");
  const dateLabel=(value:string)=>new Date(value).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Nairobi"});
  const recent=view==="mpesa"?mpesaSales:sales;
  const nav=(next:View)=>{setError("");setMessage("");setView(next);};

  function SaleRows(){return <div className="employee-sale-list">{recent.slice(0,12).map(s=><article className="employee-sale-row" key={s.id}>
    <div className="employee-sale-icon">▤</div><div className="employee-sale-main"><strong>#{s.sale_number}</strong><span>{dateLabel(s.created_at)}</span><small>{customerName(s)}</small>{s.mpesa_transaction_code&&<small className="employee-mpesa-code">Code: {s.mpesa_transaction_code}</small>}</div>
    <div className="employee-sale-right"><strong>{money(Number(s.total))}</strong><span className={"employee-status "+(Number(s.balance)>0?"pending":s.payment_method?.startsWith("mpesa")?"verified":"complete")}>{Number(s.balance)>0?"Balance due":s.payment_method?.startsWith("mpesa")?"Recorded":"Completed"}</span><small>{methodName(s.payment_method)}</small></div>
  </article>)}</div>}

  return <main className="employee-dashboard">
    <header className="employee-mobile-header">
      <BrandLogo className="employee-brand-logo" />
      <div className="employee-header-right"><span className="employee-online-dot"/> <span>Online</span><form action="/logout" method="post"><button type="submit" aria-label="Sign out">↗</button></form></div>
    </header>

    <section className="employee-welcome">
      <div><span className="employee-eyebrow">STAFF WORKSPACE</span><h1>Hello, {staffName.split(" ")[0]} 👋</h1><p>Welcome back. Here is your daily overview.</p><small>{branchName}</small></div>
      <span className="employee-duty"><i/> On duty</span>
    </section>

    {message&&<div className="employee-notice employee-notice-success" role="status">{message}</div>}
    {error&&<div className="employee-notice employee-notice-error" role="alert">{error}</div>}

    <nav className="employee-quick-actions" aria-label="Quick actions">
      <button className="employee-action action-blue" onClick={()=>nav("new-sale")}><span>🛒</span><b>New Sale</b><small>Start a sale</small><i>›</i></button>
      <button className="employee-action action-green" onClick={()=>nav("sales")}><span>▤</span><b>My Sales</b><small>View receipts</small><i>›</i></button>
      <button className="employee-action action-purple" onClick={()=>nav("mpesa")}><span>▣</span><b>Record M-Pesa</b><small>Enter transaction code</small><i>›</i></button>
      <button className="employee-action action-orange" onClick={()=>nav("profile")}><span>👤</span><b>My Profile</b><small>Account details</small><i>›</i></button>
    </nav>

    {view==="home"&&<section className="employee-summary-grid" aria-label="Today's branch sales summary">
      <article className="employee-metric"><span>Today's Sales</span><strong>{money(todayTotal)}</strong><small>{todaySales.length} transactions</small></article>
      <article className="employee-metric"><span>Payments Received</span><strong>{money(todayPaid)}</strong><small>Recorded payments</small></article>
      <article className="employee-metric"><span>M-Pesa Recorded</span><strong>{money(todayMpesa)}</strong><small>Transaction-code sales</small></article>
      <article className="employee-metric"><span>Outstanding Balance</span><strong>{money(todayBalance)}</strong><small>Pending collection</small></article>
    </section>}

    {view==="new-sale"&&<section className="employee-panel employee-checkout">
      <div className="employee-panel-heading"><div><span className="employee-eyebrow">POINT OF SALE</span><h2>Create a new sale</h2><p>Choose items, select payment method and complete the transaction.</p></div><button className="employee-light-button" onClick={()=>nav("home")}>← Dashboard</button></div>
      <div className="employee-form-grid">
        <label>Product / service<select value={productId} onChange={e=>{setProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);setPrice(p?String(p.selling_price):"");}}><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.selling_price)}</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <label>Unit price (KSh)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
        <button type="button" className="employee-add-item" onClick={addItem}>+ Add item</button>
      </div>
      <div className="employee-cart">{cart.length===0?<p>No items added yet. Select a product or service above.</p>:cart.map((line,index)=>{const p=products.find(x=>x.id===line.product_id);return <div className="employee-cart-row" key={index}><span>{p?.name??"Item"} × {line.quantity}</span><b>{money(line.quantity*line.unit_price)}</b><button type="button" onClick={()=>setCart(v=>v.filter((_,i)=>i!==index))}>Remove</button></div>;})}</div>
      <div className="employee-form-grid employee-checkout-extra">
        <label>Customer (optional)<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}</select></label>
        <label>Payment method<select value={paymentMethod} onChange={e=>{setPaymentMethod(e.target.value);setMpesaCode("");}}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option><option value="bank">Bank</option><option value="credit">Credit</option></select></label>
        {!paymentMethod==="mpesa"&&<label>Amount received (KSh)<input type="number" min="0" step="0.01" placeholder={subtotal.toFixed(2)} value={amountPaid} onChange={e=>setAmountPaid(e.target.value)}/></label>}
        <label>Sale note (optional)<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add a note"/></label>
      </div>
      {paymentMethod==="mpesa"&&<div className="employee-mpesa-entry"><div className="employee-mpesa-entry-title"><span>▣</span><div><b>Record M-Pesa transaction code</b><small>Enter the code from the customer's Safaricom confirmation message.</small></div></div><label>M-Pesa transaction code<input autoCapitalize="characters" autoComplete="off" maxLength={20} value={mpesaCode} onChange={e=>setMpesaCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="e.g. QW3F7H9K2"/></label><p>Check the payment in the business M-Pesa account before saving. Digi Biashara records the code against this sale but does not automatically verify it with Safaricom.</p></div>}
      <div className="employee-total"><span>Sale total</span><strong>{money(subtotal)}</strong></div>
      <button className="employee-complete-button" type="button" disabled={saving||cart.length===0||subtotal<=0||(paymentMethod==="mpesa"&&!mpesaCode.trim())} onClick={()=>void completeSale()}>{saving?"Saving sale…":paymentMethod==="mpesa"?"✓ Save sale & M-Pesa code":"✓ Complete sale"}</button>
    </section>}

    {(view==="home"||view==="sales"||view==="mpesa")&&<section className="employee-panel employee-recent-panel">
      <div className="employee-panel-heading"><div><span className="employee-eyebrow">{view==="mpesa"?"PAYMENT RECORDS":"SALES ACTIVITY"}</span><h2>{view==="mpesa"?"M-Pesa transactions":view==="sales"?"My recent sales":"Recent sales"}</h2><p>{view==="mpesa"?"M-Pesa transaction codes recorded with each sale.":"Latest sales recorded at your assigned branch."}</p></div><button className="employee-light-button" onClick={()=>void load()} disabled={loading}>↻ Refresh</button></div>
      {loading?<div className="employee-empty">Loading transactions…</div>:recent.length===0?<div className="employee-empty">No sales recorded yet.</div>:<SaleRows/>}
      <button className="employee-view-all" onClick={()=>nav(view==="mpesa"?"sales":"sales")}>View all sales →</button>
    </section>}

    {view==="profile"&&<section className="employee-panel employee-profile-panel"><div className="employee-avatar">{staffName.charAt(0).toUpperCase()}</div><span className="employee-eyebrow">MY ACCOUNT</span><h2>{staffName}</h2><p>{staffEmail}</p><div className="employee-profile-detail"><span>Role</span><b>Staff member / cashier</b></div><div className="employee-profile-detail"><span>Assigned branch</span><b>{branchName}</b></div><div className="employee-profile-detail"><span>Access</span><b>Sales and POS</b></div><form action="/logout" method="post"><button className="employee-complete-button" type="submit">Sign out</button></form></section>}

    <footer className="employee-footer"><b>Digi Biashara</b><span>Secure · Reliable · Trusted</span><small>Powered by Digital Kingdom Solutions</small></footer>
    <nav className="employee-bottom-nav" aria-label="Staff navigation">
      <button className={view==="home"?"active":""} onClick={()=>nav("home")}><span>⌂</span>Home</button>
      <button className={view==="new-sale"||view==="sales"?"active":""} onClick={()=>nav("sales")}><span>🛒</span>Sales</button>
      <button className={view==="mpesa"?"active":""} onClick={()=>nav("mpesa")}><span>▣</span>M-Pesa</button>
      <button className={view==="profile"?"active":""} onClick={()=>nav("profile")}><span>♙</span>Profile</button>
      <form action="/logout" method="post"><button><span>↗</span>Logout</button></form>
    </nav>
  </main>;
}
