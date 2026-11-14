"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BusinessNav from "@/components/business-nav";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, any>;
type ReportType = "daily-sales" | "weekly-sales" | "daily-payments" | "weekly-payments" | "products" | "weekly-products" | "services" | "weekly-services" | "mpesa";
const money = (value: unknown) => "KSh " + Number(value ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (date: string, days: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const mondayOf = (date: string) => { const day = new Date(date + "T12:00:00Z").getUTCDay(); return plusDays(date, -(day === 0 ? 6 : day - 1)); };
const startIso = (date: string) => new Date(date + "T00:00:00+03:00").toISOString();
const endIso = (date: string) => new Date(plusDays(date, 1) + "T00:00:00+03:00").toISOString();
const labelDate = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function PosReports({ businessId, businessName, role, assignedBranchId }: { businessId: string; businessName: string; role: string; assignedBranchId: string | null }) {
  const db = useMemo(() => createClient(), []);
  const [branches, setBranches] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState(assignedBranchId ?? (role === "owner" || role === "super_admin" ? "all" : "none"));
  const [report, setReport] = useState<ReportType>("daily-sales");
  const [selectedDate, setSelectedDate] = useState(nairobiDate());
  const [customStart, setCustomStart] = useState(nairobiDate());
  const [customEnd, setCustomEnd] = useState(nairobiDate());
  const [customRange, setCustomRange] = useState(false);
  const [sales, setSales] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [staff, setStaff] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isOwner = role === "owner" || role === "super_admin";
  const range = useMemo(() => {
    if (customRange) return { from: customStart, to: customEnd };
    if (report.startsWith("weekly")) { const from = mondayOf(selectedDate); return { from, to: plusDays(from, 6) }; }
    return { from: selectedDate, to: selectedDate };
  }, [customRange, customStart, customEnd, report, selectedDate]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const branchQuery = db.from("branches").select("id,name").eq("business_id", businessId).order("name");
      const { data: branchRows, error: branchError } = await branchQuery;
      if (branchError) throw branchError;
      setBranches(branchRows ?? []);

      if (customRange && customEnd < customStart) throw new Error("The end date must be on or after the start date.");
      const from = startIso(range.from);
      const until = endIso(range.to);
      let salesQuery = db.from("sales").select("*,branches(name),customers(name)").eq("business_id", businessId).gte("created_at", from).lt("created_at", until).order("created_at", { ascending: false });
      let paymentQuery = db.from("business_payments").select("*,branches(name)").eq("business_id", businessId).gte("payment_date", from).lt("payment_date", until).order("payment_date", { ascending: false });
      if (branchId !== "all") { salesQuery = salesQuery.eq("branch_id", branchId); paymentQuery = paymentQuery.eq("branch_id", branchId); }
      const [salesResult, paymentResult, staffResult] = await Promise.all([
        salesQuery, paymentQuery, db.from("business_staff").select("user_id,full_name").eq("business_id", businessId)
      ]);
      if (salesResult.error) throw salesResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (staffResult.error) throw staffResult.error;
      const saleRows = salesResult.data ?? [];
      const saleIds = saleRows.map((s: Row) => s.id);
      let itemRows: Row[] = [];
      if (saleIds.length) {
        const itemResult = await db.from("sale_items").select("*").in("sale_id", saleIds);
        if (itemResult.error) throw itemResult.error;
        itemRows = itemResult.data ?? [];
      }
      const productIds = Array.from(new Set(itemRows.map((item: Row) => item.product_id).filter(Boolean)));
      let productRows: Row[] = [];
      if (productIds.length) {
        const productResult = await db.from("products").select("id,name,item_type,unit,category").eq("business_id", businessId).in("id", productIds);
        if (productResult.error) throw productResult.error;
        productRows = productResult.data ?? [];
      }
      setSales(saleRows); setPayments(paymentResult.data ?? []); setItems(itemRows); setProducts(productRows); setStaff(staffResult.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load reports.");
      setSales([]); setPayments([]); setItems([]); setProducts([]); setStaff([]);
    } finally { setLoading(false); }
  }, [db, businessId, branchId, range.from, range.to, customRange, customStart, customEnd]);

  useEffect(() => { void load(); }, [load]);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "Unassigned";
  const cashierName = (id: string | null) => staff.find((s) => s.user_id === id)?.full_name ?? "Staff member";
  const completedSales = sales.filter((s) => s.status === "completed");
  const salesTotal = completedSales.reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const salesPaid = completedSales.reduce((sum, s) => sum + Number(s.amount_paid ?? 0), 0);
  const salesBalance = completedSales.reduce((sum, s) => sum + Number(s.balance ?? 0), 0);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const itemRows = items.filter((item) => completedSales.some((s) => s.id === item.sale_id));
  const aggregateItems = (kind: "product" | "service") => {
    const grouped = new Map<string, { name: string; quantity: number; revenue: number; category: string }>();
    for (const item of itemRows) {
      const product = productMap.get(item.product_id);
      if ((product?.item_type ?? "product") !== kind) continue;
      const key = item.product_id ?? item.item_name ?? "item";
      const current = grouped.get(key) ?? { name: product?.name ?? item.item_name ?? "Item", quantity: 0, revenue: 0, category: product?.category ?? "" };
      current.quantity += Number(item.quantity ?? 0);
      current.revenue += Number(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0));
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity);
  };
  const productTotals = aggregateItems("product");
  const serviceTotals = aggregateItems("service");

  const paymentRows = useMemo(() => {
    const rows: Row[] = [];
    const seenCodes = new Set<string>();
    for (const sale of completedSales) {
      const method = String(sale.payment_method ?? "").toLowerCase();
      const code = String(sale.mpesa_transaction_code ?? "").trim().toUpperCase();
      if (code) seenCodes.add(code);
      rows.push({ id: "sale-" + sale.id, date: sale.created_at, method, amount: Number(sale.amount_paid ?? 0), reference: code, status: "recorded", direction: "in", branch_id: sale.branch_id, created_by: sale.created_by, source: "POS sale", sale_number: sale.sale_number, account_type: sale.mpesa_account_type });
    }
    for (const payment of payments) {
      const method = String(payment.payment_method ?? "").toLowerCase();
      const code = String(payment.external_reference ?? "").trim().toUpperCase();
      if (method === "mpesa" && code && seenCodes.has(code)) continue;
      if (method === "mpesa" && code) seenCodes.add(code);
      rows.push({ id: "payment-" + payment.id, date: payment.payment_date, method, amount: Number(payment.amount ?? 0), reference: code, status: payment.status, direction: payment.direction, branch_id: payment.branch_id, created_by: payment.created_by, source: payment.payment_type ?? "Payment ledger", receipt_number: payment.receipt_number, account_type: payment.account_name });
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [completedSales, payments]);

  const mpesaRows = paymentRows.filter((p) => p.method === "mpesa" && (p.reference || p.status));
  const incoming = (rows: Row[]) => rows.filter((r) => r.direction === "in" && ["confirmed", "recorded"].includes(r.status)).reduce((sum, r) => sum + r.amount, 0);
  const outgoing = (rows: Row[]) => rows.filter((r) => r.direction === "out" || ["refunded", "reversed"].includes(r.status)).reduce((sum, r) => sum + r.amount, 0);
  const methodTotals = paymentRows.filter((p) => p.direction === "in" && ["confirmed", "recorded"].includes(p.status)).reduce((map, p) => map.set(p.method, (map.get(p.method) ?? 0) + p.amount), new Map<string, number>());

  function downloadPdf() { window.print(); }
  const reportTitle = report === "daily-sales" ? "Daily Sales Report" : report === "weekly-sales" ? "Weekly Sales Report" : report === "daily-payments" ? "Daily Payments Report" : report === "weekly-payments" ? "Weekly Payments Report" : report === "products" ? "Daily Products Sold Report" : report === "weekly-products" ? "Weekly Products Sold Report" : report === "services" ? "Daily Services Sold Report" : report === "weekly-services" ? "Weekly Services Sold Report" : "M-Pesa Statement";
  const periodText = range.from === range.to ? labelDate(range.from) : labelDate(range.from) + " – " + labelDate(range.to);
  const selectedRows = report === "mpesa" ? mpesaRows : paymentRows;

  return <div className="layout"><BusinessNav active="sales-reports"/><main className="main"><div className="pos-report-page">
    <div className="pos-report-toolbar no-print">
      <Link className="btn secondary small" href="/admin/sales">← Back to POS</Link>
      <div className="pos-report-actions"><button className="btn secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button><button className="btn" type="button" onClick={downloadPdf} disabled={loading}>Download PDF / Print</button></div>
    </div>
    <div className="panel no-print">
      <div className="panelhead"><div><div className="eyebrow">Sales / POS</div><h1>Reports & statements</h1><p className="muted">Downloadable sales, payments, products, services and M-Pesa records.</p></div></div>
      <div className="form-grid">
        <label className="field"><span>Report type</span><select value={report} onChange={(e) => { setReport(e.target.value as ReportType); setCustomRange(false); }}><option value="daily-sales">Daily sales</option><option value="weekly-sales">Weekly sales (Monday–Sunday)</option><option value="daily-payments">Daily payments</option><option value="weekly-payments">Weekly payments (Monday–Sunday)</option><option value="products">Daily products sold</option><option value="weekly-products">Weekly products sold</option><option value="services">Daily services sold</option><option value="weekly-services">Weekly services sold</option><option value="mpesa">M-Pesa statement (all recorded M-Pesa)</option></select></label>
        <label className="field"><span>Selected date</span><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></label>
        <label className="field"><span>Branch</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!isOwner}>{isOwner && <option value="all">All branches</option>}{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>Custom date range</span><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={customRange} onChange={(e) => setCustomRange(e.target.checked)} /><span>Use custom dates</span></div></label>
        {customRange && <><label className="field"><span>From</span><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label className="field"><span>To</span><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label></>}
      </div>
      {!isOwner && <p className="muted">Your report is limited to your assigned branch.</p>}
      <p className="muted">Weekly reports run Monday to Sunday. All dates and times use East Africa Time (Nairobi).</p>
      {error && <div className="error" role="alert">{error}</div>}
    </div>

    <article className="panel pos-report-paper">
      <header className="pos-report-heading"><div className="logo">DIGI<em>BIASHARA</em></div><div className="eyebrow">Business financial record</div><h1>{reportTitle}</h1><strong>{businessName}</strong><p>{branchId === "all" ? "All branches" : branchName(branchId)} · {periodText}</p><small>Generated: {new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</small></header>
      {loading ? <p className="empty">Loading report data…</p> : <>
        {report === "daily-sales" || report === "weekly-sales" ? <>
          <div className="pos-report-stats"><div><small>Completed sales</small><strong>{completedSales.length}</strong></div><div><small>Gross sales</small><strong>{money(salesTotal)}</strong></div><div><small>Payments collected on sales</small><strong>{money(salesPaid)}</strong></div><div><small>Outstanding balances</small><strong>{money(salesBalance)}</strong></div></div>
          <h2>Sales transactions</h2><table className="table"><thead><tr><th>Sale no.</th><th>Date & time</th><th>Customer</th><th>Cashier</th><th>Branch</th><th>Method</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{completedSales.map((s) => <tr key={s.id}><td>{s.sale_number}</td><td>{new Date(s.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td>{s.customers?.name ?? "Walk-in"}</td><td>{cashierName(s.created_by)}</td><td>{s.branches?.name ?? branchName(s.branch_id)}</td><td>{String(s.payment_method ?? "").toUpperCase()}</td><td>{money(s.total)}</td><td>{money(s.amount_paid)}</td><td>{money(s.balance)}</td></tr>)}</tbody></table>
        </> : null}
        {report === "daily-payments" || report === "weekly-payments" ? <>
          <div className="pos-report-stats"><div><small>Payments received</small><strong>{money(incoming(paymentRows))}</strong></div><div><small>Payments / refunds out</small><strong>{money(outgoing(paymentRows))}</strong></div><div><small>Transactions</small><strong>{paymentRows.length}</strong></div><div><small>M-Pesa received</small><strong>{money(methodTotals.get("mpesa") ?? 0)}</strong></div></div>
          <h2>Payment method summary</h2><table className="table"><thead><tr><th>Method</th><th>Amount received</th></tr></thead><tbody>{Array.from(methodTotals.entries()).map(([method, amount]) => <tr key={method}><td>{method.toUpperCase()}</td><td>{money(amount)}</td></tr>)}</tbody></table>
          <h2>Payment transactions</h2><table className="table"><thead><tr><th>Date & time</th><th>Method</th><th>Reference</th><th>Source</th><th>Cashier / recorder</th><th>Status</th><th>Amount</th></tr></thead><tbody>{paymentRows.map((p) => <tr key={p.id}><td>{new Date(p.date).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td>{p.method.toUpperCase()}</td><td>{p.reference || "—"}</td><td>{p.source}</td><td>{cashierName(p.created_by)}</td><td>{p.status}</td><td>{money(p.amount)}</td></tr>)}</tbody></table>
        </> : null}
        {report === "products" || report === "weekly-products" || report === "services" || report === "weekly-services" ? <>
          {(() => { const list = report === "products" || report === "weekly-products" ? productTotals : serviceTotals; const totalQty = list.reduce((n, x) => n + x.quantity, 0); const totalRevenue = list.reduce((n, x) => n + x.revenue, 0); return <><div className="pos-report-stats"><div><small>Items sold / services performed</small><strong>{totalQty.toLocaleString("en-KE")}</strong></div><div><small>Unique {report}</small><strong>{list.length}</strong></div><div><small>Revenue</small><strong>{money(totalRevenue)}</strong></div></div><h2>{report === "products" || report === "weekly-products" ? "Products sold" : "Services performed"}</h2><table className="table"><thead><tr><th>Name</th><th>Category</th><th>Quantity / times</th><th>Revenue</th></tr></thead><tbody>{list.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.category || "—"}</td><td>{x.quantity.toLocaleString("en-KE")}</td><td>{money(x.revenue)}</td></tr>)}</tbody></table></>; })()}
        </> : null}
        {report === "mpesa" ? <>
          <div className="pos-report-stats"><div><small>Recorded M-Pesa receipts</small><strong>{money(incoming(mpesaRows))}</strong></div><div><small>Recorded refunds / reversals</small><strong>{money(outgoing(mpesaRows))}</strong></div><div><small>Net recorded</small><strong>{money(incoming(mpesaRows) - outgoing(mpesaRows))}</strong></div><div><small>Transactions</small><strong>{mpesaRows.length}</strong></div></div>
          <p className="muted">This is a Digi Biashara record of M-Pesa transactions entered or received in the system. It is not an official Safaricom statement or independent proof of settlement.</p>
          <h2>All recorded M-Pesa transactions</h2><table className="table"><thead><tr><th>Date & time</th><th>Transaction code</th><th>Account / source</th><th>Branch</th><th>Recorded by</th><th>Status</th><th>Direction</th><th>Amount</th></tr></thead><tbody>{mpesaRows.map((p) => <tr key={p.id}><td>{new Date(p.date).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td>{p.reference || "No code"}</td><td>{String(p.account_type ?? p.source).toUpperCase()}</td><td>{branchName(p.branch_id)}</td><td>{cashierName(p.created_by)}</td><td>{p.status}</td><td>{p.direction === "out" ? "Paid out" : "Received"}</td><td>{money(p.amount)}</td></tr>)}</tbody></table>
        </> : null}
      </>}
      <footer className="pos-report-footer">Generated by Digi Biashara · This report reflects records stored in the selected business and period.</footer>
    </article>
    <style jsx global>{`
      @media print {
        @page { size: A4 landscape; margin: 12mm; }
        body { background: #fff !important; }
        .no-print, .side, .dashhead, .receipt-toolbar { display: none !important; }
        .pos-report-page { padding: 0 !important; }
        .pos-report-paper { border: 0 !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        .pos-report-paper .table { width: 100%; font-size: 9px; }
        .pos-report-paper tr { break-inside: avoid; }
      }
      .pos-report-page { max-width: 1500px; margin: 0 auto; padding: 24px; }
      .pos-report-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
      .pos-report-actions { display:flex; gap:8px; }
      .pos-report-heading { text-align:center; padding:16px 0 22px; border-bottom:1px solid #ddd; margin-bottom:20px; }
      .pos-report-heading h1 { margin:8px 0; font-size:26px; }
      .pos-report-heading p { margin:5px 0; }
      .pos-report-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0 24px; }
      .pos-report-stats > div { border:1px solid #ddd; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:6px; }
      .pos-report-stats small { color:#666; }
      .pos-report-stats strong { font-size:19px; }
      .pos-report-paper h2 { margin:22px 0 10px; font-size:16px; }
      .pos-report-paper .table { width:100%; border-collapse:collapse; }
      .pos-report-paper .table th, .pos-report-paper .table td { border-bottom:1px solid #ddd; padding:7px; text-align:left; }
      .pos-report-footer { border-top:1px solid #ddd; margin-top:24px; padding-top:10px; font-size:10px; text-align:center; color:#666; }
      @media(max-width:760px) { .pos-report-page { padding:12px; } .pos-report-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .pos-report-toolbar { flex-wrap:wrap; } }
    `}</style>
  </div></main></div>;
}
