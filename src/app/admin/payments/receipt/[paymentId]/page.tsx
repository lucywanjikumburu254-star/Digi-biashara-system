import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "../print-button";

const money=(n:unknown)=>"KSh "+Number(n??0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
export const dynamic="force-dynamic";

export default async function PaymentReceiptPage({params}:{params:Promise<{paymentId:string}>}) {
  const {paymentId}=await params;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await db.from("business_memberships").select("business_id").eq("user_id",user.id).eq("role","owner").eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");
  const [{data:business},{data:payment},{data:allocations}]=await Promise.all([
    db.from("businesses").select("name,phone,location").eq("id",membership.business_id).maybeSingle(),
    db.from("business_payments").select("*,customers(name,phone),suppliers(name,phone),branches(name,address,phone)").eq("business_id",membership.business_id).eq("id",paymentId).maybeSingle(),
    db.from("payment_allocations").select("amount,business_invoices(invoice_number),purchases(purchase_number)").eq("business_id",membership.business_id).eq("payment_id",paymentId)
  ]);
  if(!payment)notFound();const party=payment.customers??payment.suppliers;
  return <main className="receipt-page"><div className="receipt-toolbar no-print"><Link className="btn secondary small" href="/admin/payments">Back to payments</Link><PrintButton/></div><article className="receipt">
    <header className="receipt-heading"><div className="logo">DIGI<em>BIASHARA</em></div><h1>Payment receipt</h1><strong>{business?.name??"Business"}</strong><p>{payment.branches?.name??"Main branch"} · {payment.branches?.address??business?.location??""}</p><p>{payment.branches?.phone??business?.phone??""}</p></header>
    <div className="receipt-meta"><div><small>Receipt number</small><strong>{payment.receipt_number}</strong></div><div><small>Date received / paid</small><strong>{new Date(payment.payment_date).toLocaleString("en-KE")}</strong></div><div><small>{payment.direction==="in"?"Received from":"Paid to"}</small><strong>{party?.name??payment.payer_payee??"—"}</strong><span>{party?.phone??""}</span></div></div>
    <section className="receipt-totals"><div><span>Transaction type</span><strong>{payment.direction==="in"?"Money received":"Money paid"}</strong></div><div><span>Payment method</span><strong>{String(payment.payment_method).toUpperCase()}</strong></div><div><span>Reference</span><strong>{payment.external_reference??payment.cheque_number??"—"}</strong></div>{payment.cheque_number&&<div><span>Cheque status</span><strong>{payment.cheque_status}</strong></div>}<div className="grand"><span>Amount</span><strong>{money(payment.amount)}</strong></div><div><span>Payment status</span><strong>{payment.status.toUpperCase()}</strong></div></section>
    {(allocations??[]).length>0&&<section className="panel"><h2>Allocated to</h2>{(allocations??[]).map((a:any,i:number)=><div key={i} className="receipt-meta"><strong>{a.business_invoices?.invoice_number??a.purchases?.purchase_number??"Document"}</strong><strong>{money(a.amount)}</strong></div>)}</section>}
    {payment.notes&&<p className="receipt-notes">Notes: {payment.notes}</p>}<footer className="receipt-footer">Thank you. Keep this receipt for your records.</footer>
  </article></main>;
}
