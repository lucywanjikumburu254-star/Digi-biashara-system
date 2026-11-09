"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BusinessNav from "@/components/business-nav";

type ModuleName = "branches" | "catalog" | "customers" | "suppliers" | "sales" | "inventory" | "purchases" | "expenses" | "staff" | "appointments" | "reports";
type Row = Record<string, any>;
type CartLine = { product_id: string; quantity: number; unit_price?: number; unit_cost?: number };

const TITLES: Record<ModuleName,string> = {
  branches:"Branches", catalog:"Products & services", customers:"Customers", suppliers:"Suppliers",
  sales:"Sales / POS", inventory:"Inventory", purchases:"Purchases", expenses:"Expenses",
  staff:"Staff", appointments:"Appointments", reports:"Reports"
};
const DESCRIPTIONS: Record<ModuleName,string> = {
  branches:"Manage up to five active business locations.",
  catalog:"Create and update the products you sell and the services you provide.",
  customers:"Maintain customer details and contact history.",
  suppliers:"Maintain supplier and contact information.",
  sales:"Record a sale, take payment and reduce branch stock automatically.",
  inventory:"See stock by branch and post auditable adjustments.",
  purchases:"Receive supplier purchases and increase branch stock automatically.",
  expenses:"Record rent, utilities, wages, transport and other business costs.",
  staff:"Maintain employee records, job titles and branch assignments.",
  appointments:"Schedule salon and service bookings against customers and staff.",
  reports:"Review recorded sales, purchases, expenses and business performance."
};
const money = (n:any) => "KSh " + Number(n ?? 0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const stamp = (value:any) => value ? new Date(value).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}) : "—";

export default function Workspace({moduleName,businessId,businessName,categoryName}:{moduleName:ModuleName;businessId:string;businessName:string;categoryName:string}) {
  const db = useMemo(()=>createClient(),[]);
  const [rows,setRows] = useState<Row[]>([]);
  const [branches,setBranches] = useState<Row[]>([]);
  const [products,setProducts] = useState<Row[]>([]);
  const [customers,setCustomers] = useState<Row[]>([]);
  const [suppliers,setSuppliers] = useState<Row[]>([]);
  const [staff,setStaff] = useState<Row[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [form,setForm] = useState<Record<string,string>>({});
  const [cart,setCart] = useState<CartLine[]>([]);
  const [lineProduct,setLineProduct] = useState("");
  const [lineQty,setLineQty] = useState("1");
  const [linePrice,setLinePrice] = useState("");
  const [lineCost,setLineCost] = useState("");

  const reset = useCallback(() => {
    const salon = /salon|beauty|barber|spa/i.test(categoryName);
    setEditingId(null);
    setForm({
      name:"",sku:"",barcode:"",item_type:salon?"service":"product",category:"",unit:"piece",
      cost_price:"0",selling_price:"0",reorder_level:"0",track_stock:salon?"false":"true",
      address:"",phone:"",opening_time:"",closing_time:"",email:"",notes:"",
      contact_person:"",job_title:"",employment_type:"permanent",monthly_salary:"0",
      category_expense:"General",description:"",amount:"",payment_method:"cash",
      branch_id:"",customer_id:"",supplier_id:"",product_id:"",quantity:"1",unit_price:"",mpesa_transaction_code:"",
      unit_cost:"",discount:"0",tax:"0",amount_paid:"",expense_date:new Date().toISOString().slice(0,10),
      starts_at:"",ends_at:"",service_id:"",staff_id:""
    });
    setCart([]);setLineProduct("");setLineQty("1");setLinePrice("");setLineCost("");
  },[categoryName]);

  const load = useCallback(async () => {
    setLoading(true);setError("");
    try {
      const [br,pr,cu,su,st] = await Promise.all([
        db.from("branches").select("*").eq("business_id",businessId).order("created_at"),
        db.from("products").select("*").eq("business_id",businessId).eq("is_active",true).order("name"),
        db.from("customers").select("*").eq("business_id",businessId).order("name"),
        db.from("suppliers").select("*").eq("business_id",businessId).order("name"),
        db.from("business_staff").select("*,branches(name)").eq("business_id",businessId).order("full_name")
      ]);
      for (const r of [br,pr,cu,su,st]) if(r.error) throw r.error;
      setBranches(br.data??[]);setProducts(pr.data??[]);setCustomers(cu.data??[]);setSuppliers(su.data??[]);setStaff(st.data??[]);
      let data:Row[]=[];
      if(moduleName==="branches") data=br.data??[];
      else if(moduleName==="catalog") data=pr.data??[];
      else if(moduleName==="customers") data=cu.data??[];
      else if(moduleName==="suppliers") data=su.data??[];
      else if(moduleName==="staff") data=st.data??[];
      else if(moduleName==="sales") {
        const r=await db.from("sales").select("*,customers(name),branches(name),sale_items(item_name,quantity,line_total)").eq("business_id",businessId).order("created_at",{ascending:false}).limit(100);
        if(r.error) throw r.error;data=r.data??[];
      } else if(moduleName==="inventory") {
        const r=await db.from("stock_balances").select("*,products(name,sku,reorder_level,unit),branches(name)").eq("business_id",businessId).order("updated_at",{ascending:false});
        if(r.error) throw r.error;data=r.data??[];
      } else if(moduleName==="purchases") {
        const r=await db.from("purchases").select("*,suppliers(name),branches(name),purchase_items(quantity,line_total,products(name))").eq("business_id",businessId).order("created_at",{ascending:false}).limit(100);
        if(r.error) throw r.error;data=r.data??[];
      } else if(moduleName==="expenses") {
        const r=await db.from("expenses").select("*,branches(name)").eq("business_id",businessId).order("expense_date",{ascending:false}).limit(100);
        if(r.error) throw r.error;data=r.data??[];
      } else if(moduleName==="appointments") {
        const r=await db.from("appointments").select("*,customers(name,phone),products(name),branches(name),business_staff(full_name)").eq("business_id",businessId).order("starts_at",{ascending:true}).limit(150);
        if(r.error) throw r.error;data=r.data??[];
      } else if(moduleName==="reports") {
        const [sr,er,prc]=await Promise.all([
          db.from("sales").select("id,total,created_at").eq("business_id",businessId).eq("status","completed"),
          db.from("expenses").select("amount,expense_date").eq("business_id",businessId),
          db.from("purchases").select("total,created_at").eq("business_id",businessId).eq("status","received")
        ]);
        for(const r of [sr,er,prc]) if(r.error) throw r.error;
        data=[{sales:sr.data??[],expenses:er.data??[],purchases:prc.data??[]}];
      }
      setRows(data);
    } catch(e) {setError(e instanceof Error?e.message:"Unable to load business records.");}
    finally {setLoading(false);}
  },[businessId,moduleName,db]);

  useEffect(()=>{reset();},[reset]);
  useEffect(()=>{void load();},[load]);
  const set = (key:string,value:string) => setForm(p=>({...p,[key]:value}));
  const notify = (s:string) => {setMessage(s);setError("");};

  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try {
      let table="";let record:any={business_id:businessId};
      if(moduleName==="branches"){table="branches";Object.assign(record,{name:form.name,address:form.address||null,phone:form.phone||null,opening_time:form.opening_time||null,closing_time:form.closing_time||null});}
      if(moduleName==="catalog"){table="products";Object.assign(record,{name:form.name,sku:form.sku||null,barcode:form.barcode||null,description:form.description||null,item_type:form.item_type,category:form.category||null,unit:form.unit||"piece",cost_price:Number(form.cost_price||0),selling_price:Number(form.selling_price||0),reorder_level:Number(form.reorder_level||0),track_stock:form.item_type==="service"?false:form.track_stock==="true",created_by:(await db.auth.getUser()).data.user?.id});}
      if(moduleName==="customers"){table="customers";Object.assign(record,{name:form.name,phone:form.phone||null,email:form.email||null,notes:form.notes||null});}
      if(moduleName==="suppliers"){table="suppliers";Object.assign(record,{name:form.name,contact_person:form.contact_person||null,phone:form.phone||null,email:form.email||null,address:form.address||null,notes:form.notes||null});}
      if(moduleName==="staff"){table="business_staff";Object.assign(record,{full_name:form.name,branch_id:form.branch_id||null,email:form.email||null,phone:form.phone||null,job_title:form.job_title||null,employment_type:form.employment_type,monthly_salary:Number(form.monthly_salary||0),notes:form.notes||null,created_by:(await db.auth.getUser()).data.user?.id});}
      if(moduleName==="expenses"){
        const {data:{user}}=await db.auth.getUser();
        const r=await db.from("expenses").insert({business_id:businessId,branch_id:form.branch_id||null,category:form.category_expense,description:form.description,amount:Number(form.amount),payment_method:form.payment_method,expense_date:form.expense_date,notes:form.notes||null,created_by:user?.id});
        if(r.error) throw r.error;reset();notify("Expense saved.");await load();return;
      }
      if(moduleName==="appointments"){
        const {data:{user}}=await db.auth.getUser();
        if(!products.some(p=>p.id===form.service_id&&p.item_type==="service")) throw new Error("Choose an active service from the catalogue.");
        const r=await db.from("appointments").insert({business_id:businessId,branch_id:form.branch_id,customer_id:form.customer_id||null,service_id:form.service_id,staff_id:form.staff_id||null,starts_at:new Date(form.starts_at).toISOString(),ends_at:form.ends_at?new Date(form.ends_at).toISOString():null,notes:form.notes||null,created_by:user?.id});
        if(r.error) throw r.error;reset();notify("Appointment booked.");await load();return;
      }
      if(!table) throw new Error("Use the transaction form for this module.");
      const result=editingId?await db.from(table).update(record).eq("id",editingId).eq("business_id",businessId):await db.from(table).insert(record);
      if(result.error) throw result.error;
      reset();notify(editingId?"Changes saved.":"Record created.");await load();
    } catch(e){setError(e instanceof Error?e.message:"Unable to save this record.");}
    finally{setSaving(false);}
  }

  function edit(row:Row){
    setEditingId(row.id);setForm(p=>({...p,name:row.name??row.full_name??"",sku:row.sku??"",barcode:row.barcode??"",item_type:row.item_type??"product",category:row.category??"",unit:row.unit??"piece",cost_price:String(row.cost_price??0),selling_price:String(row.selling_price??0),reorder_level:String(row.reorder_level??0),track_stock:String(row.track_stock??true),address:row.address??"",phone:row.phone??"",opening_time:row.opening_time??"",closing_time:row.closing_time??"",email:row.email??"",notes:row.notes??"",contact_person:row.contact_person??"",job_title:row.job_title??"",employment_type:row.employment_type??"permanent",monthly_salary:String(row.monthly_salary??0),branch_id:row.branch_id??""}));
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function deactivate(row:Row){
    if(!window.confirm("Deactivate this record? It remains in your business history.")) return;
    setSaving(true);setError("");try{
      let r:any;
      if(moduleName==="branches") r=await db.from("branches").update({status:"disabled"}).eq("id",row.id).eq("business_id",businessId);
      else if(moduleName==="catalog") r=await db.from("products").update({is_active:false}).eq("id",row.id).eq("business_id",businessId);
      else if(moduleName==="staff") r=await db.from("business_staff").update({status:"inactive"}).eq("id",row.id).eq("business_id",businessId);
      else throw new Error("This record cannot be deactivated here.");
      if(r.error) throw r.error;notify("Record deactivated.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to deactivate record.");}
    finally{setSaving(false);}
  }

  async function addLine(){
    const p=products.find(x=>x.id===lineProduct);
    if(!p){setError("Choose an item first.");return;}
    const qty=Number(lineQty);const rate=moduleName==="sales"?Number(linePrice||p.selling_price):Number(lineCost||p.cost_price);
    if(qty<=0||!Number.isFinite(qty)||rate<0||!Number.isFinite(rate)){setError("Enter a valid quantity and price/cost.");return;}
    setCart(v=>[...v,{product_id:p.id,quantity:qty,...(moduleName==="sales"?{unit_price:rate}:{unit_cost:rate})}]);
    setError("");setLineProduct("");setLineQty("1");setLinePrice("");setLineCost("");
  }

  async function transact(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      if(!cart.length) throw new Error("Add at least one item before saving.");
      if(!form.branch_id) throw new Error("Select a branch.");
      if(moduleName==="sales"&&form.payment_method==="mpesa"&&!form.mpesa_transaction_code.trim()) throw new Error("Enter the M-Pesa transaction code.");
      let result:any;
      if(moduleName==="sales") result=await db.rpc("record_sale",{p_business_id:businessId,p_branch_id:form.branch_id,p_items:cart,p_customer_id:form.customer_id||null,p_payment_method:form.payment_method,p_discount:Number(form.discount||0),p_tax:Number(form.tax||0),p_amount_paid:form.amount_paid===""?null:Number(form.amount_paid),p_notes:form.notes||null});
      else result=await db.rpc("receive_purchase",{p_business_id:businessId,p_branch_id:form.branch_id,p_items:cart,p_supplier_id:form.supplier_id||null,p_supplier_invoice:form.contact_person||null,p_notes:form.notes||null});
      if(result.error) throw result.error;
      if(moduleName==="sales"&&form.payment_method==="mpesa"&&result.data){
        const saved=await db.from("sales").update({mpesa_transaction_code:form.mpesa_transaction_code.trim().toUpperCase()}).eq("id",result.data).eq("business_id",businessId);
        if(saved.error) throw new Error("Sale was recorded, but the M-Pesa transaction code could not be saved: "+saved.error.message);
      }
      reset();notify(moduleName==="sales"?"Sale completed and stock updated.":"Purchase received and stock increased.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save transaction.");}
    finally{setSaving(false);}
  }

  async function adjust(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const r=await db.rpc("adjust_stock",{p_business_id:businessId,p_branch_id:form.branch_id,p_product_id:form.product_id,p_quantity_delta:Number(form.quantity),p_reason:form.notes});
      if(r.error) throw r.error;reset();notify("Stock adjustment recorded.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to adjust stock.");}
    finally{setSaving(false);}
  }

  function field(label:string,key:string,type="text",required=false,placeholder=""){
    return <label className="field" key={key}><span>{label}</span><input type={type} required={required} placeholder={placeholder} value={form[key]??""} onChange={e=>set(key,e.target.value)}/></label>;
  }
  function select(label:string,key:string,opts:{value:string;label:string}[],required=false){
    return <label className="field" key={key}><span>{label}</span><select required={required} value={form[key]??""} onChange={e=>set(key,e.target.value)}><option value="">Select {label.toLowerCase()}</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  }
  function formPanel(children:ReactNode,onSubmit=save,button="Save record"){
    return <form className="panel workspace-form" onSubmit={onSubmit as any}><div className="panelhead"><h2>{editingId?"Edit record":"Add new record"}</h2>{editingId&&<button type="button" className="btn secondary small" onClick={reset}>Cancel edit</button>}</div><div className="form-grid">{children}</div><div className="form-actions"><button className="btn" disabled={saving}>{saving?"Saving…":button}</button></div></form>;
  }
  function editActions(r:Row){return <div className="row-actions"><button type="button" className="btn secondary small" onClick={()=>edit(r)}>Edit</button><button type="button" className="btn secondary small" disabled={saving} onClick={()=>void deactivate(r)}>Deactivate</button></div>;}

  function transactionForm(sale:boolean){
    const list=products.filter(p=>sale|| (p.item_type==="product"&&p.track_stock));
    const subtotal=cart.reduce((sum,line)=>sum+line.quantity*Number(sale?line.unit_price:line.unit_cost),0);
    const discount=sale?Math.max(0,Number(form.discount||0)):0;
    const tax=sale?Math.max(0,Number(form.tax||0)):0;
    const total=Math.max(0,subtotal-discount+tax);
    const received=form.amount_paid===""?total:Math.max(0,Number(form.amount_paid||0));
    const balance=Math.max(0,total-received);
    const change=Math.max(0,received-total);
    const methods=[{value:"cash",label:"Cash",icon:"💵"},{value:"mpesa",label:"M-Pesa",icon:"📱"}];
    if(!sale) return <form className="panel workspace-form" onSubmit={transact}>
      <div className="panelhead"><h2>Receive supplier purchase</h2><span className="pill">Stock intake</span></div>
      <div className="form-grid">
        {select("Branch","branch_id",branches.filter(b=>b.status==="active").map(b=>({value:b.id,label:b.name})),true)}
        {select("Supplier","supplier_id",suppliers.map(x=>({value:x.id,label:x.name})))}
        {field("Supplier invoice number","contact_person")}
        {field("Notes","notes")}
      </div>
      <div className="line-entry">
        <label className="field"><span>Stock item</span><select value={lineProduct} onChange={e=>setLineProduct(e.target.value)}><option value="">Select item</option>{list.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.cost_price)}</option>)}</select></label>
        <label className="field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={lineQty} onChange={e=>setLineQty(e.target.value)}/></label>
        <label className="field"><span>Unit cost (KSh)</span><input type="number" min="0" step="0.01" value={lineCost} onChange={e=>setLineCost(e.target.value)}/></label>
        <button type="button" className="btn secondary" onClick={()=>void addLine()}>Add item</button>
      </div>
      <div className="cart-list">{cart.length===0?<p className="muted compact-help">Add the items received from your supplier.</p>:cart.map((x,i)=>{const p=products.find(y=>y.id===x.product_id);return <div className="cart-row" key={i}><span>{p?.name} × {x.quantity}</span><b>{money(Number(x.unit_cost)*x.quantity)}</b><button type="button" className="text-button" onClick={()=>setCart(v=>v.filter((_,j)=>j!==i))}>Remove</button></div>;})}</div>
      <div className="checkout-total-row"><span>Purchase total</span><strong>{money(subtotal)}</strong></div>
      <div className="form-actions"><button className="btn" disabled={saving||cart.length===0}>{saving?"Saving…":"Receive purchase and update stock"}</button></div>
    </form>;

    return <form className="panel workspace-form pos-checkout" onSubmit={transact}>
      <div className="pos-heading">
        <div><div className="eyebrow">Point of sale</div><h2>New sale</h2><p className="muted">Add items, review the total and take payment.</p></div>
        <span className="pill pos-live"><span className="pos-live-dot"/> Ready to checkout</span>
      </div>
      <div className="pos-top-fields">
        {select("Selling branch","branch_id",branches.filter(b=>b.status==="active").map(b=>({value:b.id,label:b.name})),true)}
        {select("Customer","customer_id",customers.map(x=>({value:x.id,label:x.name})))}
      </div>
      <div className="pos-layout">
        <section className="pos-items">
          <div className="pos-section-title"><div><h3>Sale items</h3><p className="muted">Select products or services to add to this sale.</p></div><span className="pos-count">{cart.length} {cart.length===1?"item":"items"}</span></div>
          <div className="pos-add-line">
            <label className="field pos-product-field"><span>Product / service</span><select value={lineProduct} onChange={e=>{setLineProduct(e.target.value);const p=products.find(x=>x.id===e.target.value);setLinePrice(p?String(p.selling_price??0):"");}}><option value="">Search and select an item</option>{list.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.selling_price)}</option>)}</select></label>
            <label className="field"><span>Qty</span><input type="number" min="0.001" step="0.001" value={lineQty} onChange={e=>setLineQty(e.target.value)}/></label>
            <label className="field"><span>Unit price (KSh)</span><input type="number" min="0" step="0.01" value={linePrice} onChange={e=>setLinePrice(e.target.value)}/></label>
            <button type="button" className="btn pos-add-button" onClick={()=>void addLine()}><span>＋</span> Add item</button>
          </div>
          <div className="pos-cart">
            <div className="pos-cart-head"><span>ITEM</span><span>QTY</span><span>PRICE</span><span>AMOUNT</span><span/></div>
            {cart.length===0?<div className="pos-empty"><span className="pos-empty-icon">🛒</span><strong>Your sale is empty</strong><p className="muted">Choose a product or service above to get started.</p></div>:cart.map((x,i)=>{const p=products.find(y=>y.id===x.product_id);return <div className="pos-cart-row" key={i}><div className="pos-item-name"><strong>{p?.name??"Item"}</strong><small>{p?.sku??p?.item_type??"Sale item"}</small></div><span>{x.quantity}</span><span>{money(x.unit_price)}</span><strong>{money(Number(x.unit_price)*x.quantity)}</strong><button type="button" className="pos-remove" aria-label={"Remove "+(p?.name??"item")} onClick={()=>setCart(v=>v.filter((_,j)=>j!==i))}>×</button></div>;})}
          </div>
          <label className="field pos-notes"><span>Sale notes (optional)</span><input value={form.notes??""} onChange={e=>set("notes",e.target.value)} placeholder="Add a note for this transaction"/></label>
        </section>
        <aside className="pos-payment">
          <div className="pos-section-title"><div><h3>Payment</h3><p className="muted">Choose how the customer pays.</p></div></div>
          <div className="pos-method-grid">{methods.map(m=><button type="button" key={m.value} className={"pos-method "+(form.payment_method===m.value?"selected":"")} onClick={()=>{set("payment_method",m.value);if(m.value==="cash")set("mpesa_transaction_code","");}}><span>{m.icon}</span><b>{m.label}</b></button>)}</div>
          {form.payment_method==="mpesa"&&<label className="field pos-mpesa-code"><span>M-Pesa transaction code</span><input type="text" required value={form.mpesa_transaction_code??""} onChange={e=>set("mpesa_transaction_code",e.target.value.toUpperCase().replace(/\s/g,""))} placeholder="e.g. QHX7ABC123" autoCapitalize="characters"/><small>Enter the confirmation code from the customer’s M-Pesa message.</small></label>}
          <div className="pos-summary">
            <div className="pos-summary-line"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <label className="pos-adjustment"><span>Discount (KSh)</span><input aria-label="Discount in Kenya shillings" type="number" min="0" step="0.01" value={form.discount??"0"} onChange={e=>set("discount",e.target.value)}/></label>
            <label className="pos-adjustment"><span>Tax (KSh)</span><input aria-label="Tax in Kenya shillings" type="number" min="0" step="0.01" value={form.tax??"0"} onChange={e=>set("tax",e.target.value)}/></label>
            <div className="pos-grand-total"><span>Total due</span><strong>{money(total)}</strong></div>
            <label className="pos-received"><span>Amount received (KSh)</span><input type="number" min="0" step="0.01" value={form.amount_paid??""} onChange={e=>set("amount_paid",e.target.value)} placeholder={money(total).replace("KSh ","")}/><small>Leave blank if the customer pays the full amount.</small></label>
            <div className={"pos-payment-result "+(balance>0?"is-balance":"is-change")}><span>{balance>0?"Balance remaining":"Change to give"}</span><strong>{money(balance>0?balance:change)}</strong></div>
          </div>
          <button className="btn pos-complete" disabled={saving||cart.length===0||!form.branch_id||total<=0||received<0}>{saving?"Processing sale…":"Complete sale  →"}</button>
          <p className="pos-secure-note">Review the amount before completing. Stock updates when the sale is saved.</p>
        </aside>
      </div>
    </form>;
  }

  function renderForm(){
    if(moduleName==="branches") return formPanel(<>{field("Branch name","name","text",true)}{field("Address / town","address")}{field("Phone","phone")}{field("Opening time","opening_time","time")}{field("Closing time","closing_time","time")}</>);
    if(moduleName==="catalog") return formPanel(<>{field("Product / service name","name","text",true)}{field("SKU / reference","sku")}{field("Barcode","barcode")}{select("Item type","item_type",[{value:"product",label:"Stocked product"},{value:"service",label:"Service / non-stock item"}],true)}{field("Category","category")}{field("Unit","unit")}{field("Cost price (KSh)","cost_price","number")}{field("Selling price (KSh)","selling_price","number")}{field("Reorder level","reorder_level","number")}{select("Track stock?","track_stock",[{value:"true",label:"Yes"},{value:"false",label:"No"}])}{field("Description","description")}</>);
    if(moduleName==="customers") return formPanel(<>{field("Customer name","name","text",true)}{field("Phone","phone")}{field("Email","email","email")}{field("Notes","notes")}</>);
    if(moduleName==="suppliers") return formPanel(<>{field("Supplier / company name","name","text",true)}{field("Contact person","contact_person")}{field("Phone","phone")}{field("Email","email","email")}{field("Address","address")}{field("Notes","notes")}</>);
    if(moduleName==="staff") return formPanel(<>{field("Full name","name","text",true)}{field("Email","email","email")}{field("Phone","phone")}{field("Job title","job_title")}{select("Assigned branch","branch_id",branches.map(b=>({value:b.id,label:b.name})))}{select("Employment type","employment_type",["permanent","part_time","casual","contract"].map(v=>({value:v,label:v.replace("_"," ")})))}{field("Monthly salary (KSh)","monthly_salary","number")}{field("Notes","notes")}</>);
    if(moduleName==="expenses") return formPanel(<>{field("Expense category","category_expense","text",true,"e.g. Rent, electricity, transport")}{field("Description","description","text",true)}{field("Amount (KSh)","amount","number",true)}{select("Branch","branch_id",branches.map(b=>({value:b.id,label:b.name})))}{select("Payment method","payment_method",["cash","mpesa","card","bank","other"].map(v=>({value:v,label:v.toUpperCase()})),true)}{field("Expense date","expense_date","date",true)}{field("Notes","notes")}</>);
    if(moduleName==="inventory") return formPanel(<>{select("Branch","branch_id",branches.filter(b=>b.status==="active").map(b=>({value:b.id,label:b.name})),true)}{select("Stocked product","product_id",products.filter(p=>p.item_type==="product"&&p.track_stock).map(p=>({value:p.id,label:p.name})),true)}{field("Quantity change (+ add / − remove)","quantity","number",true,"e.g. 10 or -2")}{field("Reason for adjustment","notes","text",true)}</>,adjust,"Save stock adjustment");
    if(moduleName==="sales") return transactionForm(true);
    if(moduleName==="purchases") return transactionForm(false);
    if(moduleName==="appointments") return formPanel(<>{select("Branch","branch_id",branches.filter(b=>b.status==="active").map(b=>({value:b.id,label:b.name})),true)}{select("Customer","customer_id",customers.map(c=>({value:c.id,label:c.name})))}{select("Service","service_id",products.filter(p=>p.item_type==="service").map(p=>({value:p.id,label:p.name+" · "+money(p.selling_price)})),true)}{select("Staff member","staff_id",staff.filter(s=>s.status==="active").map(s=>({value:s.id,label:s.full_name})))}{field("Start date and time","starts_at","datetime-local",true)}{field("End date and time","ends_at","datetime-local")}{field("Notes","notes")}</>,save,"Book appointment");
    return null;
  }

  function renderList(){
    if(moduleName==="branches") return <table className="table"><thead><tr><th>Branch</th><th>Address</th><th>Phone</th><th>Opening hours</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.address??"—"}</td><td>{r.phone??"—"}</td><td>{r.opening_time??"—"} – {r.closing_time??"—"}</td><td>{r.status}</td><td>{r.status==="active"&&editActions(r)}</td></tr>)}</tbody></table>;
    if(moduleName==="catalog") return <table className="table"><thead><tr><th>Name</th><th>Type</th><th>SKU</th><th>Cost</th><th>Price</th><th>Track stock</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.name}</b><small>{r.category??""}</small></td><td>{r.item_type}</td><td>{r.sku??"—"}</td><td>{money(r.cost_price)}</td><td>{money(r.selling_price)}</td><td>{r.track_stock?"Yes":"No"}</td><td>{editActions(r)}</td></tr>)}</tbody></table>;
    if(moduleName==="customers") return <table className="table"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Notes</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.phone??"—"}</td><td>{r.email??"—"}</td><td>{r.notes??"—"}</td><td><button className="btn secondary small" onClick={()=>edit(r)}>Edit</button></td></tr>)}</tbody></table>;
    if(moduleName==="suppliers") return <table className="table"><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.contact_person??"—"}</td><td>{r.phone??"—"}</td><td>{r.email??"—"}</td><td><button className="btn secondary small" onClick={()=>edit(r)}>Edit</button></td></tr>)}</tbody></table>;
    if(moduleName==="staff") return <table className="table"><thead><tr><th>Staff member</th><th>Role</th><th>Branch</th><th>Phone</th><th>Monthly pay</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.full_name}<small>{r.email??""}</small></td><td>{r.job_title??"—"}</td><td>{r.branches?.name??"All / not assigned"}</td><td>{r.phone??"—"}</td><td>{money(r.monthly_salary)}</td><td>{r.status}</td><td>{r.status==="active"&&editActions(r)}</td></tr>)}</tbody></table>;
    if(moduleName==="sales") return <table className="table"><thead><tr><th>Sale number</th><th>Date</th><th>Customer</th><th>Branch</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><Link className="sale-link" href={"/admin/sales/"+r.id}>{r.sale_number}</Link></td><td>{stamp(r.created_at)}</td><td>{r.customers?.name??"Walk-in"}</td><td>{r.branches?.name??"—"}</td><td>{money(r.total)}</td><td>{money(r.amount_paid)}</td><td>{money(r.balance)}</td><td>{r.payment_method}</td></tr>)}</tbody></table>;
    if(moduleName==="inventory") return <table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Branch</th><th>Available</th><th>Reorder level</th><th>Stock status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.products?.name??"—"}</td><td>{r.products?.sku??"—"}</td><td>{r.branches?.name??"—"}</td><td>{Number(r.quantity).toLocaleString("en-KE")} {r.products?.unit??""}</td><td>{r.products?.reorder_level??0}</td><td>{Number(r.quantity)<=Number(r.products?.reorder_level??0)?<span className="pill warn">Reorder</span>:<span className="pill">In stock</span>}</td></tr>)}</tbody></table>;
    if(moduleName==="purchases") return <table className="table"><thead><tr><th>Purchase no.</th><th>Date</th><th>Supplier</th><th>Branch</th><th>Items</th><th>Total</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.purchase_number}</td><td>{stamp(r.created_at)}</td><td>{r.suppliers?.name??"—"}</td><td>{r.branches?.name??"—"}</td><td>{(r.purchase_items??[]).map((x:Row)=>x.products?.name??"Item").join(", ")}</td><td>{money(r.total)}</td></tr>)}</tbody></table>;
    if(moduleName==="expenses") return <table className="table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Branch</th><th>Method</th><th>Amount</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.expense_date}</td><td>{r.category}</td><td>{r.description}</td><td>{r.branches?.name??"All"}</td><td>{r.payment_method}</td><td>{money(r.amount)}</td></tr>)}</tbody></table>;
    if(moduleName==="appointments") return <table className="table"><thead><tr><th>Date / time</th><th>Customer</th><th>Service</th><th>Staff</th><th>Branch</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{stamp(r.starts_at)}</td><td>{r.customers?.name??"—"}</td><td>{r.products?.name??"—"}</td><td>{r.business_staff?.full_name??"Not assigned"}</td><td>{r.branches?.name??"—"}</td><td>{r.status}</td></tr>)}</tbody></table>;
    return null;
  }

  function reportPanel(){
    const r=rows[0]??{sales:[],expenses:[],purchases:[]};
    const revenue=(r.sales??[]).reduce((n:number,x:Row)=>n+Number(x.total),0);
    const cost=(r.expenses??[]).reduce((n:number,x:Row)=>n+Number(x.amount),0);
    const purchases=(r.purchases??[]).reduce((n:number,x:Row)=>n+Number(x.total),0);
    const today=new Date().toISOString().slice(0,10);
    const todaySales=(r.sales??[]).filter((x:Row)=>String(x.created_at).slice(0,10)===today).reduce((n:number,x:Row)=>n+Number(x.total),0);
    return <><div className="stats"><div className="stat"><span>Recorded sales</span><strong>{(r.sales??[]).length}</strong><small>{money(revenue)} total</small></div><div className="stat"><span>Today's sales</span><strong>{money(todaySales)}</strong></div><div className="stat"><span>Recorded expenses</span><strong>{money(cost)}</strong></div><div className="stat"><span>Stock purchases</span><strong>{money(purchases)}</strong></div></div><div className="panel"><h2>Cash movement summary</h2><p className="muted">Sales less recorded expenses and stock purchases. This is a management summary, not a statutory profit statement.</p><div className="report-net">{money(revenue-cost-purchases)}</div><small className="muted">Sales − expenses − purchases</small></div></>;
  }

  return <div className="layout"><BusinessNav active={moduleName}/><main className="main"><header className="dashhead"><strong>{businessName}</strong><span className="muted">{categoryName}</span></header><section className="dashcontent">
    <div className="eyebrow">{categoryName} workspace</div><h1>{TITLES[moduleName]}</h1><p className="sub">{DESCRIPTIONS[moduleName]}</p>
    {message&&<div className="success">{message}</div>}{error&&<div className="error" role="alert">{error}</div>}
    {moduleName==="reports"?reportPanel():renderForm()}
    <div className="panel"><div className="panelhead"><h2>{moduleName==="inventory"?"Current stock by branch":"Saved "+TITLES[moduleName].toLowerCase()}</h2><button className="btn secondary small" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
      {loading?<div className="empty">Loading records…</div>:rows.length===0?<div className="empty">No records yet. Use the form above to add your first record.</div>:moduleName==="reports"?<div className="empty">Summary is calculated from saved transactions.</div>:<div className="table-wrap">{renderList()}</div>}
    </div>
    {moduleName==="inventory"&&<div className="panel"><h2>Stock tracking</h2><p className="muted">Sales reduce stock, received purchases increase stock, and manual adjustments create an auditable movement. Add stocked products in Products & services first.</p></div>}
    {moduleName==="staff"&&<div className="panel"><h2>Staff sign-in access</h2><p className="muted">This page maintains the staff directory, employment details and branch assignments. A staff directory record does not create login credentials. Employee login invitations and detailed permission controls must be configured separately before staff can sign in.</p></div>}
  </section></main></div>;
}
