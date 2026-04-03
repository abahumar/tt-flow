import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    productId,
    customProduct,
    apiKey,
    language = "malay", // "malay" | "english" | "both"
    tone = "casual", // "casual" | "professional" | "hype" | "friendly"
    variationCount = 5,
    contentTypes = ["title", "description", "hashtags"], // what to generate
  } = body;

  if (!productId && !customProduct)
    return NextResponse.json(
      { error: "productId or customProduct is required" },
      { status: 400 },
    );
  if (!apiKey)
    return NextResponse.json(
      { error: "Gemini API key is required" },
      { status: 400 },
    );

  // Build product info
  let product: {
    title: string;
    description: string | null;
    price: string | null;
    shopName: string | null;
  };
  if (customProduct) {
    product = {
      title: customProduct.title || "Custom Product",
      description: customProduct.description || "",
      price: customProduct.price || null,
      shopName: null,
    };
  } else {
    const dbProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!dbProduct)
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    product = dbProduct;
  }

  const toneMap: Record<string, string> = {
    casual:
      "Gaya bahasa santai, mesra, macam kawan share produk best. Guna 'korang', 'sis', 'babe'. Short punchy sentences.",
    professional:
      "Professional tone. Polished, trustworthy, emphasize quality and value. No slang.",
    hype: "HIGH ENERGY! Excited! Urgency! Best deal ever! Limited time! Use 🔥 emojis sparingly. Bold claims backed by product features.",
    friendly:
      "Warm and approachable like a friend recommending something they love. Genuine and relatable.",
  };

  const langInstruction =
    language === "both"
      ? 'Generate BOTH Malay ("malay") AND English ("english") versions for each field.'
      : language === "english"
        ? "Generate in English only."
        : "Generate in Bahasa Melayu (Malaysian Malay). Natural, conversational Malaysian Malay.";

  const contentTypesList = contentTypes.join(", ");

  const prompt = `You are a TikTok Shop content specialist for the Malaysian market.

PRODUCT INFO:
- Name: ${product.title}
- Description: ${product.description || "N/A"}
- Price: ${product.price || "N/A"}
${product.shopName ? `- Shop: ${product.shopName}` : ""}

TASK: Generate ${variationCount} variations of TikTok content metadata: ${contentTypesList}

TONE: ${toneMap[tone] || toneMap.casual}

LANGUAGE: ${langInstruction}

RULES:
1. "title" — TikTok product link title. MAX 30 characters. Catchy, SEO-optimized. Include key product benefit.
2. "description" — TikTok product description with hashtags embedded naturally. 100-200 chars. Include 3-5 hashtags inline. Focus on benefits, not features.
3. "hashtags" — Array of 6-10 relevant hashtags (WITHOUT #). Mix of: trending TikTok tags (fyp, tiktokshop), category tags, product-specific tags, Malaysian market tags.

RESPOND IN VALID JSON ONLY:
{
  "variations": [
    {
      "label": "Variation name/style",
      ${language === "both" ? `"title_malay": "...", "title_english": "...", "description_malay": "...", "description_english": "...",` : `"title": "...", "description": "...",`}
      "hashtags": ["fyp", "tiktokshop", ...]
    }
  ]
}

IMPORTANT:
- Title MUST be under 30 characters
- Each variation should have a DIFFERENT angle/approach (benefit-focused, problem-solving, emotional, urgency, social proof)
- Hashtags should be relevant and varied across variations
- DO NOT use markdown, only raw JSON`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return NextResponse.json(
        { error: `Gemini API error: ${err}` },
        { status: 500 },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw: rawText },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Generation failed: ${message}` },
      { status: 500 },
    );
  }
}
