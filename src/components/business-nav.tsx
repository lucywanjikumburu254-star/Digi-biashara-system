"use client";

import { useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

const items = [
  ["overview","Overview","/admin/dashboard"],
  ["branches","Branches","/admin/branches"],
  ["catalog","Products & services","/admin/catalog"],
  ["sales","Sales / POS","/admin/sales"],
  ["payments","Invoices & payments","/admin/payments"],
  ["inventory","Inventory","/admin/inventory"],
  ["purchases","Purchases","/admin/purchases"],
  ["expenses","Expenses","/admin/expenses"],
  ["customers","Customers","/admin/customers"],
  ["suppliers","Suppliers","/admin/suppliers"],
  ["staff","Staff","/admin/staff"],
  ["appointments","Appointments","/admin/appointments"],
  ["reports","Reports","/admin/reports"],
] as const;

export default function BusinessNav({active}:{active:string}) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="menu-trigger" aria-label="Open navigation menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className="menu-trigger-icon">{open?"×":"☰"}</span><span>Menu</span>
    </button>
    {open&&<button type="button" aria-label="Close navigation menu" className="nav-backdrop" onClick={()=>setOpen(false)}/>}
    <aside className={"side nav-drawer "+(open?"nav-drawer-open":"")} aria-hidden={!open}>
      <div className="drawer-head"><BrandLogo /><button type="button" className="drawer-close" onClick={()=>setOpen(false)} aria-label="Close menu">×</button></div>
      <div className="sidetitle">Business workspace</div>
      {items.map(([key,label,url])=><Link key={key} tabIndex={open?0:-1} className={"navlink "+(active===key?"active":"")} href={url} onClick={()=>setOpen(false)}>{label}</Link>)}
      <div className="sidetitle">Account</div>
      <Link tabIndex={open?0:-1} className={"navlink "+(active==="payment-settings"?"active":"")} href="/admin/payment-settings" onClick={()=>setOpen(false)}>Payment methods</Link>
      <Link tabIndex={open?0:-1} className={"navlink "+(active==="billing"?"active":"")} href="/admin/billing" onClick={()=>setOpen(false)}>Billing & subscription</Link>
      <form action="/logout" method="post"><button tabIndex={open?0:-1} type="submit" className="navlink" style={{width:"100%",textAlign:"left",border:0,background:"transparent",cursor:"pointer",font:"inherit"}}>Sign out</button></form>
    </aside>
  </>;
}
