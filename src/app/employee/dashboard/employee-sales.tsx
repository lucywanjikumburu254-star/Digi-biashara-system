"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = { id:string; name:string; selling_price:number; item_type:string; track_stock:boolean };
type Customer = { id:string; name:string; phone:string|null };
type Sale = { id:string; sale_number:string; created_at:string; total:number; amount_paid:number; balance:number; payment_method:string; customers?:{name:string}|{name:string}[]|null };

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
  const [notes,setNotes]=useState("");
  const [cart,setCart]=useState<{product_id:string;quantity:number;unit_price:number}[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const [p,c,s]=await Promise.all([
      db.from("products").select("id,name,selling_price,item_type,track_stock").eq("business_id",businessId).eq("is_active",true).order("name"),
      db.from("customers").select("id,name,phone").eq("business_id",businessId).order("name"),
      db.from("sales").select("id,sale_number,created_at,total,amount_paid,balance,payment_method,customers(name)").eq("business_id",businessId).eq("branch_id",branchId).order("created_at",{ascending:false}).limit(30)
    ]);
    const failed=[p,c,s].find(x=>x.error);
    if(failed?.error) setError(failed.error.message);
    setProducts(p.data??[]);setCustomers(c.data??[]);setSales(s.data??[]);
    setLoading(false);
  },[db,businessId,branchId]);

  useEffect(()=>{void load();},[load]);

  const subtotal=cart.reduce((sum,line)=>sum+line.quantity*line.unit_price,0);
  function addItem(){
    const product=products.find(x=>x.id===productId);
    const qty=Number(quantity),rate=Number(price||product?.selling_price||0);
    if(!product||qty<=0||rate<0||!Number.isFinite(qty)||!Number.isFinite(rate)){setError("Select an item and enter a valid quantity and price.");return;}
    setCart(lines=>[...lines,{product_id:product.id,quantity:qty,unit_price:rate}]);
    setProductId("");setQuantity("1");setPrice("");setError("");
  }
  async function completeSale(){
    if(!cart.length){setError("Add at least one item to the sale.");return;}
    setSaving(true);setError("");setMessage("");
    try{
      const {data,error:rpcError}=await db.rpc("record_sale",{
        p_business_id:businessId,p_branch_id:branchId,p_items:cart,
        p_customer_id:customerId||null,p_payment_method:paymentMethod,
        p_discount:0,p_tax:0,p_amount_paid:amountPaid===""?null:Number(amountPaid),
        p_notes:notes||null
      });
      if(rpcError) throw rpcError;
      setCart([]);setCustomerId("");setPaymentMethod("cash");setAmountPaid("");setNotes("");
      setMessage("Sale completed successfully. Stock has been updated.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to complete this sale.");}
    finally{setSaving(false);}
  }

  return <main className="employee-pos">
    <header className="employee-pos-head">
      <div><div className="logo">DIGI<em>BIASHARA</em></div><p className="muted">Employee · Sales only</p></div>
      <form action="/logout" method="post"><button type="submit" className="btn secondary small">Sign out</button></form>
    </header>
    <section className="employee-pos-content">
      <div className="eyebrow">Assigned branch</div>
      <h1>{branchName}</h1>
      <p className="sub">Record customer sales for this branch. Your account cannot access other business modules.</p>
      {message&&<div className="success" role="status">{message}</div>}
      {error&&<div className="error" role="alert">{error}</div>}
      <section className="panel employee-sale-panel">
        <div className="panelhead"><h2>New sale</h2><span className="pill">POS</span></div>
        <div className="form-grid">
          <label className="field"><span>Product / service</span><select value={productId} onChange={e=>{setProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);setPrice(p?String(p.selling_price):"");}}><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · KSh {Number(p.selling_price).toLocaleString("en-KE")}</option>)}</select></label>
          <label className="field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
          <label className="field"><span>Unit price (KSh)</span><input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
          <button type="button" className="btn" onClick={addItem}>Add item</button>
        </div>
        <div className="cart-list">
          {cart.length===0?<p className="muted compact-help">Your sale is empty. Select products or services above.</p>:cart.map((line,index)=>{const p=products.find(x=>x.id===line.product_id);return <div className="cart-row" key={index}><span>{p?.name??"Item"} × {line.quantity}</span><b>KSh {(line.quantity*line.unit_price).toLocaleString("en-KE",{minimumFractionDigits:2})}</b><button type="button" className="text-button" onClick={()=>setCart(v=>v.filter((_,i)=>i!==index))}>Remove</button></div>;})}
        </div>
        <div className="form-grid employee-checkout-fields">
          <label className="field"><span>Customer (optional)</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}</select></label>
          <label className="field"><span>Payment method</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option><option value="bank">Bank</option><option value="credit">Credit</option></select></label>
          <label className="field"><span>Amount received (KSh)</span><input type="number" min="0" step="0.01" placeholder={subtotal.toFixed(2)} value={amountPaid} onChange={e=>setAmountPaid(e.target.value)}/></label>
          <label className="field"><span>Sale note (optional)</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add a note"/></label>
        </div>
        <div className="checkout-total-row"><span>Sale total</span><strong>KSh {subtotal.toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
        <button className="btn employee-complete-sale" type="button" disabled={saving||cart.length===0} onClick={()=>void completeSale()}>{saving?"Processing sale…":"Complete sale"}</button>
      </section>
      <section className="panel">
        <div className="panelhead"><h2>Recent sales at this branch</h2><button className="btn secondary small" type="button" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
        {loading?<div className="empty">Loading sales…</div>:sales.length===0?<div className="empty">No sales recorded yet for this branch.</div>:<div className="table-wrap"><table className="table"><thead><tr><th>Sale number</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{s.sale_number}</td><td>{new Date(s.created_at).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"})}</td><td>{Array.isArray(s.customers)?(s.customers[0]?.name??"Walk-in"):(s.customers?.name??"Walk-in")}</td><td>KSh {Number(s.total).toLocaleString("en-KE")}</td><td>KSh {Number(s.amount_paid).toLocaleString("en-KE")}</td><td>KSh {Number(s.balance).toLocaleString("en-KE")}</td><td>{s.payment_method}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
  </main>;
}
