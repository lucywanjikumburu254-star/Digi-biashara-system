import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "../../receipt/print-button";

const money=(n:unknown)=>"KSh "+Number(n??0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
export const dynamic="force-dynamic";

export default async function InvoicePrintPage({params}:{params:Promise<{invoiceId:string}>}) {
  const {invoiceId}=await params;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await db.from("business_memberships").select("business_id").eq("user_id",user.id).eq("role","owner").eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");
  const [{data:business},{data:invoice},{data:allocations}]=await Promise.all([
    db.from("businesses").select("name,phone,location").eq("id",membership.business_id).maybeSingle(),
    db.from("business_invoices").select("*,customers(name,phone,address),branches(name,address,phone)").eq("business_id",membership.business_id).eq("id",invoiceId).maybeSingle(),
    db.from("payment_allocations").select("amount,business_payments(status)").eq("business_id",membership.business_id).eq("invoice_id",invoiceId)
  ]);
  if(!invoice)notFound();const paid=(allocations??[]).filter((a:any)=>a.business_payments?.status==="confirmed").reduce((s:number,a:any)=>s+Number(a.amount),0);const balance=Math.max(0,Number(invoice.total)-paid);
  return <main className="receipt-page"><div className="receipt-toolbar no-print"><Link className="btn secondary small" href="/admin/payments">Back to invoices</Link><PrintButton/></div><article className="receipt">
    <header className="receipt-heading"><div className="logo">DIGI<em>BIASHARA</em></div><h1>Invoice</h1><strong>{business?.name??"Business"}</strong><p>{invoice.branches?.name??"Main branch"} · {invoice.branches?.address??business?.location??""}</p><p>{invoice.branches?.phone??business?.phone??""}</p></header>
    <div className="receipt-meta"><div><small>Invoice number</small><strong>{invoice.invoice_number}</strong></div><div><small>Issue date</small><strong>{invoice.issue_date}</strong></div><div><small>Due date</small><strong>{invoice.due_date??"Due on receipt"}</strong></div></div>
    <p><b>Bill to:</b> {invoice.customers?.name??"Customer"} · {invoice.customers?.phone??""}</p>
    <table className="receipt-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{(invoice.items??[]).map((item:any,i:number)=><tr key={i}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total)}</td></tr>)}</tbody></table>
    <section className="receipt-totals"><div><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div><div><span>Discount</span><strong>{money(invoice.discount)}</strong></div><div><span>Tax</span><strong>{money(invoice.tax)}</strong></div><div className="grand"><span>Total due</span><strong>{money(invoice.total)}</strong></div><div><span>Paid</span><strong>{money(paid)}</strong></div><div><span>Balance</span><strong>{money(balance)}</strong></div></section>
    {invoice.notes&&<p className="receipt-notes">Notes: {invoice.notes}</p>}<footer className="receipt-footer">Thank you for your business.</footer>
  </article></main>;
}
