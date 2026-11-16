"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BusinessNav from "@/components/business-nav";
import BrandLogo from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, any>;
type ProductTotal = { id: string; name: string; unit: string; quantity: number; revenue: number };
const money = (n: unknown) => "KSh " + Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (date: string, amount: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); };
const startIso = (date: string) => new Date(date + "T00:00:00+03:00").toISOString();
const endIso = (date: string) => new Date(plusDays(date, 1) + "T00:00:00+03:00").toISOString();
const prettyDate = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-KE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const clock = (value: string) => new Date(value).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" });

export default function DailyInsights({ businessId, businessName, role, assignedBranchId }: { businessId: string; businessName: string; role: string; assignedBranchId: string | null }) {
  const db = useMemo(() => createClient(), []);
  const owner = role === "owner" || role === "super_admin";
  const [date, setDate] = useState(nairobiDate());
  const [branchId, setBranchId] = useState(owner ? "all" : assignedBranchId ?? "none");
  const [branches, setBranches] = useState<Row[]>([]);
  const [sales, setSales] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [stock, setStock] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const branchResult = await db.from("branches").select("id,name").eq("business_id", businessId).order("name");
      if (branchResult.error) throw branchResult.error;
      setBranches(branchResult.data ?? []);

      // Seven Nairobi calendar days, fetched in bounded pages to avoid Supabase's row cap.
      const from = startIso(plusDays(date, -6));
      const until = endIso(date);
      let allSales: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = db.from("sales").select("id,sale_number,total,status,created_at,branch_id,amount_paid,payment_method")
          .eq("business_id", businessId).gte("created_at", from).lt("created_at", until)
          .order("created_at", { ascending: false }).range(offset, offset + 499);
        if (branchId !== "all") query = query.eq("branch_id", branchId);
        const result = await query;
        if (result.error) throw result.error;
        const batch = result.data ?? [];
        allSales = allSales.concat(batch);
        if (batch.length < 500) break;
      }
      setSales(allSales);

      const completedIds = allSales.filter((s) => s.status === "completed").map((s) => s.id);
      let allItems: Row[] = [];
      for (let i = 0; i < completedIds.length; i += 100) {
        const result = await db.from("sale_items").select("id,sale_id,product_id,item_name,quantity,unit_price,line_total")
          .eq("business_id", businessId).in("sale_id", completedIds.slice(i, i + 100));
        if (result.error) throw result.error;
        allItems = allItems.concat(result.data ?? []);
      }
      setItems(allItems);

      const productIds = Array.from(new Set(allItems.map((x) => x.product_id).filter(Boolean)));
      let productRows: Row[] = [];
      for (let i = 0; i < productIds.length; i += 100) {
        const result = await db.from("products").select("id,name,item_type,unit,reorder_level,track_stock")
          .eq("business_id", businessId).in("id", productIds.slice(i, i + 100));
        if (result.error) throw result.error;
        productRows = productRows.concat(result.data ?? []);
      }
      setProducts(productRows);

      let stockQuery = db.from("stock_balances").select("product_id,branch_id,quantity")
        .eq("business_id", businessId);
      if (branchId !== "all") stockQuery = stockQuery.eq("branch_id", branchId);
      const stockResult = await stockQuery;
      if (stockResult.error) throw stockResult.error;
      setStock(stockResult.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load daily business insights.");
      setSales([]); setItems([]); setProducts([]); setStock([]);
    } finally { setLoading(false); }
  }, [db, businessId, date, branchId]);

  useEffect(() => { void load(); }, [load]);

  const todaySales = useMemo(() => sales.filter((s) => s.status === "completed" && new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }) === date), [sales, date]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const todayIds = useMemo(() => new Set(todaySales.map((s) => s.id)), [todaySales]);
  const todayItems = useMemo(() => items.filter((i) => todayIds.has(i.sale_id) && (productMap.get(i.product_id)?.item_type ?? "product") !== "service"), [items, todayIds, productMap]);
  const totals = useMemo(() => {
    const map = new Map<string, ProductTotal>();
    for (const item of todayItems) {
      const id = item.product_id ?? item.item_name ?? "unknown";
      const product = productMap.get(item.product_id);
      const row = map.get(id) ?? { id, name: product?.name ?? item.item_name ?? "Item", unit: product?.unit ?? "", quantity: 0, revenue: 0 };
      row.quantity += Number(item.quantity ?? 0);
      row.revenue += Number(item.line_total ?? Number(item.quantity ?? 0) * Number(item.unit_price ?? 0));
      map.set(id, row);
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  }, [todayItems, productMap]);
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stock) map.set(row.product_id, (map.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
    return map;
  }, [stock]);
  const weekByDay = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = plusDays(date, index - 6);
    const rows = sales.filter((s) => s.status === "completed" && new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }) === day);
    return { day, amount: rows.reduce((sum, s) => sum + Number(s.total ?? 0), 0), count: rows.length };
  }), [sales, date]);
  const maxWeek = Math.max(1, ...weekByDay.map((x) => x.amount));
  const totalSales = todaySales.reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const units = todayItems.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  const best = totals[0];
  const focus = useMemo(() => {
    const averageByProduct = new Map<string, number>();
    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!item.product_id || !product || product.item_type === "service") continue;
      const sale = sales.find((s) => s.id === item.sale_id && s.status === "completed");
      if (!sale) continue;
      const day = new Date(sale.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      if (day < plusDays(date, -6) || day > date) continue;
      averageByProduct.set(item.product_id, (averageByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0) / 7);
    }
    return products.filter((p) => p.item_type !== "service" && p.track_stock !== false && averageByProduct.has(p.id))
      .map((p) => {
        const daily = averageByProduct.get(p.id) ?? 0;
        const onHand = stockByProduct.get(p.id) ?? 0;
        const cover = daily > 0 ? onHand / daily : Infinity;
        return { id: p.id, name: p.name, daily, onHand, cover, reorder: Number(p.reorder_level ?? 0) };
      })
      .sort((a, b) => a.cover - b.cover).slice(0, 6);
  }, [items, sales, products, productMap, stockByProduct, date]);

  const print = () => window.print();
  const branchLabel = branchId === "all" ? "All branches" : branches.find((b) => b.id === branchId)?.name ?? "Assigned branch";
  const completedCount = todaySales.length;

  return <div className="layout"><BusinessNav active="daily-insights"/><main className="main daily-insights-page">
    <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div><div className="eyebrow">BUSINESS INTELLIGENCE</div><h1>Daily Sales & Product Insights</h1><p className="muted">{businessName} · {branchLabel}</p></div>
      <div className="daily-actions"><Link className="btn btn-secondary" href="/admin/sales/reports">Complete reports</Link><button className="btn" onClick={print}>Print daily report</button></div>
    </div>
    <section className="card daily-filter">
      <label>Report date<input type="date" value={date} max={nairobiDate()} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="daily-date-actions"><button className="btn btn-secondary" onClick={() => setDate(plusDays(date, -1))}>Previous day</button><button className="btn btn-secondary" onClick={() => setDate(nairobiDate())}>Today</button><button className="btn btn-secondary" onClick={() => setDate(plusDays(date, 1))} disabled={date >= nairobiDate()}>Next day</button></div>
      {owner && <label>Branch<select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="all">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    </section>
    <header className="daily-print-heading"><BrandLogo className="report-brand-logo"/><strong>{businessName}</strong><span>DAILY BUSINESS PERFORMANCE · {prettyDate(date)}</span><small>{branchLabel}</small></header>
    {error && <div className="error" role="alert">{error}</div>}
    {loading ? <p className="empty">Loading your daily sales and stock insights…</p> : <>
      <section className="daily-kpis">
        <article className="card"><span>Total sales today</span><strong>{money(totalSales)}</strong></article>
        <article className="card"><span>Completed sales</span><strong>{completedCount.toLocaleString("en-KE")}</strong></article>
        <article className="card"><span>Product units sold</span><strong>{units.toLocaleString("en-KE")}</strong></article>
        <article className="card"><span>Average sale value</span><strong>{money(completedCount ? totalSales / completedCount : 0)}</strong></article>
      </section>
      <section className="daily-grid">
        <article className="card daily-panel"><div className="panel-title"><div><div className="eyebrow">TOP PERFORMER</div><h2>Best-selling product</h2></div></div>
          {best ? <div className="best-product"><strong>{best.name}</strong><b>{best.quantity.toLocaleString("en-KE")} {best.unit || "units"} sold</b><span>{money(best.revenue)} sales value</span></div> : <p className="empty">No completed product sales recorded on this date.</p>}
        </article>
        <article className="card daily-panel"><div className="eyebrow">SALES TREND</div><h2>Last 7 days</h2><div className="daily-bars">{weekByDay.map((d) => <div className="daily-bar-item" key={d.day} title={prettyDate(d.day) + ": " + money(d.amount)}><div className="daily-bar-track"><i style={{ height: Math.max(3, d.amount / maxWeek * 100) + "%" }}/></div><small>{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-KE", { weekday: "short", timeZone: "UTC" })}</small><b>{d.count}</b></div>)}</div><p className="muted daily-hint">Bars show sales value; the number below each day is completed sales count.</p></article>
      </section>
      <section className="card daily-panel"><div className="panel-title"><div><div className="eyebrow">STOCK & DEMAND</div><h2>Products to focus on</h2></div></div>
        <p className="muted">Recommendations use the last 7 days of completed sales and current recorded stock. Stock cover is an estimate, not a purchase order.</p>
        {focus.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Product</th><th>Avg. sold / day</th><th>Stock on hand</th><th>Estimated cover</th><th>Recommendation</th></tr></thead><tbody>{focus.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.daily.toFixed(1)}</td><td>{p.onHand.toLocaleString("en-KE")}</td><td>{Number.isFinite(p.cover) ? p.cover.toFixed(1) + " days" : "No recent sales"}</td><td>{p.onHand <= p.reorder || p.cover < 7 ? <strong className="daily-warning">Restock soon</strong> : p.cover < 14 ? "Keep an eye on stock" : "Stock looks sufficient"}</td></tr>)}</tbody></table></div> : <p className="empty">No stock-tracked products with recent sales were found.</p>}
      </section>
      <section className="card daily-panel"><div className="panel-title"><div><div className="eyebrow">DAILY RECORD</div><h2>Today's product sales</h2></div><strong>{totals.length} products</strong></div>
        <div className="table-scroll"><table className="table"><thead><tr><th>Product</th><th>Quantity sold</th><th>Sales value</th></tr></thead><tbody>{totals.length ? totals.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.quantity.toLocaleString("en-KE")} {p.unit}</td><td>{money(p.revenue)}</td></tr>) : <tr><td colSpan={3}>No product sales recorded for this date.</td></tr>}</tbody><tfoot><tr><th>Total</th><th>{units.toLocaleString("en-KE")}</th><th>{money(totals.reduce((sum, p) => sum + p.revenue, 0))}</th></tr></tfoot></table></div>
      </section>
      <section className="card daily-panel"><div className="panel-title"><div><div className="eyebrow">TRANSACTION LOG</div><h2>Individual daily sales</h2></div><strong>{completedCount} completed</strong></div>
        <div className="table-scroll"><table className="table"><thead><tr><th>Time</th><th>Receipt</th><th>Payment</th><th>Amount</th><th>Branch</th></tr></thead><tbody>{todaySales.length ? todaySales.map((s) => <tr key={s.id}><td>{clock(s.created_at)}</td><td>{s.sale_number || String(s.id).slice(0, 8).toUpperCase()}</td><td>{String(s.payment_method ?? "—").replaceAll("_", " ").toUpperCase()}</td><td>{money(s.total)}</td><td>{branches.find((b) => b.id === s.branch_id)?.name ?? "—"}</td></tr>) : <tr><td colSpan={5}>No completed sales recorded for this date.</td></tr>}</tbody></table></div>
      </section>
      <p className="daily-footnote">Figures are calculated from completed POS sales recorded in Digi Biashara. Cancelled or incomplete sales are excluded. All dates and times use East Africa Time (EAT).</p>
    </>}
    <style jsx global>{`
      .daily-insights-page{padding-bottom:40px}.daily-filter{display:flex;align-items:end;gap:16px;flex-wrap:wrap;margin:18px 0}.daily-filter label{display:grid;gap:7px;font-size:13px;font-weight:700;min-width:180px}.daily-filter input,.daily-filter select{padding:10px 12px;border:1px solid var(--border,#d9dee7);border-radius:10px;background:var(--surface,#fff);color:inherit}.daily-date-actions,.daily-actions{display:flex;gap:8px;flex-wrap:wrap}.daily-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.daily-kpis article{display:grid;gap:8px;padding:18px}.daily-kpis span{font-size:13px;color:var(--muted,#667085)}.daily-kpis strong{font-size:clamp(19px,2vw,26px)}.daily-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.daily-panel{padding:18px;margin-bottom:14px;min-width:0}.daily-panel h2{font-size:18px;margin:5px 0 12px}.panel-title{display:flex;justify-content:space-between;align-items:center;gap:12px}.best-product{display:grid;gap:8px;padding:18px;border-radius:12px;background:var(--surface-muted,#f5f7fa)}.best-product strong{font-size:24px}.best-product b{font-size:18px}.daily-bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;align-items:end;height:150px;margin-top:12px}.daily-bar-item{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:5px;min-width:0}.daily-bar-track{height:105px;width:100%;display:flex;align-items:end;background:var(--surface-muted,#f5f7fa);border-radius:8px;overflow:hidden}.daily-bar-track i{display:block;width:100%;background:var(--primary,#176b52);border-radius:7px 7px 0 0}.daily-bar-item small,.daily-bar-item b{font-size:11px}.daily-hint,.daily-footnote{font-size:12px;margin-top:12px}.table-scroll{overflow-x:auto}.daily-warning{color:#b54708}.daily-print-heading{display:none}@media(max-width:800px){.daily-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-grid{grid-template-columns:1fr}.daily-filter{align-items:stretch}.daily-filter label{width:100%}}@media print{.daily-insights-page{max-width:none;padding:0;color:#111}.daily-insights-page .business-nav,.daily-insights-page nav,.daily-filter,.daily-actions,.daily-date-actions,.daily-insights-page button{display:none!important}.daily-print-heading{display:grid;justify-items:center;gap:5px;margin:0 0 18px}.daily-print-heading span{font-weight:800;font-size:14px}.daily-kpis{grid-template-columns:repeat(4,1fr)}.daily-grid{grid-template-columns:1fr 1fr}.daily-panel,.daily-kpis article{break-inside:avoid;box-shadow:none!important;border:1px solid #ddd!important}.daily-insights-page .card{background:#fff!important}.daily-bars{height:120px}.daily-footnote{margin-top:18px}}
    `}</style>
  </main></div>;
}
