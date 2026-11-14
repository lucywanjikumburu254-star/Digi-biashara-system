import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";
import BusinessSuspensionGuard from "@/components/business-suspension-guard";

export default async function SaleReceiptPage({params}:{params:Promise<{saleId:string}>}) {
  const {saleId}=await params;
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await db.from("business_memberships")
    .select("business_id,role,branch_id,permissions,businesses(name,phone,location)")
    .eq("user_id",user.id).eq("status","active").in("role",["owner","employee"]).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!membership) redirect("/login");
  const {data:sale}=await db.from("sales")
    .select("*,customers(name,phone),branches(name,address,phone),sale_items(item_name,quantity,unit_price,line_total)")
    .eq("business_id",membership.business_id).eq("id",saleId).maybeSingle();
  if(!sale) notFound();
  if(membership.role!=="owner" && (membership.branch_id!==sale.branch_id || membership.permissions?.sales!==true)) notFound();
  const {data:cashier}=await db.from("business_staff").select("full_name").eq("business_id",membership.business_id).eq("user_id",sale.created_by).maybeSingle();
  const biz:any=membership.businesses;
  const branch:any=sale.branches;
  return <BusinessSuspensionGuard businessId={membership.business_id} businessName={biz?.name??"Business"} audience={membership.role==="owner"?"owner":"staff"}><main className="receipt-page">
    <div className="receipt-toolbar no-print"><Link className="btn secondary small" href="/admin/sales">Back to sales</Link><PrintButton/></div>
    <article className="receipt">
      <header className="receipt-heading"><div className="logo">DIGI<em>BIASHARA</em></div><h1>Sales receipt</h1><strong>{biz?.name??"Business"}</strong>
        <p>{branch?.name??"Main branch"} · {branch?.address??biz?.location??""}</p><p>{branch?.phone??biz?.phone??""}</p>
      </header>
      <div className="receipt-meta"><div><small>Receipt number</small><strong>{sale.sale_number}</strong></div><div><small>Date & time recorded</small><strong>{new Date(sale.created_at).toLocaleString("en-KE",{timeZone:"Africa/Nairobi"})}</strong></div><div><small>Recorded by</small><strong>{cashier?.full_name??(sale.created_by===user.id?(user.email??"Current cashier"):"Staff member")}</strong></div><div><small>Customer</small><strong>{sale.customers?.name??"Walk-in customer"}</strong><span>{sale.customers?.phone??""}</span></div></div>
      <table className="receipt-table"><thead><tr><th>Item / service</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{(sale.sale_items??[]).map((item:any,i:number)=><tr key={i}><td>{item.item_name}</td><td>{Number(item.quantity).toLocaleString("en-KE")}</td><td>KSh {Number(item.unit_price).toLocaleString("en-KE",{minimumFractionDigits:2})}</td><td>KSh {Number(item.line_total).toLocaleString("en-KE",{minimumFractionDigits:2})}</td></tr>)}</tbody></table>
      <section className="receipt-totals"><div><span>Subtotal</span><strong>KSh {Number(sale.subtotal).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div><div><span>Discount</span><strong>KSh {Number(sale.discount).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div><div><span>Tax</span><strong>KSh {Number(sale.tax).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div><div className="grand"><span>Total</span><strong>KSh {Number(sale.total).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div><div><span>Paid · {String(sale.payment_method).toUpperCase()}{sale.mpesa_account_type?" · "+String(sale.mpesa_account_type).toUpperCase():""}</span><strong>KSh {Number(sale.amount_paid).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div><div><span>Balance</span><strong>KSh {Number(sale.balance).toLocaleString("en-KE",{minimumFractionDigits:2})}</strong></div>{sale.mpesa_transaction_code&&<div><span>M-Pesa transaction code</span><strong>{sale.mpesa_transaction_code}</strong></div>}</section>
      {sale.notes&&<p className="receipt-notes">Notes: {sale.notes}</p>}
      <footer className="receipt-footer">Thank you for your business.</footer>
    </article>
  </main></BusinessSuspensionGuard>;
}
