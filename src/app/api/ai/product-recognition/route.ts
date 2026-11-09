import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "alibaba/qwen3-vl-instruct";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function clean(value: unknown, max = 180): string {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
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

    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 400 });
    const estimatedBytes = Math.floor(match[2].length * 3 / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image is too large. Please use an image under 5 MB." }, { status: 413 });

    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI Gateway key is not available to this deployment. Check the Vercel Secret and redeploy." }, { status: 503 });

    const instruction = mode === "paper"
      ? `Read this product stock-list page. Return every clearly identifiable product row. Extract quantity, buying price and selling price only when explicitly visible. Do not treat page numbers, row numbers or totals as product data. If uncertain, leave the field empty. Return ONLY JSON: {"products":[{"name":"string","brand":"string","category":"string","unit":"string","barcode":"string","sku":"string","description":"string","quantity":"string","cost_price":"string","selling_price":"string"}]}. Do not invent names, numbers, prices, barcodes or SKUs.`
      : `Identify the single main retail product shown. Read visible packaging text and barcode if legible. Return ONLY JSON: {"products":[{"name":"string","brand":"string","category":"string","unit":"string","barcode":"string","sku":"string","description":"string","quantity":"","cost_price":"","selling_price":""}]}. Do not guess barcode, SKU, business prices or stock. If identity is unclear, return an empty products array. Do not invent facts.`;

    const gatewayResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful retail inventory assistant. Extract only information visible in the supplied image. Never invent missing data." },
          { role: "user", content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: image } }
          ] }
        ]
      }),
      signal: AbortSignal.timeout(50000)
    });

    if (!gatewayResponse.ok) {
      const errorBody = await gatewayResponse.text();
      const safeMessage = gatewayResponse.status === 401 || gatewayResponse.status === 403
        ? "AI Gateway rejected the saved key. Check that the key is valid and belongs to the correct Vercel team."
        : gatewayResponse.status === 402
          ? "AI Gateway needs available credits or billing before it can recognise products."
          : gatewayResponse.status === 429
            ? "AI Gateway is receiving too many requests. Please wait a moment and try again."
            : `AI Gateway request failed (HTTP ${gatewayResponse.status}). Please try again.`;
      console.error("AI product recognition gateway error", gatewayResponse.status, errorBody.slice(0, 500));
      return NextResponse.json({ error: safeMessage }, { status: gatewayResponse.status >= 500 ? 502 : gatewayResponse.status });
    }

    const result = await gatewayResponse.json();
    const text = result?.choices?.[0]?.message?.content;
    const raw = Array.isArray(text) ? text.map((part: any) => part?.text || "").join("\n") : String(text || "");
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch {
      const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
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
    console.error("AI product recognition error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product recognition failed. Please try again." }, { status: 500 });
  }
}
