import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  VIDEO_FORMATS,
  type VideoFormatId,
  getFormatSceneInstructions,
  HOOK_TEMPLATES,
  GENRE_HOOK_STYLE,
  DIALOG_TONE_SANTAI,
} from "@/lib/prompt-templates";

const REFERENCES_DIR = "/data/images/references";

const PLATFORM_LOGICS: Record<string, (duration: number) => string> = {
  flow: () => `
    NORMAL UGC + LOGIC AI STYLE: Authentic, Social Media style. High-end smartphone look. Handheld steady camera.
    DO NOT describe lighting (Assume natural).
    IF FASHION/OUTFIT DETECTED: Use "FASHION REVIEW LOGIC" & GENERATE VARIETY.
    CAMERA RULE: Specify framing clearly (e.g., "Static chest-down framing", "Full body handheld").
    ACTION RULE: BE CREATIVE with natural UGC poses/actions.
    STRICT FORBIDDEN: NO 360 spins, NO unbuttoning/unzipping, NO macro zooms, NO aggressive movements.
  `,
  kling: (dur) =>
    dur === 10
      ? `KLING LOGIC (10s): ONE CONTINUOUS LONG SHOT (No Cuts). Actions flow naturally. Example: Touch sleeve [0-3s] -> turn body [3-6s] -> smile [6-10s].`
      : `KLING LOGIC (5s): SHORT CONTINUOUS SHOT. Concise. Example: Turn head [0-2s] -> Smile [2-5s].`,
  grok: (dur) =>
    dur === 10
      ? `GROK LOGIC (10s): ONE CONTINUOUS SHOT. 3 SEGMENTS: [0-3s] -> [3-6s] -> [6-10s]. ALWAYS INCLUDE: "minimal movement".`
      : `GROK LOGIC: Short (6s). [START POSE/GRIP] -> [ACTION]. Concise. ALWAYS INCLUDE: "minimal movement".`,
  sora: () =>
    `SORA LOGIC: High fidelity physics. Rich atmosphere. Cinematic lighting.`,
};

const AVATAR_DNA: Record<string, string[]> = {
  woman_malay_hijab: [
    "A friendly 25-year-old Malay woman with a warm smile. Natural makeup look. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A cheerful 24-year-old Malay woman with dewy skin and subtle lip tint. Sweet and approachable girl-next-door energy. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A confident 27-year-old Malay woman with minimal gold jewelry. Clean, put-together modest fashion influencer vibe. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
  ],
  woman_malay_freehair: [
    "A trendy 23-year-old Malay woman with shoulder-length wavy hair. Energetic and approachable vibe. Wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A stylish 25-year-old Malay woman with long straight black hair and wispy bangs. Cool streetwear aesthetic with a playful, youthful energy. Wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A vibrant 22-year-old Malay woman with a messy bun and hoop earrings. Effortlessly trendy Y2K-inspired look with a fun, carefree attitude. Wearing handsocks and socks. Fully covered aurat (tutup aurat).",
  ],
  woman_malay_corporate: [
    "A professional 30-year-old Malay woman with a confident posture. Sophisticated and authoritative look. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A poised 28-year-old Malay woman with minimal pearl stud earrings. Sharp, ambitious corporate leader energy with a warm yet commanding presence. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
    "A polished 31-year-old Malay woman with reading glasses resting on her collar. Smart, trustworthy senior executive vibe. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat).",
  ],
  woman_malay_elder: [
    "A warm 50-year-old Malay makcik with a gentle motherly smile and laugh lines. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat). Kind and trustworthy auntie energy.",
    "A cheerful 55-year-old Malay woman with a round friendly face and reading glasses. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat). Experienced, wise, and approachable.",
    "A graceful 48-year-old Malay woman with a calm, elegant demeanor. Hijabi, wearing handsocks and socks. Fully covered aurat (tutup aurat). Mature beauty with a confident, nurturing presence.",
  ],
  man_malay_casual: [
    "A 26-year-old Malay man with a short, neat haircut and a slight stubble. Relaxed and friendly boy-next-door vibe.",
    "A laid-back 24-year-old Malay man with a textured middle-part hairstyle. Clean-shaven with a warm, easygoing smile. Chill beach-town guy energy.",
    "A cool 27-year-old Malay man with a buzz cut and thin silver chain necklace. Subtle streetwear vibe with a confident, mysterious edge.",
  ],
  man_malay_corporate: [
    "A sharp 32-year-old Malay man with a clean-shaven face or very neat beard. Professional and successful appearance.",
    "A distinguished 30-year-old Malay man with neatly combed side-parted hair and a trimmed goatee. Smart-casual corporate entrepreneur look.",
    "A polished 34-year-old Malay man with a clean fade haircut and frameless glasses. Modern tech-CEO sophisticated vibe.",
  ],
  man_malay_elder: [
    "A wise 55-year-old Malay pakcik with a neatly trimmed grey beard and warm eyes. Wearing a kopiah. Calm, fatherly, and trustworthy uncle energy.",
    "A dignified 52-year-old Malay man with salt-and-pepper hair and a kind smile. Wearing neat songkok. Experienced, respected community leader vibe.",
    "A gentle 58-year-old Malay man with reading glasses and a soft-spoken demeanor. Clean and well-groomed. Wise grandfather energy with warmth and authority.",
  ],
  product_only: [
    "No human model. Focus entirely on the product packaging, textures, and ingredients. High-end product photography style with aesthetic props and clean backgrounds.",
    "No human model. Showcase the product on a marble surface with soft botanical accents and warm directional lighting. Premium flatlay aesthetic with subtle shadows.",
    "No human model. Display the product against a clean gradient background with geometric props and soft fabric draping. Minimalist editorial product photography style.",
  ],
};

function pickAvatarDna(avatarId: string): string {
  const variants = AVATAR_DNA[avatarId] || AVATAR_DNA.woman_malay_hijab;
  return variants[Math.floor(Math.random() * variants.length)];
}

const GENRE_INSTRUCTIONS: Record<string, string> = {
  comedy:
    "GENRE: COMEDY/SKETCH. Use humor, exaggerated reactions, funny relatable situations. Tone: Playful, 'Masuk air'.",
  educational:
    "GENRE: EDUCATIONAL/TIPS. Focus on value, hacks, 'How-To', and facts. Tone: Helpful, Smart, Trustworthy.",
  emotional:
    "GENRE: EMOTIONAL/STORYTELLING. Focus on pain points, feelings, transformation. Tone: Soft, Touching, Relatable.",
  hardsell:
    "GENRE: HARD SELL/PROMO. High energy, fast cuts, focus on discounts, urgency and 'Buy Now'. Tone: Hype, Exciting.",
  softsell:
    "GENRE: SOFT SELL/LIFESTYLE. Storytelling first, product second. Subtle integration into daily life. Tone: Chill, aesthetic, genuine recommendation like a friend.",
  pov: "GENRE: POV (POINT OF VIEW). Relatable scenario starting with 'POV: ...'. Direct address to camera. Tone: Conversational, immersive, relatable situation.",
  asmr: "GENRE: ASMR/SATISFYING. Focus intensely on sounds (tapping, unboxing, applying), textures, and visual satisfaction. Minimal dialogue, high sensory details. Tone: Calm, mesmerizing.",
  vlog: "GENRE: VLOG/DAY IN LIFE. Documenting a routine where the product fits in naturally. 'A day with me' style. Tone: Casual, authentic, diary-style.",
  review:
    "GENRE: REVIEW/TESTIMONIAL. Personal honest review of the product. Show features, give opinion. Tone: Trustworthy, authentic, relatable.",
  unboxing:
    "GENRE: UNBOXING/FIRST IMPRESSION. First-look at the product, reactions, examining packaging and contents. Tone: Excited, curious, discovering.",
  fungsi_produk:
    "GENRE: PRODUCT DEMO/SHOWCASE. Focus on demonstrating the product's key features, how it works, and its benefits. Tone: Informative, confident.",
  problem_solution:
    "GENRE: PROBLEM-SOLUTION. Show a relatable problem, then reveal the product as the solution. Tone: Empathetic then triumphant.",
};

const ANTI_HALLUCINATION = `
  ANTI-HALLUCINATION & FORBIDDEN CONCEPTS:
  1. FORBIDDEN ACTIONS: NEVER OPEN, UNSEAL, or UNBOX products. AI cannot see inside and will hallucinate.
  2. INTERACTION RULE: Subject ONLY touches, tilts, pans, or shows the exterior to the camera.
  3. FORBIDDEN WORDS: STRICTLY Do NOT use "flow", "draped", "wind", "open", "inside" (Causes severe artifacts).
  4. MIRROR SELFIE: Static Phone POV. No walking.
  5. OUTFIT: No 360 spins (AI doesn't know back). Slow Parallax.
  6. ACCESSORIES: If small, no macro.
  7. SHOES: Extreme low angle.
  8. BAG: Hand resting. No opening bag.
  9. KITCHEN: Top down.
`;

const stringify = (val: unknown): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    if (Array.isArray(val)) return val.map(stringify).join("\n");
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `[${k.toUpperCase()}] ${stringify(v)}`)
      .join("\n");
  }
  return String(val);
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    productId,
    customProduct,
    platform = "flow",
    mode = "paired", // "paired" (default) | "storyline"
    duration = 10,
    includeDialog = false,
    includeEnglishDialog = false,
    videoType = "fungsi_produk",
    apiKey,
    avatarId = "woman_malay_hijab",
    imageCount = 1,
    // Video Studio consistent mode
    consistentMode = false,
    sceneCount = 3,
    backgroundDesc = "",
    modelDesc = "",
    // USP/audience overrides from V2 UI
    customUsp = "",
    customTargetAudience = "",
    videoFormat = null, // "super_short" | "short" | "complete" | null
    varyBackground = false,
    productImage = null, // filename from /api/upload (for sending product image to Gemini)
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

  // Build product info from either DB product or custom input
  let product: {
    title: string;
    description: string | null;
    price: string | null;
    shopName: string | null;
    usp: string | null;
    targetAudience: string | null;
    images?: string;
  };
  if (customProduct) {
    product = {
      title:
        customProduct.description
          ?.split(/[\n.\-,]/)[0]
          ?.trim()
          ?.substring(0, 60) || "Custom Product",
      description: customProduct.description || "",
      price: null,
      shopName: null,
      usp: customProduct.usp || null,
      targetAudience: customProduct.targetAudience || null,
    };
  } else {
    const dbProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!dbProduct)
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    product = {
      ...dbProduct,
      usp: customUsp || dbProduct.usp || null,
      targetAudience: customTargetAudience || dbProduct.targetAudience || null,
    };
  }

  // ─── Fetch product image as base64 for Gemini vision ───
  let productImageBase64: string | null = null;
  let productImageMime = "image/jpeg";

  // Priority 1: Uploaded product image (from V2 Studio)
  if (productImage) {
    try {
      const imgPath = join(REFERENCES_DIR, String(productImage));
      if (existsSync(imgPath)) {
        const buf = await readFile(imgPath);
        productImageBase64 = buf.toString("base64");
        const ext = String(productImage).split(".").pop()?.toLowerCase();
        productImageMime =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        console.log(
          `[ai-generate] Loaded product image from upload: ${productImage} (${Math.round(buf.length / 1024)}KB)`,
        );
      }
    } catch (e) {
      console.warn("[ai-generate] Could not read uploaded product image:", e);
    }
  }

  // Priority 2: Catalog product images (TikTok Shop URLs)
  if (!productImageBase64 && product.images) {
    try {
      const imgs = JSON.parse(product.images || "[]") as string[];
      if (imgs[0]) {
        const imgRes = await fetch(imgs[0]);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          productImageBase64 = buf.toString("base64");
          productImageMime = imgRes.headers.get("content-type") || "image/jpeg";
          console.log(
            `[ai-generate] Fetched catalog product image (${Math.round(buf.length / 1024)}KB)`,
          );
        }
      }
    } catch (e) {
      console.warn("[ai-generate] Could not fetch catalog product image:", e);
    }
  }

  // ─── GEMPAK MODE (Video Studio v2) ───
  if (mode === "gempak") {
    const isCustomModel = avatarId === "custom";
    const avatarDna = isCustomModel
      ? `CUSTOM MODEL — ${modelDesc || "Use the uploaded model reference image exactly as shown. Describe what you see: age, ethnicity, clothing, hijab if any, expression, vibe."}`
      : pickAvatarDna(avatarId);
    const genreInst =
      GENRE_INSTRUCTIONS[videoType] || `GENRE: ${videoType.toUpperCase()}`;
    const dialogInst = includeDialog
      ? `Include dialog in casual Bahasa Melayu for each scene. Max 20 words per scene. ${DIALOG_TONE_SANTAI}`
      : "NO DIALOG REQUIRED.";
    const englishDialogInst = includeEnglishDialog
      ? 'Also include "dialog_english" field with English translation.'
      : "";
    const dialogOutputFields = [
      includeDialog ? '"script": "Dialog BM (max 20 words)"' : null,
      includeEnglishDialog ? '"dialog_english": "English translation"' : null,
    ]
      .filter(Boolean)
      .join(",\n      ");

    const gempakPrompt = `
You are a Top Malaysian TikTok Content Creator & Expert Video Director for Google Flow AI.
Create a high-converting video script in CASUAL BAHASA MALAYSIA (slang).

${genreInst}
MODEL/AVATAR DNA: ${avatarDna}
NUMBER OF SCENES: ${sceneCount}

PRODUCT INFO:
Name: ${product.title}
Description: ${product.description || "N/A"}
Price: ${product.price || "N/A"}
Shop: ${product.shopName || "N/A"}
${product.usp ? `USP (Unique Selling Points): ${product.usp}` : ""}
${product.targetAudience ? `Target Audience: ${product.targetAudience}` : ""}
${backgroundDesc ? `BACKGROUND CONTEXT: ${backgroundDesc}` : ""}
${modelDesc ? `MODEL CONTEXT: ${modelDesc}` : ""}
${
  product.usp || product.targetAudience
    ? `
USP & AUDIENCE RULES:
${product.usp ? `- The USP stage scene MUST highlight these specific selling points: "${product.usp}". Do NOT invent features — use ONLY the USP provided.` : ""}
${
  product.targetAudience
    ? `- The HOOK must speak DIRECTLY to the target audience: "${product.targetAudience}". Use language, scenarios, and pain points relatable to this audience.
- The CTA must appeal specifically to this audience segment.
- TikTok captions and hashtags should target this audience.`
    : ""
}
`
    : ""
}

IMPORTANT — PRODUCT IMAGE ANALYSIS:
${productImageBase64 ? "- A product image has been provided inline. ANALYZE it carefully to understand the product's exact appearance, color, shape, material, branding, and category." : "- No product image available. Rely on the text description above."}
- The PRODUCT IMAGE has been uploaded as a reference image in Google Flow.
- ${isCustomModel ? "The MODEL FACE has also been uploaded as a reference image." : ""}
- The AI image generator (Google Flow) will have access to these uploaded reference images.
- Your visual_prompt_en MUST instruct Google Flow to use these uploaded reference images exactly as they are.
- DO NOT invent or describe a different product. The product in the reference image IS the product.

PRODUCT-AWARE MODEL RULES (CRITICAL — analyze the product image):
- If the product is WEARABLE (hijab, headscarf, clothing, dress, blouse, shoes, accessories, bag):
  1. The model MUST WEAR/USE the exact product from the image — NEVER hold it flat or display it alone.
  2. The product must match the reference image EXACTLY — same color, pattern, fabric, design, branding.
  3. DO NOT describe competing garments in visual_dna that conflict with the product. E.g., if product is a hijab, do NOT describe a different hijab in the model DNA.
  4. Model should have natural, confident poses that showcase the product fit and silhouette.
  5. Vary poses across scenes: standing, walking, seated, three-quarter turn.
  6. The model WEARS the product in EVERY scene.
- If the product is NOT wearable (skincare, gadget, food, supplement, etc.):
  1. The model HOLDS, USES, or INTERACTS with the product naturally.
  2. Keep the full model outfit description from the avatar DNA above.
  3. Focus on product interaction: holding, applying, demonstrating.

${dialogInst}
${englishDialogInst}

RULES FOR visual_prompt_en (CRITICAL — this goes to Google Flow image generator):
- Each visual_prompt_en must be a SELF-CONTAINED, detailed description for AI image generation.
- MUST start with: "From the image uploaded, accurate scale, no alter, no redesign."
- The product MUST be the EXACT product from the uploaded reference image — same packaging, same label, same colors, same branding. DO NOT change or redesign the product.
- Include: subject appearance (based on MODEL DNA above), pose, expression, camera framing, product placement.
- MUST specify 9:16 vertical composition.
- Scene 1 is the MASTER REFERENCE — establish the model look here. Other scenes MUST keep the same model.
${varyBackground ? "- VARY the background/setting for EACH scene — use different locations, times of day, or environments (e.g., kitchen, living room, outdoor café, park, vanity table, office desk). This keeps the video visually dynamic. The MODEL and PRODUCT must stay consistent, but the BACKGROUND must change every scene." : ""}
- Keep descriptions cinematic, realistic, 8k quality.
- Focus on: pose + product interaction + camera angle + expression.
- BE SPECIFIC about camera framing: "Static chest-up framing", "Full body medium shot", "Close-up hands detail".

${ANTI_HALLUCINATION}

RULES FOR video_prompt:
- Write a SINGLE SHORT sentence describing subtle motion from the static frame.
- MAX 15 words. NO structured format. NO labels.
- Focus on ONE gentle action + camera framing.
- Example: "Model gently lifts product toward camera, slight smile, static chest-up framing."

Output JSON:
{
  "script_title": "Catchy viral title in casual Malay",
  "hook_title": "Short punchy hook title for intro card (3-5 words, catchy, e.g. 'Rahsia Kulit Glowing!')",
  "hook_subtitle": "Product name or tagline for intro subtitle",
  "visual_dna": "Detailed, consistent model appearance. Include: age, ethnicity, expression, vibe. If product is WEARABLE: describe the model wearing the EXACT product from the image (color, material, design). Do NOT add conflicting clothing. If product is NOT wearable: describe a suitable outfit that complements the product.",
  "genre_style": "Genre name",
  "variations": [
    {
      "description": "Stage name (e.g. HOOK, USP, CTA)",
      "time": "0-3s",
      "stage": "HOOK",
      ${dialogOutputFields ? dialogOutputFields + "," : ""}
      "visual_prompt_en": "Detailed visual scene description starting with 'From the image uploaded, accurate scale, no alter, no redesign.' — product must match uploaded reference exactly",
      "video_prompt": "Short single sentence motion description (max 15 words)",
      "overlay_text": "Short punchy text (5-8 words) to display on screen during this scene, summarizing the key message. NO EMOJIS allowed — plain text only. Example: 'Tahan 24 Jam, Kulit Glowing!'. Leave empty for scenes that don't need text.",
      "variation_hook_title": "REQUIRED — Short punchy hook title for THIS scene (3-7 words, attention-grabbing, e.g. 'Rahsia Kulit Glowing!')",
      "variation_video_caption": "REQUIRED — Catchy video caption in casual Malay for THIS scene (max 100 chars, e.g. 'Tengok sendiri hasilnya!')",
      "tiktok_product_name": "Clean product name (max 30 chars)",
      "tiktok_description": "Casual Malay product description with hashtags (max 200 chars)",
      "tiktok_caption": "Catchy casual Malay TikTok caption (max 150 chars)",
      "tiktok_hashtags": ["fyp", "tiktokshop", "relevant", "tags"]
    }
  ]
}

Generate EXACTLY ${sceneCount} variations/scenes. Each must have a different stage and time range.
All string fields must be plain strings (never objects or arrays).
`;

    try {
      // Build parts array — text prompt + optional product image
      const gempakParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [{ text: gempakPrompt }];

      if (productImageBase64) {
        gempakParts.push({
          inlineData: {
            mimeType: productImageMime,
            data: productImageBase64,
          },
        });
        console.log(
          "[ai-generate/gempak] Sending product image inline to Gemini for analysis",
        );
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: gempakParts }],
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

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
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
        parsed = JSON.parse(fixed);
      }

      const scriptTitle = String(parsed.script_title || "");
      const hookTitle = String(parsed.hook_title || "");
      const hookSubtitle = String(parsed.hook_subtitle || "");
      const visualDna = String(parsed.visual_dna || "");
      const genreStyle = String(parsed.genre_style || videoType);
      const rawVariations = (parsed.variations || []) as Record<
        string,
        unknown
      >[];

      const variations = rawVariations.map((v, i) => {
        const visualPromptEn = String(v.visual_prompt_en || "");
        // Construct the full image prompt with visual DNA embedded (GempakStudio style)
        const imagePrompt = visualPromptEn
          ? `Generate a high-quality 9:16 vertical photo. SCENE: ${visualPromptEn}. MODEL DNA: ${visualDna}. STYLE: Cinematic, realistic, 8k.`
          : "";

        let hashtags: string[] = [];
        if (Array.isArray(v.tiktok_hashtags)) {
          hashtags = (v.tiktok_hashtags as string[]).map((h) =>
            String(h).replace(/^#/, ""),
          );
        }

        return {
          description: String(v.description || `Scene ${i + 1}`),
          imagePrompt,
          videoPrompt: (() => {
            const motion = String(v.video_prompt || "");
            const script = String(v.script || "")
              .replace(
                /[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F000}-\u{1FFFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
                "",
              )
              .trim();
            if (script && includeDialog) {
              return `${motion} Dialog: "${script}"`;
            }
            return motion;
          })(),
          visualPromptEn,
          script: String(v.script || ""),
          dialogEnglish: String(v.dialog_english || ""),
          time: String(v.time || ""),
          stage: String(v.stage || ""),
          tiktokProductName: String(v.tiktok_product_name || "")
            .substring(0, 30)
            .trim(),
          tiktokDescription: String(v.tiktok_description || "").trim(),
          tiktokCaption: String(v.tiktok_caption || "").trim(),
          tiktokHashtags: hashtags,
          overlayText: String(v.overlay_text || ""),
          hookTitle: String(
            v.variation_hook_title || v.hook_title || hookTitle || "",
          ).trim(),
          videoCaption: String(
            v.variation_video_caption || v.video_caption || "",
          ).trim(),
        };
      });

      return NextResponse.json({
        type: "gempak",
        scriptTitle,
        hookTitle,
        hookSubtitle,
        visualDna,
        genreStyle,
        variations,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[ai-generate/gempak] Failed: ${msg}`);
      return NextResponse.json(
        { error: `AI generation failed: ${msg}` },
        { status: 500 },
      );
    }
  }

  const platformLogic =
    PLATFORM_LOGICS[platform]?.(duration) || PLATFORM_LOGICS.flow(duration);

  // --- DIALOG LOGIC ---
  const santaiTone = videoFormat && includeDialog ? DIALOG_TONE_SANTAI : "";
  const dialogLogic = `
    DIALOGUE STRUCTURE: Strictly follow [HOOK] + [CONTENT] + [CTA].
    ${includeDialog ? '1. MALAY ("dialog"): Soft Selling, Friendly. Must be a single string.' : ""}
    ${includeEnglishDialog ? '2. ENGLISH ("dialog_english"): Translated version. Must be a single string.' : ""}
    ${!includeDialog && !includeEnglishDialog ? "NO DIALOG REQUIRED." : ""}
    ${santaiTone}
  `;

  const dialogFields = [
    includeDialog ? '"dialog"' : null,
    includeEnglishDialog ? '"dialog_english"' : null,
  ]
    .filter(Boolean)
    .map((f) => `, ${f}: "single string"`)
    .join("");

  // --- PROMPT STRATEGY ---
  let promptStrategy: string;
  let variantCount: number;

  const avatarDna = pickAvatarDna(avatarId);

  if (mode === "storyline") {
    variantCount = consistentMode ? sceneCount : imageCount;
    if (consistentMode) {
      // Video Studio mode — lock background + model, vary only scenes
      const bgInstruction =
        backgroundDesc ||
        "Use the uploaded background image as the environment";
      const modelInstruction = modelDesc || avatarDna;
      const hasModelImage = !!modelDesc;
      const hasBgImage = !!backgroundDesc;

      const modelRule = hasModelImage
        ? `IMPORTANT — MODEL REFERENCE IMAGE IS UPLOADED:
        The model image is ALREADY uploaded as a visual reference. The AI image generator will USE it directly.
        DO NOT re-describe the model's appearance (face, hair, clothing, hijab, skin tone, etc.).
        Model context (for your understanding only, DO NOT put in prompts): "${modelInstruction}"`
        : `MODEL/AVATAR TO USE IN ALL PROMPTS: ${modelInstruction}
        CRITICAL: You MUST describe this exact model in every image_prompt. Include their appearance details (age, ethnicity, clothing, hijab if applicable).
        The model description must be consistent across ALL scenes.`;

      const bgRule = hasBgImage
        ? `The background image is ALREADY uploaded as a visual reference. The AI image generator will USE it directly.
        DO NOT re-describe the background/setting details (wall texture, floor, lighting, etc.).
        Background context (for your understanding only, DO NOT put in prompts): "${bgInstruction}"`
        : `No background reference image. Describe a suitable background/setting in each image_prompt.`;

      const imagePromptExample = hasModelImage
        ? `Example good image_prompt:
        "From the image uploaded, accurate scale, no alter, no redesign. Model holds the product casually in her right hand, positioned slightly to the front. Static chest-up framing, centered, warm smile."

        Example BAD image_prompt (DO NOT DO THIS):
        "From the image uploaded... A friendly 25-year-old Malay woman with a warm smile, wearing a stylish light beige chiffon hijab... stands in a clean minimalist studio background with light grey concrete texture wall..."`
        : `Example good image_prompt:
        "From the image uploaded, accurate scale, no alter, no redesign. ${modelInstruction} holds the product casually in her right hand, positioned slightly to the front. Static chest-up framing, centered, warm smile."`;

      promptStrategy = `
        CONSISTENT VIDEO STUDIO MODE (${sceneCount} SCENES):
        Generate exactly ${sceneCount} paired prompts. Each scene creates a separate standalone video.

        ${modelRule}

        BACKGROUND:
        ${bgRule}

        IMAGE PROMPT RULES:
        Each image_prompt MUST start with: "From the image uploaded, accurate scale, no alter, no redesign."
        Then describe:
        ${hasModelImage ? "- How the model interacts with the product (holding, showing, using, etc.)" : "- The model (using the exact avatar description above) and how they interact with the product"}
        - The model's pose and expression (smiling, looking at camera, looking at product, etc.)
        - Camera framing (chest-up, full body, close-up on hands, etc.)
        - Product position relative to the model (in right hand, on table, held up to camera, etc.)
        ${hasBgImage ? "DO NOT describe what the background looks like." : "- A suitable background/setting for the scene."}
        Keep it focused on pose + product interaction + camera angle.

        ${imagePromptExample}

        VIDEO PROMPT RULES:
        Write a single short sentence for the video_prompt field.
        Describe ONE simple, subtle motion from the generated image.
        Keep it under 20 words. No labels, no structured format.
        Focus on: one gentle action + camera framing.

        Example good video_prompt:
        "Model gently lifts the product toward camera, slight smile, static chest-up framing."
        "Slow gentle pan across the product in model's hands, soft natural sway."

        Example BAD video_prompt (TOO LONG/STRUCTURED — DO NOT DO THIS):
        "Scene: Model holds product prominently. Camera: Static medium shot. Action: Model gently lifts the product..."

        ${
          videoFormat && VIDEO_FORMATS[videoFormat as VideoFormatId]
            ? (() => {
                const fmtId = videoFormat as VideoFormatId;
                const fmt = VIDEO_FORMATS[fmtId];
                const scenes = getFormatSceneInstructions(fmtId, sceneCount);
                const hookStyle = GENRE_HOOK_STYLE[videoType] || "curiosity";
                const hookExamples = HOOK_TEMPLATES[hookStyle]
                  .slice(0, 3)
                  .join("\n        ");

                return `STRUCTURE (${fmt.name} — ${fmt.description}):
        ${scenes
          .map(
            (s) => `${s.sceneNumber}. SCENE ${s.sceneNumber} (${s.label}):
           VISUAL: ${s.visualDirection}
           DIALOG: ${s.dialogDirection}`,
          )
          .join("\n        ")}

        HOOK TEMPLATES (for Scene 1, fill blanks with product context — style: ${hookStyle}):
        ${hookExamples}

        IMPORTANT: Scene 1 MUST use a hook template style. Fill the blanks with product-relevant content.
        Each scene's visual and dialog MUST match the element purpose described above.`;
              })()
            : `STRUCTURE (AIDA - UGC REVIEW STYLE):
        1. SCENE 1 (ATTENTION/HOOK): Model holds/shows product prominently. Eye-catching pose.
        2. MIDDLE SCENES (INTEREST & DESIRE): Different product interactions — close-up, demo, turning product.
        3. LAST SCENE (ACTION/CTA): Model presents product directly to camera. Inviting expression.`
        }

        ONLY vary across scenes: pose, product interaction, camera angle, expression, and simple action.
      `;
    } else if (platform === "flow") {
      promptStrategy = `
        STORYLINE (${imageCount} IMAGES): Generate exactly ${imageCount} paired prompts (1 per image).
        STRUCTURE (AIDA - UGC REVIEW STYLE):
        1. IMAGE 1 (ATTENTION/HOOK): Visual hook to stop scrolling.
        2. MIDDLE IMAGES (INTEREST & DESIRE): Product review/demo. IF FASHION: Focus on Look/Vibe/Style.
        3. LAST IMAGE (ACTION/CTA): Strong Call to Action.
        CRITICAL: Each prompt creates a separate standalone video.
        FULLY RE-DESCRIBE the scene for every prompt. NEVER "Same as above".
      `;
    } else if (platform === "grok") {
      promptStrategy = `STORYLINE (${imageCount} IMAGES): Generate exactly ${imageCount} paired prompts. HOOK -> SOLUTION -> CTA. CONCISE (max 15 words).`;
    } else {
      promptStrategy = `STORYLINE (${imageCount} IMAGES): Generate exactly ${imageCount} paired prompts. HOOK -> SOLUTION -> CTA.`;
    }
  } else {
    // "paired" mode — generate variations
    if (platform === "sora") {
      variantCount = 10;
      promptStrategy = `GENERATE 10 PAIRED VARIATIONS (${duration}s). Order: 1.Fast Ads, 2.Luxury Ads, 3.Funny Ads, 4.Twist, 5.UGC Problem, 6.UGC Normal, 7.Review, 8.Creative High Conv, 9.Unique Angle, 10.Trending.`;
    } else if (
      platform === "kling" ||
      (platform === "grok" && duration === 10)
    ) {
      variantCount = 5;
      const timeStruct =
        platform === "kling" && duration === 5
          ? "First [0-2s] [Start] -> Second [2-5s] [Final]"
          : "First [0-3s] [Start] -> Second [3-6s] [Next] -> Third [6-10s] [Final]";
      promptStrategy = `GENERATE 5 PAIRED VARIATIONS. SINGLE CONTINUOUS SCENE (No cuts). Fill action field with: ${timeStruct}`;
    } else if (platform === "grok") {
      variantCount = 5;
      promptStrategy = `5 PAIRED VARIANTS: Candid & Quick (6s loops).`;
    } else {
      variantCount = 5;
      promptStrategy = `5 PAIRED VARIANTS (UGC/Social Style): Aesthetic, Unboxing, POV, Demo, Lifestyle.`;
    }
  }

  const avatarInstruction =
    avatarId === "product_only"
      ? `MODEL/AVATAR: ${avatarDna}`
      : `MODEL/AVATAR (MUST USE IN ALL PROMPTS): The subject/model in every scene is — ${avatarDna}
    CRITICAL: ALWAYS describe this exact model in both image_prompt and scene. NEVER change the model's appearance across variations.`;

  const outputFields = consistentMode
    ? `"video_prompt": "Short single sentence video motion"`
    : `"scene": "...", "camera": "...", "action": "..."`;

  const systemPrompt = `
    You are an Expert AI Video Director for ${platform.toUpperCase()}.
    Title Language: CASUAL MALAY.
    ${avatarInstruction}
    ${platformLogic}
    ${ANTI_HALLUCINATION}
    PRODUCT-AWARE MODEL RULES (CRITICAL — analyze the product from the reference image):
    - If the product is WEARABLE (hijab, headscarf, clothing, dress, blouse, shoes, accessories, bag):
      1. The model MUST WEAR/USE the exact product — NEVER hold it flat or display it alone.
      2. The product must match the reference image EXACTLY — same color, pattern, fabric, design, branding.
      3. Model should have natural, confident poses that showcase the product fit and silhouette.
      4. Vary poses across variations: standing, walking, seated, three-quarter turn.
      5. DO NOT alter the clothing design — keep all prints, logos, stitching, buttons exactly as shown.
      6. The model WEARS the product in EVERY variation/scene.
    - If the product is NOT wearable (skincare, gadget, food, supplement, etc.):
      1. The model HOLDS, USES, or INTERACTS with the product naturally.
      2. Keep the full model outfit description.
      3. Focus on product interaction: holding, applying, demonstrating.
    ${dialogLogic}
    Task: ${promptStrategy}

    CRITICAL RULE — PAIRED IMAGE + VIDEO PROMPTS:
    For EACH variation, generate TWO prompts that share the SAME scene:

    1. "image_prompt": Describes the FIRST FRAME / STARTING FRAME of the video as a STATIC image.
       - Same scene, same camera angle, same composition as the video — but frozen (no motion).
       - Must include: subject position, product placement, background, camera framing.
       - Must start with: "From the image uploaded, accurate scale, no alter, no redesign."
       - This image will be used as the reference/starting frame for the AI video generator.

    2. ${consistentMode ? '"video_prompt": A single SHORT sentence describing the subtle motion from the first frame.' : '"scene" + "camera" + "action": The VIDEO prompt that animates from that first frame.\n       - Describes the motion, camera movement, and actions that happen AFTER the first frame.\n       - Must be consistent with the image_prompt (same scene, same setup).'}

    Product: ${product.title}
    Description: ${product.description || "N/A"}
    Price: ${product.price || "N/A"}
    Shop: ${product.shopName || "N/A"}
    ${GENRE_INSTRUCTIONS[videoType] || `GENRE: ${videoType.toUpperCase()}`}

    Output JSON: { "hook_title": "Short punchy hook title for intro card (3-5 words)", "hook_subtitle": "Product name or tagline", "variations": [{ "description": "Title", "image_prompt": "...", ${outputFields}${dialogFields}, "overlay_text": "Short punchy text (5-8 words) for on-screen display, NO EMOJIS, plain text only", "variation_hook_title": "REQUIRED — Short punchy hook title for THIS specific variation (3-7 words, attention-grabbing, e.g. 'Rahsia Kulit Glowing!', 'Mesti Cuba Ni!', 'Last Stock!')", "variation_video_caption": "REQUIRED — Catchy video caption in casual Malay for THIS variation (max 100 chars, engaging & scroll-stopping, e.g. 'Tengok sendiri hasilnya lepas 3 hari guna!')", "tiktok_product_name": "Clean short product name for TikTok (max 30 chars, no special characters, no SKU codes)", "tiktok_description": "Compelling casual Malay product description with hashtags (max 200 chars)", "tiktok_caption": "Catchy casual Malay TikTok post caption (max 150 chars, no hashtags)", "tiktok_hashtags": ["fyp", "tiktokshop", "relevantTag1", "relevantTag2", "relevantTag3"] }] }
    IMPORTANT: Every variation MUST include "variation_hook_title" and "variation_video_caption" — these are REQUIRED fields, never leave them empty.
    Generate exactly ${variantCount} variations. All string fields must be plain strings (never objects).
  `;

  try {
    // Build parts array — text prompt + optional product image
    const promptParts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: systemPrompt }];

    if (productImageBase64) {
      promptParts.push({
        inlineData: {
          mimeType: productImageMime,
          data: productImageBase64,
        },
      });
      console.log(
        "[ai-generate/paired] Sending product image inline to Gemini for analysis",
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
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

    let parsed: {
      variations?: Record<string, unknown>[];
      hook_title?: string;
      hook_subtitle?: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fix common Gemini JSON issues: unescaped newlines/tabs inside strings
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
        // Last resort: extract JSON array content manually
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
      (v: Record<string, unknown>, i: number) => {
        const dialogMy = stringify(v.dialog);
        const dialogEn = stringify(v.dialog_english);
        const d_my =
          includeDialog && dialogMy ? `\nDialog Malay: "${dialogMy}"` : "";
        const d_en =
          includeEnglishDialog && dialogEn
            ? `\nDialog (EN): "${dialogEn}"`
            : "";

        // Build video prompt text
        let videoContent: string;
        if (v.video_prompt) {
          // consistentMode: single short sentence
          videoContent = `${stringify(v.video_prompt)}${d_my}${d_en}`;
        } else if (
          platform === "kling" ||
          (platform === "grok" && duration === 10)
        ) {
          videoContent = `Scene: ${stringify(v.scene)}\n\n${stringify(v.action)}${d_my}${d_en}`;
        } else {
          videoContent = `Scene: ${stringify(v.scene)}\nCamera: ${stringify(v.camera) || "Static"}\nAction: ${stringify(v.action)}${d_my}${d_en}`;
        }

        // Parse hashtags array
        let hashtags: string[] = [];
        if (Array.isArray(v.tiktok_hashtags)) {
          hashtags = (v.tiktok_hashtags as string[]).map((h) =>
            String(h).replace(/^#/, ""),
          );
        }

        return {
          description: String(v.description || `Variation ${i + 1}`),
          imagePrompt: stringify(v.image_prompt),
          videoPrompt: videoContent,
          hookTitle: String(
            v.variation_hook_title || v.hook_title || parsed.hook_title || "",
          ).trim(),
          videoCaption: String(
            v.variation_video_caption || v.video_caption || "",
          ).trim(),
          tiktokProductName: String(v.tiktok_product_name || "")
            .substring(0, 30)
            .trim(),
          tiktokDescription: String(v.tiktok_description || "").trim(),
          tiktokCaption: String(v.tiktok_caption || "").trim(),
          tiktokHashtags: hashtags,
          overlayText: String(v.overlay_text || ""),
        };
      },
    );

    return NextResponse.json({
      type: "paired",
      platform,
      hookTitle: String(parsed.hook_title || ""),
      hookSubtitle: String(parsed.hook_subtitle || ""),
      variations,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const cause =
      e instanceof Error && e.cause
        ? ` | cause: ${JSON.stringify(e.cause, Object.getOwnPropertyNames(e.cause as object))}`
        : "";
    console.error(`[ai-generate] Failed: ${msg}${cause}`);
    return NextResponse.json(
      { error: `AI generation failed: ${msg}${cause}` },
      { status: 500 },
    );
  }
}
