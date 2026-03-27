import { NextRequest, NextResponse } from "next/server";

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
  } = body;

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 },
    );
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key is required" },
      { status: 400 },
    );
  }

  const styleName =
    IMAGE_STYLES[style as keyof typeof IMAGE_STYLES] ||
    IMAGE_STYLES.product_showcase;

  const systemPrompt = `
    You are an Expert AI Image Prompt Generator for Google Flow (Google's AI image generation tool).
    
    Task: Generate 5 creative image prompt variations based on the user's description.
    
    User Description: "${description}"
    Style: ${styleName}
    ${referenceImageDescription ? `Reference Image Context: ${referenceImageDescription}` : ""}
    
    CRITICAL RULES:
    1. Each prompt MUST start with: "From the image uploaded, accurate scale, no alter, no redesign."
       (This tells Google Flow to use the uploaded reference image as a base)
    2. Each prompt should be a different creative angle/interpretation of the user's description
    3. Be specific about: lighting, camera angle, background, composition, mood
    4. Keep prompts concise but descriptive (2-4 sentences max)
    5. DO NOT use the word "flow" in any prompt (causes issues with Google Flow)
    6. DO NOT describe opening, unsealing, or unboxing (AI hallucinates interiors)
    
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        cache: "no-store" as RequestCache,
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Gemini API error" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed: { variations?: Record<string, unknown>[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fix common Gemini JSON issues
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
