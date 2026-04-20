import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText, type AIConfig } from "@/lib/ai-client";

const IMAGE_STYLES = {
  product_showcase: "Professional Product Showcase",
  lifestyle: "Lifestyle / In-Use",
  flat_lay: "Flat Lay Composition",
  creative_art: "Creative / Artistic",
  social_media: "Social Media Ready",
} as const;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    description,
    style = "product_showcase",
    apiKey,
    referenceImageDescription,
    isClothing = false,
  } = body;

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 },
    );
  }
  const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
  const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

  const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
  const openaiApiKey = openaiKeySetting?.value || "";

  if (provider === "gemini" && !apiKey)
    return NextResponse.json(
      { error: "Gemini API key is required" },
      { status: 400 },
    );
  if (provider === "openai" && !openaiApiKey)
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set it in Settings." },
      { status: 400 },
    );

  const aiConfig: AIConfig = {
    provider,
    geminiApiKey: apiKey,
    openaiApiKey,
    responseFormat: "json",
  };

  const styleName =
    IMAGE_STYLES[style as keyof typeof IMAGE_STYLES] ||
    IMAGE_STYLES.product_showcase;

  const clothingRules = isClothing
    ? `
    CLOTHING/WEARABLE PRODUCT RULES (CRITICAL — this product is clothing):
    1. The product MUST be shown WORN by a model — NEVER flat-lay or floating alone
    2. Generate a realistic human model (Malay/Southeast Asian appearance) wearing the product
    3. The clothing item must match the reference image EXACTLY — same color, pattern, design, fabric texture
    4. Model should have natural, confident poses that showcase the clothing fit and silhouette
    5. Show how the clothing drapes and fits on a real body
    6. Vary model poses across variations: standing, walking, seated, three-quarter turn, etc.
    7. DO NOT alter the clothing design — keep all prints, logos, stitching, buttons exactly as shown
    `
    : "";

  const systemPrompt = `
    You are an Expert AI Image Prompt Generator for Google Flow (Google's AI image generation tool).
    
    Task: Generate 5 creative image prompt variations based on the user's description.
    
    User Description: "${description}"
    Style: ${styleName}
    Product Type: ${isClothing ? "Clothing / Wearable (model must WEAR it)" : "General Product"}
    ${referenceImageDescription ? `Reference Image Context: ${referenceImageDescription}` : ""}
    
    CRITICAL RULES:
    1. Each prompt MUST start with: "From the image uploaded, accurate scale, no alter, no redesign."
       (This tells Google Flow to use the uploaded reference image as a base)
    2. Each prompt MUST end with: "IMPORTANT: The product in the person's hand must be the EXACT product from the uploaded reference image — same packaging, same label, same colors, same text, same shape. Do NOT generate a generic or imagined version of the product."
       (This reinforces product fidelity at the end of the prompt via recency bias)
    3. PRODUCT REFERENCE RULE (MOST IMPORTANT):
       When describing the person holding, using, or interacting with the product,
       ALWAYS write "the exact product from the uploaded reference image" or "the product from the reference image".
       NEVER describe the product by its appearance, color, shape, or name.
       
       ❌ WRONG: "holds the black product container in his right hand"
       ❌ WRONG: "holds the BAIYAOLANG 20g cream tube"
       ❌ WRONG: "holds a small dark bottle"
       ❌ WRONG: "holds the product up to the camera"
       ✅ CORRECT: "holds the exact product from the uploaded reference image in his right hand"
       ✅ CORRECT: "proudly displays the exact product from the reference image towards the camera"
       ✅ CORRECT: "grips the exact product from the uploaded reference image, positioned prominently"
       
       This is critical because generic descriptions like "black container" or "product" cause the AI to INVENT a new product instead of using the reference image.
    4. Each prompt should be a different creative angle/interpretation of the user's description
    5. Be specific about: lighting, camera angle, background, composition, mood
    6. Keep prompts concise but descriptive (3-5 sentences max)
    7. DO NOT use the word "flow" in any prompt (causes issues with Google Flow)
    8. DO NOT describe opening, unsealing, or unboxing (AI hallucinates interiors)
    9. When including a human model holding/using the product, keep the product as the PRIMARY SUBJECT — the human is secondary context. The product must be the most detailed and prominent element.
    ${clothingRules}
    VARIATION STYLES:
    1. Clean & Minimal — White/light background, studio lighting
    2. Warm & Lifestyle — Natural setting, warm tones, in-use context
    3. Bold & Creative — Dramatic lighting, creative composition
    4. Social Media — Eye-catching, vibrant, scroll-stopping
    5. Premium & Elegant — Luxury feel, sophisticated styling
    
    Output JSON: { "variations": [{ "description": "Short title", "imagePrompt": "Full prompt text" }] }
    Generate exactly 5 variations. All fields must be plain strings.
  `;

  try {
    let rawText: string;
    try {
      rawText = await generateText(systemPrompt, aiConfig);
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : "AI error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed: { variations?: Record<string, unknown>[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fix common AI JSON response issues
      const fixed = cleaned.replace(
        /(?<=:[\s]*")([\s\S]*?)(?="[\s]*[,}\]])/g,
        (match: string) =>
          match
            .replace(/\\/g, "\\\\")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t")
            .replace(/(?<!\\)"/g, '\\"'),
      );
      try {
        parsed = JSON.parse(fixed);
      } catch (e2) {
        const arrMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrMatch) {
          const safeArr = arrMatch[0].replace(
            /(?<=:[\s]*")([\s\S]*?)(?="[\s]*[,}\]])/g,
            (m: string) =>
              m
                .replace(/\\/g, "\\\\")
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t")
                .replace(/(?<!\\)"/g, '\\"'),
          );
          parsed = { variations: JSON.parse(safeArr) };
        } else {
          throw e2;
        }
      }
    }

    const variations = (parsed.variations || []).map(
      (v: Record<string, unknown>, i: number) => ({
        description: String(v.description || `Variation ${i + 1}`),
        imagePrompt: String(v.imagePrompt || v.image_prompt || ""),
      }),
    );

    return NextResponse.json({ variations });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[ai-generate-image] Failed: ${msg}`);
    return NextResponse.json(
      { error: `AI generation failed: ${msg}` },
      { status: 500 },
    );
  }
}
