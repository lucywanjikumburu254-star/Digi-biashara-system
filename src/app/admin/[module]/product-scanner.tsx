"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Draft = { id: string; name: string; sku: string; barcode: string; category: string; unit: string; cost_price: string; selling_price: string; quantity: string; status?: string };
type Mode = "barcode" | "photo" | "paper";
type Branch = { id: string; name: string };

declare global { interface Window { Tesseract?: any } }

export default function ProductScanner({ businessId, onComplete }: { businessId: string; onComplete: () => void }) {
  const db = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>("barcode");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [barcode, setBarcode] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");


  useEffect(() => {
    void db.from("branches").select("id,name").eq("business_id", businessId).eq("status", "active").order("name").then(({data}) => setBranches((data || []) as Branch[]));
    void db.from("products").select("id,name,sku,barcode,category,unit,cost_price,selling_price,scanner_opening_quantity").eq("business_id", businessId).eq("is_draft", true).order("created_at", { ascending: false }).then(({data}) => { if (data?.length) setDrafts(data.map((p: any) => ({ id: p.id, name: p.name || "", sku: p.sku || "", barcode: p.barcode || "", category: p.category || "", unit: p.unit || "piece", cost_price: String(p.cost_price ?? ""), selling_price: String(p.selling_price ?? ""), quantity: String(p.scanner_opening_quantity ?? 0), status: "Saved draft" }))); });
  }, [businessId]);
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  }

  async function startCamera() {
    setProblem(""); setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable. Open Digi Biashara using HTTPS and allow camera permission.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (!(window as any).BarcodeDetector) setNotice("Your browser can open the camera but does not support automatic barcode detection. Enter the barcode number below.");
      setRunning(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not open the camera.");
    }
  }

  async function lookupBarcode(code: string) {
    const clean = code.trim();
    if (!clean) return;
    setBusy(true); setProblem(""); setNotice("");
    try {
      const existing = await db.from("products").select("id,name,barcode,is_active").eq("business_id", businessId).eq("barcode", clean).limit(1);
      if (existing.error) throw existing.error;
      if (existing.data?.length) {
        setNotice("This barcode already exists as " + existing.data[0].name + (existing.data[0].is_active ? ". It is already active." : ". It is saved as a draft."));
        return;
      }
      let details: any = {};
      try {
        const response = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(clean) + ".json");
        const json = await response.json();
        if (json.status === 1 && json.product) details = json.product;
      } catch { /* external lookup is optional; manual barcode entry remains available */ }
      const name = details.product_name || details.product_name_en || "";
      const row: Draft = { id: "new-" + Date.now(), name, sku: "", barcode: clean, category: details.categories?.split(",")[0]?.trim() || "", unit: "piece", cost_price: "", selling_price: "", quantity: "0" };
      if (!name) {
        setDrafts(prev => [...prev, row]);
        setNotice("Barcode captured. No matching product was found in the external catalogue, so enter the product name and details below.");
      } else {
        await saveDraft(row);
        setNotice("Product details found and saved as a draft. Add your business prices and stock before activating it.");
      }
    } catch (e) { setProblem(e instanceof Error ? e.message : "Barcode lookup failed."); }
    finally { setBusy(false); }
  }

  async function saveDraft(draft: Draft) {
    if (!draft.name.trim()) throw new Error("Enter a product name before saving this draft.");
    const duplicateQuery = db.from("products").select("id,name,barcode").eq("business_id", businessId);
    const duplicate = draft.barcode.trim() ? await duplicateQuery.eq("barcode", draft.barcode.trim()).maybeSingle() : await duplicateQuery.ilike("name", draft.name.trim()).maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) throw new Error("A product with this name or barcode already exists: " + duplicate.data.name + ". Check your catalogue instead of adding a duplicate.");
    const { data: auth } = await db.auth.getUser();
    const payload = {
      business_id: businessId, name: draft.name.trim(), sku: draft.sku.trim() || null,
      barcode: draft.barcode.trim() || null, category: draft.category.trim() || null,
      unit: draft.unit.trim() || "piece", item_type: "product", description: "Added using Smart Product Scanner",
      cost_price: Number(draft.cost_price || 0), selling_price: Number(draft.selling_price || 0),
      reorder_level: 0, track_stock: true, is_active: false, is_draft: true, scanner_opening_quantity: Number(draft.quantity || 0), created_by: auth.user?.id ?? null
    };
    const result = await db.from("products").insert(payload).select("id").single();
    if (result.error) throw result.error;
    setDrafts(prev => prev.map(x => x.id === draft.id ? { ...x, id: result.data.id, status: "Saved draft" } : x));
    return result.data.id as string;
  }

  async function activateDraft(draft: Draft) {
    setBusy(true); setProblem(""); setNotice("");
    try {
      if (!draft.name.trim()) throw new Error("Enter the product name.");
      const openingQty = Number(draft.quantity || 0);
      if (openingQty > 0 && !selectedBranch) throw new Error("Choose the branch where this opening stock belongs before activating the product.");
      let id = draft.id;
      if (id.startsWith("new-")) id = await saveDraft(draft);
      const result = await db.from("products").update({
        name: draft.name.trim(), sku: draft.sku.trim() || null, barcode: draft.barcode.trim() || null,
        category: draft.category.trim() || null, unit: draft.unit.trim() || "piece",
        cost_price: Number(draft.cost_price || 0), selling_price: Number(draft.selling_price || 0),
        scanner_opening_quantity: 0, is_active: true, is_draft: false
      }).eq("id", id).eq("business_id", businessId);
      if (result.error) throw result.error;
      if (openingQty > 0) {
        const stock = await db.rpc("adjust_stock", { p_business_id: businessId, p_branch_id: selectedBranch, p_product_id: id, p_quantity_delta: openingQty, p_reason: "Opening stock imported using Smart Product Scanner" });
        if (stock.error) {
          await db.from("products").update({ is_active: false, is_draft: true, scanner_opening_quantity: openingQty }).eq("id", id).eq("business_id", businessId);
          throw stock.error;
        }
      }
      setDrafts(prev => prev.filter(x => x.id !== draft.id));
      setNotice("Product activated" + (openingQty > 0 ? " and opening stock added to the selected branch." : ". Add its opening stock later in Inventory if needed."));
      onComplete();
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not activate product."); }
    finally { setBusy(false); }
  }

  function changeDraft(id: string, key: keyof Draft, value: string) {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [key]: value } : d));
  }

  async function ensureTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the text-reading engine. Check your internet connection and try again."));
      document.head.appendChild(script);
    });
    if (!window.Tesseract) throw new Error("Text-reading engine did not start.");
    return window.Tesseract;
  }

  async function scanPaper(file: File) {
    setBusy(true); setProblem(""); setNotice("Reading the page. Handwriting may need corrections…");
    try {
      const Tesseract = await ensureTesseract();
      const result = await Tesseract.recognize(file, "eng", { logger: (m: any) => { if (m.status === "recognizing text") setNotice("Reading page… " + Math.round((m.progress || 0) * 100) + "%"); } });
      const lines = String(result.data.text || "").split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean);
      const parsed: Draft[] = [];
      for (const line of lines) {
        if (/^(product|item|name|description|quantity|qty|stock|buying|selling|price|total|no\.?|s\/?no\.?)$/i.test(line)) continue;
        const parts = line.split(/[\t,;|]+/).map((x: string) => x.trim()).filter(Boolean);
        let name = parts[0] || "";
        let values = parts.slice(1);
        if (parts.length === 1) {
          const words = line.replace(/^[-*•\d.) ]+/, "").trim().split(/\s+/);
          const trailing: string[] = [];
          while (words.length && trailing.length < 3 && /^\d+(?:[.,]\d{1,2})?$/.test(words[words.length - 1])) trailing.unshift(words.pop()!);
          name = words.join(" ");
          values = trailing;
        }
        name = name.replace(/^[-*•\d.) ]+/, "").trim();
        if (!name || name.length < 2 || /^(page|date|shop|stock list)$/i.test(name)) continue;
        const numbers = values.map((x: string) => Number(x.replace(/[^0-9.]/g, ""))).filter((n: number) => Number.isFinite(n) && n >= 0);
        parsed.push({ id: "new-" + Date.now() + "-" + parsed.length, name, sku: "", barcode: "", category: "", unit: "piece", quantity: numbers[0] !== undefined ? String(numbers[0]) : "0", cost_price: numbers[1] !== undefined ? String(numbers[1]) : "", selling_price: numbers[2] !== undefined ? String(numbers[2]) : "" });
      }
      if (!parsed.length) throw new Error("No product rows were recognised. Try a clearer, well-lit photo with one page filling the frame, or type the product names manually.");
      setDrafts(prev => [...prev, ...parsed]);
      let savedCount = 0;
      for (const draft of parsed) { try { await saveDraft(draft); savedCount++; } catch { /* keep failed entries editable for duplicate correction */ } }
      setNotice(parsed.length + " product rows recognised; " + savedCount + " saved automatically as drafts. Check every name, quantity and price before activating.");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not read this page."); }
    finally { setBusy(false); }
  }

  async function scanPhoto(file: File) {
    setBusy(true); setProblem(""); setNotice("Checking the product label…");
    try {
      const Tesseract = await ensureTesseract();
      const result = await Tesseract.recognize(file, "eng");
      const lines = String(result.data.text || "").split(/\r?\n/).map((x: string) => x.trim()).filter(x => x.length > 2);
      const name = lines.sort((a: string, b: string) => b.length - a.length)[0] || "";
      if (!name) throw new Error("The label text was not clear enough. Try a closer, brighter photo or use barcode scan.");
      const draft: Draft = { id: "new-" + Date.now(), name: name.slice(0, 100), sku: "", barcode: "", category: "", unit: "piece", cost_price: "", selling_price: "", quantity: "0" };
      setDrafts(prev => [...prev, draft]);
      try { await saveDraft(draft); } catch { /* keep draft editable if a duplicate needs review */ }
      setNotice("Label text extracted and saved as a draft where no duplicate exists. Full AI visual product identification still needs an AI provider key.");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not read product label."); }
    finally { setBusy(false); }
  }

  return <section className="panel product-scanner">
    <div className="panelhead"><div><h2>Smart Product Scanner</h2><p className="muted">Capture barcodes, product labels or handwritten stock lists.</p></div><button type="button" className="btn secondary small" onClick={onComplete}>Close</button></div>
    <div className="scanner-tabs">
      <button type="button" className={mode === "barcode" ? "selected" : ""} onClick={() => { stopCamera(); setMode("barcode"); }}>▥ Barcode</button>
      <button type="button" className={mode === "photo" ? "selected" : ""} onClick={() => { stopCamera(); setMode("photo"); }}>▧ Product photo</button>
      <button type="button" className={mode === "paper" ? "selected" : ""} onClick={() => { stopCamera(); setMode("paper"); }}>▤ Book / paper list</button>
    </div>
    {mode === "barcode" && <div className="scanner-content">
      <p>Scan a product barcode with your camera, or enter the barcode below. Digi Biashara checks your catalogue and the Open Food Facts product database.</p>
      <video ref={videoRef} className="scanner-video" playsInline muted />
      <div className="scanner-actions"><button type="button" className="btn secondary" onClick={running ? stopCamera : startCamera}>{running ? "Stop camera" : "Open camera"}</button></div>
      <div className="scanner-manual"><input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Enter barcode number" inputMode="numeric" /><button type="button" className="btn" disabled={busy || !barcode.trim()} onClick={() => void lookupBarcode(barcode)}>Find product</button></div>
      {running && <BarcodeLoop videoRef={videoRef} onCode={code => { setBarcode(code); stopCamera(); void lookupBarcode(code); }} />}
    </div>}
    {mode === "photo" && <div className="scanner-content"><p>Take a clear photo of the product label or choose an image. Digi Biashara extracts visible label text into an editable draft. Full AI object recognition can be enabled when an AI provider key is configured.</p><label className="scanner-upload"> <span>📷 Capture product photo or choose image</span><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void scanPhoto(f); e.currentTarget.value = ""; }} /></label></div>}
    {mode === "paper" && <div className="scanner-content"><p>Photograph or upload a clear page. Printed lists and clear handwriting work best. Use one page per image and keep the page flat and well lit.</p><label className="scanner-upload"><span>📄 Capture book page or upload paper list</span><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void scanPaper(f); e.currentTarget.value = ""; }} /></label><p className="muted compact-help">You can scan more pages before activating the products. OCR results are suggestions; always review handwritten entries.</p></div>}
    {busy && <div className="scanner-status">{notice || "Processing…"}</div>}
    {notice && !busy && <div className="success">{notice}</div>}
    {problem && <div className="error" role="alert">{problem}</div>}
    {drafts.length > 0 && <div className="scanner-drafts"><div className="panelhead"><div><h3>Review recognised products ({drafts.length})</h3><p className="muted">Edit details, then activate. Recognised rows are saved as inactive drafts automatically; prices are never guessed.</p></div></div>\n      <label className="field scanner-branch"><span>Branch for opening stock</span><select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}><option value="">Choose branch when importing quantities</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {drafts.map(d => <div className="scanner-draft" key={d.id}>
        <label className="field"><span>Product name</span><input value={d.name} onChange={e => changeDraft(d.id, "name", e.target.value)} /></label>
        <label className="field"><span>Barcode</span><input value={d.barcode} onChange={e => changeDraft(d.id, "barcode", e.target.value)} /></label>
        <label className="field"><span>Category</span><input value={d.category} onChange={e => changeDraft(d.id, "category", e.target.value)} /></label>
        <label className="field"><span>Unit</span><input value={d.unit} onChange={e => changeDraft(d.id, "unit", e.target.value)} /></label>
        <label className="field"><span>Quantity on paper</span><input type="number" min="0" step="0.001" value={d.quantity} onChange={e => changeDraft(d.id, "quantity", e.target.value)} /></label>
        <label className="field"><span>Buying price (KSh)</span><input type="number" min="0" step="0.01" value={d.cost_price} onChange={e => changeDraft(d.id, "cost_price", e.target.value)} /></label>
        <label className="field"><span>Selling price (KSh)</span><input type="number" min="0" step="0.01" value={d.selling_price} onChange={e => changeDraft(d.id, "selling_price", e.target.value)} /></label>
        <div className="scanner-draft-actions">{d.status && <span className="pill">{d.status}</span>}<button type="button" className="btn" disabled={busy || !d.name.trim()} onClick={() => void activateDraft(d)}>Save & activate</button><button type="button" className="btn secondary" disabled={busy || !!d.status} onClick={async () => { setBusy(true); try { await saveDraft(d); setNotice("Draft saved. You can activate it after reviewing."); } catch (e) { setProblem(e instanceof Error ? e.message : "Could not save draft."); } finally { setBusy(false); } }}>Save draft</button><button type="button" className="text-button" onClick={() => setDrafts(prev => prev.filter(x => x.id !== d.id))}>Remove</button></div>
      </div>)}
    </div>}
  </section>;
}

function BarcodeLoop({ videoRef, onCode }: { videoRef: React.RefObject<HTMLVideoElement | null>; onCode: (code: string) => void }) {
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) return;
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    const scan = async () => {
      const video = videoRef.current;
      if (active && video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes?.[0]?.rawValue) { active = false; onCode(codes[0].rawValue); return; }
        } catch { /* camera frame not ready */ }
      }
      if (active) timer = setTimeout(scan, 350);
    };
    void scan();
    return () => { active = false; clearTimeout(timer); };
  }, [videoRef, onCode]);
  return null;
}
