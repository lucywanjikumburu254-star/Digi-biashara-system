import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function clean(value: unknown, max = 180): string {
  return typeof value === "string" ? value.trim().replace(/[\\u0000-\\u001f\\u007f]/g, "").slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again to use AI product recognition." }, { status: 401 });

    const body = await request.json();
    const businessId = clean(body.businessId, 64);
    const image = typeof body.image === "string" ? body.image : "";
    const mode = body.mode === "paper" ? "paper" : "photo";
    if (!businessId || !image) return NextResponse.json({ error: "A business and product image are required." }, { status: 400 });

    const { data: membership, error: membershipError } = await supabase
      .from("business_memberships")
      .select("role,status")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: "Could not verify your business access." }, { status: 403 });
    if (!membership || !["owner", "admin"].includes(String(membership.role).toLowerCase())) {
      return NextResponse.json({ error: "Only the business owner or administrator can use AI product recognition." }, { status: 403 });
    }

    const commaIndex = image.indexOf(",");
    const imageHeader = commaIndex >= 0 ? image.slice(0, commaIndex) : "";
    const mimeType = imageHeader.startsWith("data:") ? imageHeader.slice(5) : "";
    const encodedImage = commaIndex >= 0 ? image.slice(commaIndex + 1) : "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !/^[A-Za-z0-9+/=]+$/.test(encodedImage)) {
      return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 400 });
    }
    const estimatedBytes = Math.floor(encodedImage.length * 3 / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image is too large. Please use an image under 3 MB." }, { status: 413 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY to the Vercel Production environment and redeploy." }, { status: 503 });
    }

    const instruction = mode === "paper"
      ? `Read this product stock-list page. Return every clearly identifiable product row, up to 60. Extract quantity, buying price and selling price only when explicitly visible. Do not treat page numbers, row numbers or totals as product data. If uncertain, leave the field empty. Return JSON matching this schema: {"products":[{"name":"string","brand":"string","category":"string","unit":"string","barcode":"string","sku":"string","description":"string","quantity":"string","cost_price":"string","selling_price":"string"}]}. Do not invent names, numbers, prices, barcodes or SKUs.`
      : `Identify the single main retail product shown. Read visible packaging text and barcode only if legible. Return JSON matching this schema: {"products":[{"name":"string","brand":"string","category":"string","unit":"string","barcode":"string","sku":"string","description":"string","quantity":"","cost_price":"","selling_price":""}]}. Do not guess barcode, SKU, business prices or stock. If identity is unclear, return an empty products array. Do not invent facts.`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are a careful retail inventory assistant. Extract only information visible in the supplied image. Never invent missing data. Respond with valid JSON only." }]
        },
        contents: [{
          role: "user",
          parts: [
            { text: instruction },
            { inlineData: { mimeType, data: encodedImage } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 3000,
          responseMimeType: "application/json"
        }
      }),
      signal: AbortSignal.timeout(50000)
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      let providerMessage = "";
      try { providerMessage = JSON.parse(errorBody)?.error?.message || ""; } catch {}
      const safeMessage = geminiResponse.status === 400 || geminiResponse.status === 401
        ? "Gemini rejected the API key or request. Check that GEMINI_API_KEY was copied correctly in Vercel."
        : geminiResponse.status === 403
          ? "Google Gemini access is not enabled for this API key or project. Check Google AI Studio API key settings."
          : geminiResponse.status === 429
            ? "The free Gemini usage limit has been reached. Please wait and try again later."
            : `Gemini request failed (HTTP ${geminiResponse.status}). Please try again.`;
      console.error("Gemini product recognition error", geminiResponse.status, providerMessage || errorBody.slice(0, 400));
      return NextResponse.json({ error: safeMessage }, { status: geminiResponse.status >= 500 ? 502 : geminiResponse.status });
    }

    const result = await geminiResponse.json();
    const raw = (result?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || "").join("\\n");
    if (!raw) throw new Error("Gemini returned no readable result. Please retake the image.");
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch {
      const jsonText = raw.match(/\\{[\\s\\S]*\\}/)?.[0];
      if (!jsonText) throw new Error("The AI model returned an unreadable result. Please retake the image.");
      parsed = JSON.parse(jsonText);
    }
    const products = Array.isArray(parsed?.products) ? parsed.products.slice(0, mode === "paper" ? 60 : 1).map((p: any) => ({
      name: clean(p.name), brand: clean(p.brand), category: clean(p.category), unit: clean(p.unit, 40) || "piece",
      barcode: clean(p.barcode, 80), sku: clean(p.sku, 80), description: clean(p.description, 500),
      quantity: clean(p.quantity, 30), cost_price: clean(p.cost_price, 30), selling_price: clean(p.selling_price, 30)
    })).filter((p: any) => p.name.length >= 2) : [];
    return NextResponse.json({ products, model: MODEL });
  } catch (error) {
    console.error("Gemini product recognition error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product recognition failed. Please try again." }, { status: 500 });
  }
}
