"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BusinessNav from "@/components/business-nav";
import BrandLogo from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, any>;
const money = (value: unknown) => "KSh " + Number(value ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (date: string, days: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const mondayOf = (date: string) => { const day = new Date(date + "T12:00:00Z").getUTCDay(); return plusDays(date, -(day === 0 ? 6 : day - 1)); };
const startIso = (date: string) => new Date(date + "T00:00:00+03:00").toISOString();
const endIso = (date: string) => new Date(plusDays(date, 1) + "T00:00:00+03:00").toISOString();
const labelDate = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—";

export default function PosReports({ businessId, businessName, role, assignedBranchId }: { businessId: string; businessName: string; role: string; assignedBranchId: string | null }) {
  const db = useMemo(() => createClient(), []);
  const [branches, setBranches] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState(assignedBranchId ?? (role === "owner" || role === "super_admin" ? "all" : "none"));
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
  const [generatedAt, setGeneratedAt] = useState("");
  const [printedAt, setPrintedAt] = useState("");
  const [reportRef, setReportRef] = useState("Preparing report reference…");

  const isOwner = role === "owner" || role === "super_admin";
  const range = useMemo(() => customRange
    ? { from: customStart, to: customEnd }
    : { from: mondayOf(selectedDate), to: plusDays(mondayOf(selectedDate), 6) },
  [customRange, customStart, customEnd, selectedDate]);

  useEffect(() => {
    const now = new Date();
    setGeneratedAt(now.toISOString());
    setReportRef("DB-" + now.getTime().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase());
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: branchRows, error: branchError } = await db.from("branches").select("id,name").eq("business_id", businessId).order("name");
      if (branchError) throw branchError;
      setBranches(branchRows ?? []);
      if (customRange && customEnd < customStart) throw new Error("The end date must be on or after the start date.");
      const from = startIso(range.from);
      const until = endIso(range.to);
      let salesQuery = db.from("sales").select("*,branches(name),customers(name)").eq("business_id", businessId).gte("created_at", from).lt("created_at", until).order("created_at", { ascending: false });
      let paymentQuery = db.from("business_payments").select("*,branches(name)").eq("business_id", businessId).gte("payment_date", from).lt("payment_date", until).order("payment_date", { ascending: false });
      if (branchId !== "all") { salesQuery = salesQuery.eq("branch_id", branchId); paymentQuery = paymentQuery.eq("branch_id", branchId); }
      const [salesResult, paymentResult, staffResult] = await Promise.all([
        salesQuery,
        paymentQuery,
        db.from("business_staff").select("user_id,full_name").eq("business_id", businessId)
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
      setError(e instanceof Error ? e.message : "Unable to load the complete report.");
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
  const completedIds = new Set(completedSales.map((s) => s.id));
  const completedItems = items.filter((item) => completedIds.has(item.sale_id));
  const classify = (item: Row) => (productMap.get(item.product_id)?.item_type ?? "product") === "service" ? "service" : "product";
  const productItems = completedItems.filter((item) => classify(item) === "product");
  const serviceItems = completedItems.filter((item) => classify(item) === "service");
  const aggregateItems = (rows: Row[]) => {
    const grouped = new Map<string, { name: string; quantity: number; revenue: number; category: string; unit: string }>();
    for (const item of rows) {
      const product = productMap.get(item.product_id);
      const key = item.product_id ?? item.item_name ?? "item";
      const current = grouped.get(key) ?? { name: product?.name ?? item.item_name ?? "Item", quantity: 0, revenue: 0, category: product?.category ?? "", unit: product?.unit ?? "" };
      current.quantity += Number(item.quantity ?? 0);
      current.revenue += Number(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0));
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity);
  };
  const productTotals = aggregateItems(productItems);
  const serviceTotals = aggregateItems(serviceItems);

  const paymentRows = useMemo(() => {
    const rows: Row[] = [];
    const seenCodes = new Set<string>();
    for (const sale of completedSales) {
      const method = String(sale.payment_method ?? "").toLowerCase();
      const code = String(sale.mpesa_transaction_code ?? "").trim().toUpperCase();
      if (code) seenCodes.add(code);
      if (Number(sale.amount_paid ?? 0) > 0) rows.push({ id: "sale-" + sale.id, date: sale.created_at, method, amount: Number(sale.amount_paid ?? 0), reference: code, status: "recorded", direction: "in", branch_id: sale.branch_id, created_by: sale.created_by, source: "POS sale", sale_number: sale.sale_number, account_type: sale.mpesa_account_type });
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

  const mpesaRows = paymentRows.filter((p) => p.method === "mpesa");
  const incoming = (rows: Row[]) => rows.filter((r) => r.direction === "in" && ["confirmed", "recorded"].includes(String(r.status).toLowerCase())).reduce((sum, r) => sum + r.amount, 0);
  const outgoing = (rows: Row[]) => rows.filter((r) => r.direction === "out" || ["refunded", "reversed"].includes(String(r.status).toLowerCase())).reduce((sum, r) => sum + r.amount, 0);
  const methodTotals = paymentRows.filter((p) => p.direction === "in" && ["confirmed", "recorded"].includes(String(p.status).toLowerCase())).reduce((map: Map<string, number>, p: Row) => map.set(p.method || "unspecified", (map.get(p.method || "unspecified") ?? 0) + p.amount), new Map<string, number>());
  const methodSummary: Array<[string, number]> = Array.from(methodTotals.entries());
  const periodText = range.from === range.to ? labelDate(range.from) : labelDate(range.from) + " – " + labelDate(range.to);
  const selectedBranchName = branchId === "all" ? "All branches" : branchName(branchId);
  const generatedText = generatedAt ? dateTime(generatedAt) + " EAT" : "—";

  function printReport() {
    setPrintedAt(new Date().toISOString());
    window.requestAnimationFrame(() => window.print());
  }

  return <div className="layout"><BusinessNav active="sales-reports"/><main className="main"><div className="pos-report-page">
    <div className="pos-report-toolbar no-print">
      <Link className="btn secondary small" href="/admin/sales">← Back to POS</Link>
      <div className="pos-report-actions"><button className="btn secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh report</button><button className="btn" type="button" onClick={printReport} disabled={loading}>Download complete PDF / Print</button></div>
    </div>

    <section className="panel no-print">
      <div className="panelhead"><div><div className="eyebrow">Sales / POS</div><h1>Complete business report</h1><p className="muted">One report containing sales, products, services, individual receipts and all recorded payments.</p></div></div>
      <div className="form-grid">
        <label className="field"><span>Reporting date (weekly: Monday–Sunday)</span><input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setCustomRange(false); }} /></label>
        <label className="field"><span>Branch</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!isOwner}>{isOwner && <option value="all">All branches</option>}{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>Custom date range</span><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={customRange} onChange={(e) => setCustomRange(e.target.checked)} /><span>Use custom dates</span></div></label>
        {customRange && <><label className="field"><span>From</span><input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label className="field"><span>To</span><input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label></>}
      </div>
      {!isOwner && <p className="muted">Your report is limited to your assigned branch.</p>}
      <p className="muted">The report automatically covers the selected Monday–Sunday week, or your custom date range. All dates and times use East Africa Time (Nairobi).</p>
      {error && <div className="error" role="alert">{error}</div>}
    </section>

    <article className="panel pos-report-paper">
      <div className="pos-report-watermark" aria-hidden="true">DIGI BIASHARA · OFFICIAL BUSINESS RECORD</div>
      <header className="pos-report-heading">
        <div className="report-brand"><BrandLogo className="report-brand-logo"/></div>
        <div className="eyebrow">OFFICIAL BUSINESS FINANCIAL RECORD</div>
        <h1>COMPLETE POS & PAYMENT REPORT</h1>
        <strong>{businessName}</strong>
        <p>{selectedBranchName} · {periodText}</p>
        <div className="report-meta"><span>Generated: {generatedText}</span><span>Report reference: {reportRef}</span></div>
      </header>

      {loading ? <p className="empty">Loading complete report data…</p> : error ? <div className="error" role="alert">{error}</div> : <>
        <section className="report-section">
          <h2>1. Business performance summary</h2>
          <div className="pos-report-stats">
            <div><small>Completed sales</small><strong>{completedSales.length}</strong></div>
            <div><small>Total sales recorded</small><strong>{money(salesTotal)}</strong></div>
            <div><small>Payments recorded on sales</small><strong>{money(salesPaid)}</strong></div>
            <div><small>Outstanding balances</small><strong>{money(salesBalance)}</strong></div>
          </div>
          <div className="report-summary-line"><span>Product sales value</span><strong>{money(productTotals.reduce((n, x) => n + x.revenue, 0))}</strong></div>
          <div className="report-summary-line"><span>Service sales value</span><strong>{money(serviceTotals.reduce((n, x) => n + x.revenue, 0))}</strong></div>
          <div className="report-summary-line"><span>Recorded incoming payments (all sources)</span><strong>{money(incoming(paymentRows))}</strong></div>
          <div className="report-summary-line"><span>Recorded outgoing / refunds</span><strong>{money(outgoing(paymentRows))}</strong></div>
        </section>

        <section className="report-section">
          <h2>2. Products sold</h2>
          <p className="report-note">Products are listed separately from services.</p>
          <table className="table"><thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Sales total</th></tr></thead><tbody>
            {productTotals.length ? productTotals.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.category || "—"}</td><td>{x.quantity.toLocaleString("en-KE")}</td><td>{x.unit || "—"}</td><td>{money(x.revenue)}</td></tr>) : <tr><td colSpan={5}>No product sales recorded for this period.</td></tr>}
          </tbody><tfoot><tr><th colSpan={2}>Products total</th><th>{productTotals.reduce((n, x) => n + x.quantity, 0).toLocaleString("en-KE")}</th><th></th><th>{money(productTotals.reduce((n, x) => n + x.revenue, 0))}</th></tr></tfoot></table>
        </section>

        <section className="report-section">
          <h2>3. Services sold</h2>
          <p className="report-note">Services are listed separately from physical products.</p>
          <table className="table"><thead><tr><th>Service</th><th>Category</th><th>Times performed</th><th>Unit</th><th>Sales total</th></tr></thead><tbody>
            {serviceTotals.length ? serviceTotals.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.category || "—"}</td><td>{x.quantity.toLocaleString("en-KE")}</td><td>{x.unit || "—"}</td><td>{money(x.revenue)}</td></tr>) : <tr><td colSpan={5}>No service sales recorded for this period.</td></tr>}
          </tbody><tfoot><tr><th colSpan={2}>Services total</th><th>{serviceTotals.reduce((n, x) => n + x.quantity, 0).toLocaleString("en-KE")}</th><th></th><th>{money(serviceTotals.reduce((n, x) => n + x.revenue, 0))}</th></tr></tfoot></table>
        </section>

        <section className="report-section">
          <h2>4. Individual sales and itemised receipts</h2>
          <p className="report-note">Each completed sale is shown separately, with its products, services, sale total and amount paid.</p>
          {completedSales.length ? completedSales.map((sale) => {
            const saleItems = completedItems.filter((item) => item.sale_id === sale.id);
            const saleProductItems = saleItems.filter((item) => classify(item) === "product");
            const saleServiceItems = saleItems.filter((item) => classify(item) === "service");
            return <div className="sale-receipt" key={sale.id}>
              <div className="sale-receipt-head"><div><strong>SALE RECEIPT · {sale.sale_number || String(sale.id).slice(0, 8).toUpperCase()}</strong><small>{dateTime(sale.created_at)} EAT</small></div><strong className="sale-total">{money(sale.total)}</strong></div>
              <div className="sale-details"><span>Customer: {sale.customers?.name ?? "Walk-in"}</span><span>Cashier: {cashierName(sale.created_by)}</span><span>Branch: {sale.branches?.name ?? branchName(sale.branch_id)}</span></div>
              <table className="table receipt-items"><thead><tr><th>Item / service</th><th>Type</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>
                {saleItems.length ? saleItems.map((item, index) => <tr key={item.id ?? index}><td>{productMap.get(item.product_id)?.name ?? item.item_name ?? "Item"}</td><td>{classify(item) === "service" ? "Service" : "Product"}</td><td>{Number(item.quantity ?? 0).toLocaleString("en-KE")}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0))}</td></tr>) : <tr><td colSpan={5}>Item details are not available for this sale.</td></tr>}
              </tbody></table>
              <div className="receipt-breakdown">
                <span>Products: {money(saleProductItems.reduce((n, item) => n + Number(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0)), 0))}</span>
                <span>Services: {money(saleServiceItems.reduce((n, item) => n + Number(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0)), 0))}</span>
                <span>Sale total: <strong>{money(sale.total)}</strong></span>
                <span>Amount paid: <strong>{money(sale.amount_paid)}</strong></span>
                <span>Balance: <strong>{money(sale.balance)}</strong></span>
                <span>Payment method: {String(sale.payment_method ?? "—").toUpperCase()}</span>
                {sale.mpesa_transaction_code && <span>M-Pesa code: {sale.mpesa_transaction_code}</span>}
              </div>
            </div>;
          }) : <p className="report-empty">No completed sales recorded for this period.</p>}
        </section>

        <section className="report-section">
          <h2>5. Payment summary and recorded transactions</h2>
          <div className="pos-report-stats">
            <div><small>Incoming payments recorded</small><strong>{money(incoming(paymentRows))}</strong></div>
            <div><small>Outgoing / refunds recorded</small><strong>{money(outgoing(paymentRows))}</strong></div>
            <div><small>Payment records</small><strong>{paymentRows.length}</strong></div>
            <div><small>M-Pesa recorded</small><strong>{money(incoming(mpesaRows))}</strong></div>
          </div>
          <h3>Payment method totals</h3>
          <table className="table"><thead><tr><th>Payment method</th><th>Recorded amount received</th></tr></thead><tbody>{methodSummary.length ? methodSummary.map(([method, amount]) => <tr key={method}><td>{method.toUpperCase()}</td><td>{money(amount)}</td></tr>) : <tr><td colSpan={2}>No incoming payments recorded.</td></tr>}</tbody></table>
          <h3>All payment records</h3>
          <table className="table"><thead><tr><th>Date & time</th><th>Method</th><th>Reference</th><th>Source</th><th>Recorded by</th><th>Status</th><th>Direction</th><th>Amount</th></tr></thead><tbody>
            {paymentRows.length ? paymentRows.map((p) => <tr key={p.id}><td>{dateTime(p.date)}</td><td>{String(p.method || "—").toUpperCase()}</td><td>{p.reference || "—"}</td><td>{p.source}</td><td>{cashierName(p.created_by)}</td><td>{p.status || "—"}</td><td>{p.direction === "out" ? "Paid out" : "Received"}</td><td>{money(p.amount)}</td></tr>) : <tr><td colSpan={8}>No payment records found for this period.</td></tr>}
          </tbody></table>
        </section>

        <section className="report-section">
          <h2>6. M-Pesa transaction statement</h2>
          <p className="report-note">This section includes M-Pesa transactions recorded from the POS and payment ledger. It is a Digi Biashara business record, not an official Safaricom statement or independent confirmation of settlement.</p>
          <div className="report-summary-line"><span>M-Pesa incoming recorded</span><strong>{money(incoming(mpesaRows))}</strong></div>
          <div className="report-summary-line"><span>M-Pesa outgoing / refunds recorded</span><strong>{money(outgoing(mpesaRows))}</strong></div>
          <div className="report-summary-line"><span>Net M-Pesa recorded</span><strong>{money(incoming(mpesaRows) - outgoing(mpesaRows))}</strong></div>
          <table className="table"><thead><tr><th>Date & time</th><th>Transaction code</th><th>Account / source</th><th>Branch</th><th>Recorded by</th><th>Status</th><th>Amount</th></tr></thead><tbody>
            {mpesaRows.length ? mpesaRows.map((p) => <tr key={p.id}><td>{dateTime(p.date)}</td><td>{p.reference || "No code"}</td><td>{String(p.account_type ?? p.source).toUpperCase()}</td><td>{branchName(p.branch_id)}</td><td>{cashierName(p.created_by)}</td><td>{p.status || "—"}</td><td>{money(p.amount)}</td></tr>) : <tr><td colSpan={7}>No M-Pesa transactions recorded for this period.</td></tr>}
          </tbody></table>
        </section>

        <section className="report-authentication">
          <div className="official-seal"><span className="seal-top">DIGI BIASHARA</span><span className="seal-mark">✓</span><strong>OFFICIAL REPORT</strong><small>DIGITAL KINGDOM SOLUTIONS</small><small>GENERATED {generatedAt ? new Date(generatedAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"}</small></div>
          <div className="verification-stamp"><strong>DIGI BIASHARA</strong><b>✓ OFFICIAL DIGITAL BUSINESS REPORT</b><span>Generated by Digital Kingdom Solutions</span><span>Generated: {generatedText}</span>{printedAt && <span>Printed: {dateTime(printedAt)} EAT</span>}<span>Report ID: {reportRef}</span><small>Keep this reference when verifying this report.</small></div>
        </section>
      </>}

      <footer className="pos-report-footer">Generated by Digi Biashara · Digital Kingdom Solutions · Report reference: {reportRef} · This report reflects records stored in the selected business, branch and period.</footer>
    </article>

    <style jsx global>{`
      @media print {
        @page { size: A4 landscape; margin: 12mm; }
        html, body { background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .no-print, .side, .dashhead, .receipt-toolbar, .menu-trigger { display: none !important; }
        .pos-report-page { padding: 0 !important; max-width: none !important; }
        .pos-report-paper { border: 0 !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        .pos-report-paper .table { width: 100%; font-size: 8px; }
        .pos-report-paper tr, .sale-receipt, .report-authentication { break-inside: avoid; page-break-inside: avoid; }
        .pos-report-watermark { position: fixed !important; display: block !important; }
        .pos-report-heading, .report-section, .pos-report-footer, .report-authentication { position: relative; z-index: 1; }
      }
      .pos-report-page { max-width: 1500px; margin: 0 auto; padding: 24px; }
      .pos-report-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
      .pos-report-actions { display:flex; gap:8px; }
      .pos-report-paper { position:relative; overflow:hidden; isolation:isolate; }
      .pos-report-watermark { display:none; pointer-events:none; position:absolute; inset:0; z-index:0; overflow:hidden; color:rgba(37,99,235,.055); font-size:36px; font-weight:900; letter-spacing:5px; line-height:3.2; transform:rotate(-28deg) scale(1.25); text-align:center; word-spacing:24px; }
      .pos-report-heading, .report-section, .pos-report-footer, .report-authentication { position:relative; z-index:1; }
      .pos-report-heading { text-align:center; padding:14px 0 20px; border-bottom:3px solid #1d4ed8; margin-bottom:20px; }
      .report-brand { display:flex; justify-content:center; margin-bottom:8px; }
      .report-brand-logo { display:inline-flex; justify-content:center; }
      .report-brand-logo img { width:190px; height:auto; object-fit:contain; }
      .pos-report-heading .eyebrow { color:#1d4ed8; font-weight:800; letter-spacing:2px; }
      .pos-report-heading h1 { margin:8px 0; font-size:25px; color:#173b75; letter-spacing:.5px; }
      .pos-report-heading p { margin:5px 0; }
      .report-meta { display:flex; justify-content:center; flex-wrap:wrap; gap:8px 24px; margin-top:10px; font-size:11px; color:#475569; }
      .report-section { margin:22px 0; }
      .report-section h2 { color:#173b75; border-bottom:1px solid #bfdbfe; padding-bottom:7px; margin:0 0 12px; font-size:16px; }
      .report-section h3 { margin:16px 0 8px; font-size:13px; color:#1e40af; }
      .report-note, .report-empty { font-size:11px; color:#64748b; }
      .pos-report-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:14px 0 18px; }
      .pos-report-stats > div { border:1px solid #bfdbfe; border-top:3px solid #2563eb; border-radius:7px; padding:10px; display:flex; flex-direction:column; gap:5px; background:rgba(239,246,255,.7); }
      .pos-report-stats small { color:#475569; font-size:10px; }
      .pos-report-stats strong { font-size:17px; color:#173b75; }
      .pos-report-paper .table { width:100%; border-collapse:collapse; font-size:10px; }
      .pos-report-paper .table th { background:#eff6ff; color:#173b75; font-weight:800; }
      .pos-report-paper .table th, .pos-report-paper .table td { border:1px solid #dbe3ef; padding:6px 7px; text-align:left; vertical-align:top; }
      .pos-report-paper .table tfoot th { background:#dbeafe; }
      .report-summary-line { display:flex; justify-content:space-between; gap:12px; padding:7px 9px; border-bottom:1px solid #e2e8f0; font-size:11px; }
      .sale-receipt { border:1px solid #cbd5e1; border-left:4px solid #2563eb; border-radius:7px; padding:11px; margin:13px 0; background:rgba(255,255,255,.82); }
      .sale-receipt-head { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-bottom:8px; border-bottom:1px solid #dbe3ef; color:#173b75; }
      .sale-receipt-head > div { display:flex; flex-direction:column; gap:3px; }
      .sale-receipt-head small { color:#64748b; font-size:10px; }
      .sale-total { font-size:16px; }
      .sale-details { display:flex; flex-wrap:wrap; gap:6px 18px; padding:8px 0; font-size:10px; color:#475569; }
      .receipt-items { margin:4px 0 8px; }
      .receipt-breakdown { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px 18px; font-size:10px; padding-top:7px; border-top:1px solid #dbe3ef; }
      .report-authentication { display:flex; justify-content:center; align-items:center; gap:28px; flex-wrap:wrap; border-top:2px solid #1d4ed8; padding:22px 0 8px; margin-top:30px; }
      .official-seal { width:170px; height:170px; border:4px double #1d4ed8; border-radius:50%; color:#1d4ed8; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; outline:1px solid #1d4ed8; outline-offset:4px; gap:5px; background:rgba(239,246,255,.55); }
      .official-seal .seal-top { font-size:13px; font-weight:900; letter-spacing:1px; }
      .official-seal .seal-mark { font-size:28px; line-height:1; border:2px solid #1d4ed8; border-radius:50%; width:37px; height:37px; display:grid; place-items:center; }
      .official-seal strong { font-size:11px; }
      .official-seal small { font-size:7px; font-weight:700; }
      .verification-stamp { border:3px double #1d4ed8; color:#173b75; padding:12px 16px; min-width:280px; display:flex; flex-direction:column; gap:5px; background:rgba(239,246,255,.65); }
      .verification-stamp strong { font-size:17px; letter-spacing:1px; }
      .verification-stamp b { color:#15803d; font-size:10px; }
      .verification-stamp span, .verification-stamp small { font-size:9px; }
      .pos-report-footer { border-top:1px solid #cbd5e1; margin-top:22px; padding-top:9px; font-size:9px; text-align:center; color:#64748b; }
      @media(max-width:760px) { .pos-report-page { padding:12px; } .pos-report-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .pos-report-toolbar { flex-wrap:wrap; } .report-meta { flex-direction:column; gap:4px; } .sale-details { flex-direction:column; gap:4px; } }
    `}</style>
  </div></main></div>;
}
