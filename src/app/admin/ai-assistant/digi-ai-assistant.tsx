"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BusinessNav from "@/components/business-nav";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, any>;
type Message = { id: number; role: "assistant" | "user"; text: string; detail?: string };
type Dataset = { sales: Row[]; items: Row[]; products: Row[]; stock: Row[]; branches: Row[]; loadedAt: string };
const money = (n: number) => "KSh " + Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateInNairobi = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (key: string, amount: number) => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); };
const startOf = (key: string) => new Date(key + "T00:00:00+03:00").toISOString();
const endOf = (key: string) => new Date(addDays(key, 1) + "T00:00:00+03:00").toISOString();
const todayKey = () => dayKey(new Date());
const fmtDay = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-KE", { timeZone: "UTC", day: "numeric", month: "short" });

function buildAnswer(question: string, data: Dataset, branchId: string, role: string) {
  const q = question.toLowerCase();
  const now = todayKey();
  const isOwner = role === "owner" || role === "super_admin";
  const chosenBranch = branchId === "all" ? null : branchId;
  const sales = data.sales.filter(s => s.status === "completed" && (!chosenBranch || s.branch_id === chosenBranch));
  const visibleSaleIds = new Set(sales.map(s => s.id));
  const items = data.items.filter(i => visibleSaleIds.has(i.sale_id));
  const saleMap = new Map(sales.map(s => [s.id, s]));
  const productMap = new Map(data.products.map(p => [p.id, p]));
  const period = q.includes("yesterday") ? addDays(now, -1)
    : q.includes("this week") || q.includes("weekly") || q.includes("last 7") ? addDays(now, -6)
    : q.includes("this month") || q.includes("monthly") || q.includes("month") ? now.slice(0, 7) + "-01"
    : q.includes("last 30") || q.includes("30 days") ? addDays(now, -29)
    : now;
  const periodEnd = q.includes("yesterday") ? now : addDays(now, 1);
  const periodSales = sales.filter(s => {
    const d = dateInNairobi(s.created_at);
    return d >= period && d < periodEnd;
  });
  const total = periodSales.reduce((n, s) => n + Number(s.total ?? 0), 0);
  const count = periodSales.length;
  const periodLabel = q.includes("yesterday") ? "yesterday" : q.includes("this month") || q.includes("monthly") || q.includes("month") ? "this month" : q.includes("this week") || q.includes("weekly") || q.includes("last 7") ? "the last 7 days" : q.includes("last 30") || q.includes("30 days") ? "the last 30 days" : "today";

  if (q.includes("help") || q.includes("what can") || q.includes("what do you")) {
    return { text: "I can analyse the business records currently available to me.", detail: "Try asking about sales today, yesterday, this week or this month; best-selling products; slow-moving products; low stock; or branch performance. I do not currently analyse expenses, customer balances or appointments." };
  }
  if (q.includes("branch") && (q.includes("compare") || q.includes("best") || q.includes("perform") || q.includes("sales"))) {
    if (!isOwner) return { text: "Branch-wide comparisons are only available to business owners.", detail: "Your answers are limited to your assigned branch." };
    const branchPeriodSales = data.sales.filter(s => { const d = dateInNairobi(s.created_at); return s.status === "completed" && d >= period && d < periodEnd; });
    const totals = data.branches.map(b => {
      const rows = branchPeriodSales.filter(s => s.branch_id === b.id);
      return { name: b.name, total: rows.reduce((n, s) => n + Number(s.total ?? 0), 0), count: rows.length };
    }).sort((a,b) => b.total-a.total);
    return { text: totals.length ? "Branch performance for " + periodLabel + ":
" + totals.map((b,i) => (i+1)+". "+b.name+" — "+money(b.total)+" ("+b.count+" completed sales)").join("
") : "I couldn't find branch records for this business.", detail: "Based on completed POS sales recorded in Digi Biashara. This ranks sales value, not profit." };
  }
  if (q.includes("stock") || q.includes("restock") || q.includes("reorder") || q.includes("running out")) {
    const stockRows = data.stock.filter(s => !chosenBranch || s.branch_id === chosenBranch);
    const stockByProduct = new Map<string, number>();
    stockRows.forEach(s => stockByProduct.set(s.product_id, (stockByProduct.get(s.product_id) ?? 0) + Number(s.quantity ?? 0)));
    const soldByProduct = new Map<string, number>();
    items.forEach(i => { if (i.product_id) soldByProduct.set(i.product_id, (soldByProduct.get(i.product_id) ?? 0) + Number(i.quantity ?? 0)); });
    const low = data.products.filter(p => p.item_type !== "service" && p.track_stock !== false)
      .map(p => ({ name: p.name, stock: stockByProduct.get(p.id) ?? 0, reorder: Number(p.reorder_level ?? 0), sold: soldByProduct.get(p.id) ?? 0 }))
      .filter(p => p.stock <= p.reorder || (p.sold > 0 && p.stock < p.sold / 4))
      .sort((a,b) => (a.stock-a.reorder) - (b.stock-b.reorder)).slice(0,10);
    return { text: low.length ? "These products need a stock check:
" + low.map(p => "• "+p.name+": "+p.stock+" in stock; reorder level "+p.reorder+"; "+p.sold+" sold in the loaded period").join("
") : "No products currently meet the low-stock rules in the records I checked.", detail: "This is a warning based on recorded stock balances and product reorder levels. It does not create a purchase order. The loaded sales window is the last 30 days." };
  }
  if (q.includes("best") || q.includes("top") || q.includes("selling") || q.includes("popular") || q.includes("slow") || q.includes("not moving")) {
    const totals = new Map<string, {name:string; qty:number; revenue:number}>();
    items.forEach(i => {
      const p = productMap.get(i.product_id);
      if (p?.item_type === "service") return;
      const id = i.product_id ?? i.item_name ?? "unknown";
      const row = totals.get(id) ?? { name: p?.name ?? i.item_name ?? "Item", qty: 0, revenue: 0 };
      row.qty += Number(i.quantity ?? 0);
      row.revenue += Number(i.line_total ?? Number(i.quantity ?? 0) * Number(i.unit_price ?? 0));
      totals.set(id,row);
    });
    const ranked = [...totals.values()].sort((a,b) => b.qty-a.qty || b.revenue-a.revenue);
    const list = q.includes("slow") || q.includes("not moving")
      ? data.products.filter(p => p.item_type !== "service").map(p => ({ name:p.name, qty:totals.get(p.id)?.qty ?? 0, revenue:totals.get(p.id)?.revenue ?? 0 })).sort((a,b)=>a.qty-b.qty).slice(0,10)
      : ranked.slice(0,10);
    return { text: list.length ? (q.includes("slow") || q.includes("not moving") ? "Products with the least recorded movement in the last 30 days:
" : "Best-selling products in the last 30 days:
") + list.map((p,i)=>(i+1)+". "+p.name+" — "+p.qty+" units; "+money(p.revenue)).join("
") : "There are no completed product sales in the loaded period.", detail: "Product ranking uses completed sales only and excludes service items. This is sales volume, not profit margin." };
  }
  if (q.includes("sales") || q.includes("revenue") || q.includes("sold") || q.includes("how much") || q.includes("income") || q.includes("performance")) {
    return { text: "Completed sales "+periodLabel+": "+money(total)+" across "+count+" transactions. Average sale value: "+money(count ? total/count : 0)+".", detail: "Only completed POS sales recorded in Digi Biashara are counted. Sales value is not the same as net profit." };
  }
  if (q.includes("profit") || q.includes("margin") || q.includes("expense") || q.includes("cost") || q.includes("owe") || q.includes("debt") || q.includes("customer")) {
    return { text: "I don't yet have the verified calculations for that question.", detail: "This version currently analyses completed sales, product movement, recorded stock balances and branch sales. I won't estimate profit, expenses or customer debts without checking the correct source records." };
  }
  return { text: "I couldn't match that question to one of my current business analysis tools.", detail: "Try: “How much did I sell today?”, “What were my best-selling products?”, “Which products need restocking?”, or “Compare my branches this month”." };
}

export default function DigiAiAssistant({ businessId, businessName, role, assignedBranchId }: { businessId: string; businessName: string; role: string; assignedBranchId: string | null }) {
  const db = useMemo(() => createClient(), []);
  const owner = role === "owner" || role === "super_admin";
  const [branchId, setBranchId] = useState(owner ? "all" : assignedBranchId ?? "none");
  const [branches, setBranches] = useState<Row[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: "assistant", text: "Hello! I'm Digi AI, your business assistant. I can analyse your recorded sales, product movement, stock levels and branch performance. What would you like to know?" }]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = ["How much did I sell today?","What are my best-selling products?","Which products need restocking?","Compare my branches this month."];

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const today = todayKey();
      const from = startOf(addDays(today, -29));
      const until = endOf(today);
      let branchQuery = db.from("branches").select("id,name").eq("business_id", businessId).order("name");
      let stockQuery = db.from("stock_balances").select("product_id,branch_id,quantity").eq("business_id", businessId);
      if (!owner) { branchQuery = branchQuery.eq("id", assignedBranchId ?? "__no_assigned_branch__"); stockQuery = stockQuery.eq("branch_id", assignedBranchId ?? "__no_assigned_branch__"); }
      const [branchResult, productResult, stockResult] = await Promise.all([
        branchQuery,
        db.from("products").select("id,name,item_type,unit,reorder_level,track_stock").eq("business_id", businessId),
        stockQuery,
      ]);
      if (branchResult.error) throw branchResult.error;
      if (productResult.error) throw productResult.error;
      if (stockResult.error) throw stockResult.error;
      const allowedBranches = branchResult.data ?? [];
      setBranches(allowedBranches);
      let allSales: Row[] = [];
      for (let offset=0; ; offset+=500) {
        let query = db.from("sales").select("id,total,status,created_at,branch_id").eq("business_id",businessId).eq("status","completed").gte("created_at",from).lt("created_at",until).order("created_at",{ascending:false}).range(offset,offset+499);
        if (!owner) query = query.eq("branch_id",assignedBranchId ?? "__no_assigned_branch__");
        const result = await query;
        if (result.error) throw result.error;
        const batch = result.data ?? [];
        allSales = allSales.concat(batch);
        if (batch.length < 500) break;
      }
      const ids = allSales.map(s=>s.id);
      let allItems: Row[] = [];
      for (let i=0;i<ids.length;i+=500) {
        const batches = await Promise.all(Array.from({length:Math.ceil(Math.min(500,ids.length-i)/100)},(_,j)=>db.from("sale_items").select("id,sale_id,product_id,item_name,quantity,unit_price,line_total").eq("business_id",businessId).in("sale_id",ids.slice(i+j*100,i+(j+1)*100))));
        const failed = batches.find(result=>result.error);
        if (failed?.error) throw failed.error;
        allItems = allItems.concat(...batches.map(result=>result.data ?? []));
      }
      const visibleStock = stockResult.data ?? [];
      const visibleSales = owner ? allSales : allSales.filter(s=>s.branch_id===assignedBranchId);
      const visibleIds = new Set(visibleSales.map(s=>s.id));
      const loaded: Dataset = { sales:visibleSales, items:allItems.filter(i=>visibleIds.has(i.sale_id)), products:productResult.data ?? [], stock:visibleStock, branches:allowedBranches, loadedAt:new Date().toISOString() };
      setDataset(loaded);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load business information.");
      setDataset(null);
    } finally { setLoading(false); }
  }, [db,businessId,owner,assignedBranchId]);

  useEffect(()=>{ void load(); },[load]);
  useEffect(()=>{ scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"}); },[messages]);

  const ask = (value: string) => {
    const clean = value.trim();
    if (!clean || !dataset) return;
    const answer = buildAnswer(clean,dataset,branchId,role);
    setMessages(prev=>[...prev,{id:Date.now(),role:"user",text:clean},{id:Date.now()+1,role:"assistant",text:answer.text,detail:answer.detail}]);
    setQuestion("");
  };

  const visibleSales = useMemo(()=>dataset?.sales.filter(s=>branchId==="all"||s.branch_id===branchId) ?? [],[dataset,branchId]);
  const todaySales = visibleSales.filter(s=>dateInNairobi(s.created_at)===todayKey());
  const todayTotal = todaySales.reduce((n,s)=>n+Number(s.total??0),0);
  const branchLabel = branchId==="all"?"All branches":branches.find(b=>b.id===branchId)?.name??"Assigned branch";

  return <div className="layout digi-ai-layout">
    <BusinessNav active="digi-ai"/>
    <main className="main digi-ai-page">
      <header className="digi-ai-header">
        <div><div className="eyebrow">BUSINESS INTELLIGENCE</div><h1>Digi AI Assistant</h1><p className="muted">{businessName} · {branchLabel}</p></div>
        <div className="digi-ai-head-actions">{owner && <select aria-label="Choose branch" value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="all">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button className="btn btn-secondary" onClick={()=>void load()} disabled={loading}>↻ Refresh data</button></div>
      </header>
      <section className="digi-ai-summary">
        <div><span>Today's completed sales</span><strong>{loading?"Loading…":money(todayTotal)}</strong></div>
        <div><span>Transactions today</span><strong>{loading?"—":todaySales.length}</strong></div>
        <div><span>Products tracked</span><strong>{loading?"—":dataset?.products.length??0}</strong></div>
        <div><span>Data coverage</span><strong>30 days</strong></div>
      </section>
      {error && <div className="error digi-ai-error" role="alert">{error}<button className="btn btn-secondary" onClick={()=>void load()}>Try again</button></div>}
      <section className="digi-ai-workspace">
        <aside className="digi-ai-side">
          <div className="digi-ai-avatar">✦</div><h2>Your business, understood.</h2><p>Ask questions about your recorded sales, products, stock and branches. Answers are calculated from your Digi Biashara records.</p>
          <div className="digi-ai-capabilities"><span>✓ Sales analysis</span><span>✓ Product performance</span><span>✓ Stock recommendations</span><span>✓ Branch comparisons</span></div>
          <div className="digi-ai-note">No external AI API is used. Results are generated by Digi Biashara's own business rules.</div>
        </aside>
        <div className="digi-ai-chat">
          <div className="digi-ai-chat-head"><div><strong>Digi AI</strong><small>{loading?"Preparing your business data…":"Ready · "+dataset?.sales.length+" completed sales loaded"}</small></div><span className={loading?"digi-ai-dot loading":"digi-ai-dot"} /></div>
          <div className="digi-ai-messages" ref={scrollRef}>
            {messages.map(m=><article key={m.id} className={"digi-ai-message "+m.role}><div className="digi-ai-message-label">{m.role==="assistant"?"DIGI AI":"YOU"}</div><p>{m.text}</p>{m.detail&&<small>{m.detail}</small>}</article>)}
            {loading&&<div className="digi-ai-loading"><i/><i/><i/> Preparing business insights…</div>}
            {!loading&&dataset&&messages.length===1&&<div className="digi-ai-suggestions"><strong>Try asking</strong>{suggestions.map(s=><button key={s} onClick={()=>ask(s)}>{s}<span>↗</span></button>)}</div>}
          </div>
          <form className="digi-ai-compose" onSubmit={e=>{e.preventDefault();ask(question);}}>
            <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder={loading?"Loading your business records…":"Ask about your business…"} disabled={loading||!dataset} aria-label="Ask Digi AI a question"/>
            <button className="btn" type="submit" disabled={loading||!dataset||!question.trim()}>Ask ↗</button>
          </form>
          <div className="digi-ai-foot">Answers use completed sales and stored stock records · Nairobi time · Read-only assistant</div>
        </div>
      </section>
    </main>
    <style jsx global>{`
      .digi-ai-page{padding:24px;max-width:1500px;margin:0 auto;min-width:0}.digi-ai-header{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.digi-ai-header h1{margin:5px 0;color:#102d70}.digi-ai-head-actions{display:flex;gap:9px;align-items:center}.digi-ai-head-actions select{padding:10px 12px;border:1px solid #d5e0f6;border-radius:10px;background:#fff;color:#13234c}.digi-ai-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.digi-ai-summary>div{display:grid;gap:7px;padding:16px;border:1px solid #dfe8ff;border-radius:14px;background:#fff;box-shadow:0 5px 18px #173c8209;min-width:0}.digi-ai-summary span{font-size:12px;color:#64769b}.digi-ai-summary strong{font-size:clamp(17px,2vw,23px);color:#102d70;overflow-wrap:anywhere}.digi-ai-workspace{display:grid;grid-template-columns:280px minmax(0,1fr);gap:14px;min-height:590px}.digi-ai-side{padding:23px;border-radius:17px;background:linear-gradient(155deg,#082d73,#0755e8);color:#fff;display:flex;flex-direction:column;align-items:flex-start}.digi-ai-avatar{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#ffffff22;color:#ffd34d;font-size:28px}.digi-ai-side h2{font-size:21px;line-height:1.2;margin:18px 0 8px}.digi-ai-side p{font-size:13px;line-height:1.6;color:#dce8ff}.digi-ai-capabilities{display:grid;gap:12px;margin-top:12px;font-size:12px;font-weight:750}.digi-ai-note{margin-top:auto;padding:12px;border:1px solid #ffffff35;border-radius:11px;background:#ffffff12;color:#e7efff;font-size:11px;line-height:1.5}.digi-ai-chat{display:flex;flex-direction:column;min-width:0;min-height:590px;border:1px solid #dfe8ff;border-radius:17px;background:#fff;overflow:hidden;box-shadow:0 5px 18px #173c8209}.digi-ai-chat-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid #e8eefb}.digi-ai-chat-head>div{display:grid;gap:3px}.digi-ai-chat-head strong{color:#102d70}.digi-ai-chat-head small{font-size:11px;color:#64769b}.digi-ai-dot{width:9px;height:9px;border-radius:50%;background:#0dbd72;box-shadow:0 0 0 4px #0dbd721a}.digi-ai-dot.loading{background:#f59e0b}.digi-ai-messages{flex:1;min-height:390px;max-height:570px;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:13px;background:#f7f9ff}.digi-ai-message{max-width:min(90%,680px);padding:13px 15px;border-radius:14px;white-space:pre-line;box-shadow:0 3px 10px #173c8209}.digi-ai-message.assistant{align-self:flex-start;background:#fff;border:1px solid #e0e9fb;color:#20345f;border-top-left-radius:4px}.digi-ai-message.user{align-self:flex-end;background:#0755e8;color:#fff;border-top-right-radius:4px}.digi-ai-message-label{font-size:9px;letter-spacing:1px;font-weight:900;opacity:.7;margin-bottom:6px}.digi-ai-message p{margin:0;font-size:13px;line-height:1.65}.digi-ai-message small{display:block;margin-top:9px;padding-top:8px;border-top:1px solid #dfe8ff;color:#64769b;font-size:11px;line-height:1.55}.digi-ai-message.user small{color:#e2eaff;border-color:#ffffff44}.digi-ai-suggestions{display:grid;gap:8px;max-width:520px;margin-top:auto}.digi-ai-suggestions strong{font-size:12px;color:#64769b}.digi-ai-suggestions button{display:flex;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid #dfe8ff;border-radius:10px;background:#fff;color:#17366f;text-align:left;font-size:12px;font-weight:700;cursor:pointer}.digi-ai-suggestions button:hover{border-color:#0755e8;background:#f1f6ff}.digi-ai-suggestions button span{color:#0755e8}.digi-ai-compose{display:flex;gap:9px;padding:13px;border-top:1px solid #e8eefb;background:#fff}.digi-ai-compose input{flex:1;min-width:0;padding:12px 14px;border:1px solid #d5e0f6;border-radius:11px;font-size:14px;color:#13234c;outline:none}.digi-ai-compose input:focus{border-color:#0755e8;box-shadow:0 0 0 3px #0755e81a}.digi-ai-compose button{white-space:nowrap}.digi-ai-compose button:disabled{opacity:.5;cursor:not-allowed}.digi-ai-foot{padding:0 15px 12px;background:#fff;text-align:center;color:#8795af;font-size:10px}.digi-ai-loading{display:flex;align-items:center;gap:6px;color:#64769b;font-size:12px}.digi-ai-loading i{width:6px;height:6px;border-radius:50%;background:#0755e8;animation:digi-ai-pulse .9s infinite alternate}.digi-ai-loading i:nth-child(2){animation-delay:.2s}.digi-ai-loading i:nth-child(3){animation-delay:.4s}@keyframes digi-ai-pulse{to{opacity:.25;transform:translateY(-3px)}}.digi-ai-error{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;margin-top:12px}.digi-ai-layout .main{min-width:0}@media(max-width:900px){.digi-ai-workspace{grid-template-columns:1fr}.digi-ai-side{display:none}}@media(max-width:650px){.digi-ai-page{padding:15px 11px 28px}.digi-ai-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.digi-ai-summary>div{padding:12px}.digi-ai-head-actions{width:100%;flex-wrap:wrap}.digi-ai-head-actions select{flex:1;min-width:120px}.digi-ai-chat{min-height:590px}.digi-ai-messages{padding:13px;min-height:400px}.digi-ai-message{max-width:96%}.digi-ai-compose{padding:9px}.digi-ai-compose input{font-size:16px;padding:11px 10px}.digi-ai-compose button{padding:10px 12px}.digi-ai-foot{font-size:9px;padding-left:8px;padding-right:8px}}
      @media(prefers-reduced-motion:reduce){.digi-ai-loading i{animation:none}}
    `}</style>
  </div>;
}
