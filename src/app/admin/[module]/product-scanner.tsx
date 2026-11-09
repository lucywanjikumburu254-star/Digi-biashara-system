"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Draft = { id: string; name: string; sku: string; barcode: string; category: string; unit: string; cost_price: string; selling_price: string; quantity: string; status?: string };
type Mode = "barcode" | "photo" | "paper";
type Branch = { id: string; name: string };

declare global { interface Window { Tesseract?: any } }

export default function ProductScanner({ businessId, onComplete, onClose }: { businessId: string; onComplete: () => void; onClose: () => void }) {
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
        setDrafts(prev => [...prev, row]);
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

  async function imageAsDataUrl(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 3 * 1024 * 1024) throw new Error("Please use an image under 3 MB.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image."));
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
  }

  async function recogniseWithAI(file: File, scanMode: "photo" | "paper") {
    const image = await imageAsDataUrl(file);
    const response = await fetch("/api/ai/product-recognition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, mode: scanMode, image })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI product recognition failed.");
    return Array.isArray(result.products) ? result.products : [];
  }

  async function saveRecognisedRows(rows: any[], emptyMessage: string) {
    if (!rows.length) throw new Error(emptyMessage);
    const parsed: Draft[] = rows.map((p: any, index: number) => ({
      id: "new-" + Date.now() + "-" + index,
      name: String(p.name || "").slice(0, 180),
      sku: String(p.sku || ""),
      barcode: String(p.barcode || ""),
      category: [p.brand, p.category].filter(Boolean).join(" · "),
      unit: String(p.unit || "piece"),
      quantity: /^\\d+(?:\\.\\d+)?$/.test(String(p.quantity || "")) ? String(p.quantity) : "0",
      cost_price: /^\\d+(?:\\.\\d+)?$/.test(String(p.cost_price || "")) ? String(p.cost_price) : "",
      selling_price: /^\\d+(?:\\.\\d+)?$/.test(String(p.selling_price || "")) ? String(p.selling_price) : "",
      status: "OCR extracted · review details"
    }));
    setDrafts(prev => [...prev, ...parsed]);
    let savedCount = 0;
    for (const draft of parsed) {
      try {
        await saveDraft(draft);
        savedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Needs review before saving";
        setDrafts(prev => prev.map(item => item.id === draft.id ? { ...item, status: message.slice(0, 90) } : item));
      }
    }
    setNotice(parsed.length + " product" + (parsed.length === 1 ? "" : "s") + " extracted; " + savedCount + " saved as inactive drafts. Review every field before activating.");
  }

  function parsePaperText(text: string): any[] {
    const rows: any[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/[|]/g, " ").trim();
      if (!line || line.length < 2) continue;
      const columns = line.split(/\t+|\s{2,}/).map(value => value.trim()).filter(Boolean);
      if (columns.length >= 2) {
        const name = columns[0].replace(/^[-•*\d.)\s]+/, "").trim();
        if (name.length >= 2) {
          const numeric = columns.slice(1).map(value => value.replace(/[,]/g, "").match(/^\d+(?:\.\d{1,2})?$/)?.[0] || "");
          rows.push({ name, quantity: numeric[0] || "", cost_price: numeric[1] || "", selling_price: numeric[2] || "", unit: "piece" });
        }
        continue;
      }
      const name = line.replace(/^[-•*\d.)\s]+/, "").trim();
      if (name.length >= 2 && !/^(product|item|name|quantity|qty|price|stock)$/i.test(name)) {
        rows.push({ name, quantity: "", cost_price: "", selling_price: "", unit: "piece" });
      }
    }
    return rows.slice(0, 60);
  }

  async function scanPaper(file: File) {
    setBusy(true); setProblem(""); setNotice("Reading the page with free OCR…");
    try {
      const engine = await ensureTesseract();
      const result = await engine.recognize(file, "eng", { logger: (message: any) => {
        if (message?.status === "recognizing text" && typeof message.progress === "number") {
          setNotice("Reading page… " + Math.round(message.progress * 100) + "%");
        }
      }});
      const rows = parsePaperText(result?.data?.text || "");
      if (!rows.length) throw new Error("No product lines were detected. Retake the page in good light, keep it flat, and try clearer writing or a printed list.");
      await saveRecognisedRows(rows, "No product lines were detected. Try another photo.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not read this page. Please try again.");
    } finally { setBusy(false); }
  }

  async function scanPhoto(file: File) {
    setBusy(true); setProblem(""); setNotice("AI is identifying the product…");
    try {
      const rows = await recogniseWithAI(file, "photo");
      await saveRecognisedRows(rows, "The AI could not confidently identify a product. Try a clearer photo showing the full package and label.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "AI product recognition failed.");
    } finally { setBusy(false); }
  }

  return <section className="panel product-scanner">
    <div className="panelhead"><div><h2>Smart Product Scanner</h2><p className="muted">Capture barcodes, product labels or handwritten stock lists.</p></div><button type="button" className="btn secondary small" onClick={onClose}>Close</button></div>
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
    {mode === "photo" && <div className="scanner-content"><p>Take a clear photo of the whole product or its label. AI identifies the product and extracts visible details into an editable draft. Business prices and stock are never guessed.</p><label className="scanner-upload"> <span>📷 Capture product photo or choose image</span><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void scanPhoto(f); e.currentTarget.value = ""; }} /></label></div>}
    {mode === "paper" && <div className="scanner-content"><p>Photograph or upload a clear page. Printed lists and clear handwriting work best. Use one page per image and keep the page flat and well lit.</p><label className="scanner-upload"><span>📄 Capture book page or upload paper list</span><input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void scanPaper(f); e.currentTarget.value = ""; }} /></label><p className="muted compact-help">You can scan more pages before activating the products. OCR results are suggestions; always review handwritten entries.</p></div>}
    {busy && <div className="scanner-status">{notice || "Processing…"}</div>}
    {notice && !busy && <div className="success">{notice}</div>}
    {problem && <div className="error" role="alert">{problem}</div>}
    {drafts.length > 0 && <div className="scanner-drafts"><div className="panelhead"><div><h3>Review recognised products ({drafts.length})</h3><p className="muted">Edit details, then activate. Recognised rows are saved as inactive drafts automatically; prices are never guessed.</p></div></div>
      <label className="field scanner-branch"><span>Branch for opening stock</span><select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}><option value="">Choose branch when importing quantities</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
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
