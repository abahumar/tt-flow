import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

const AVATAR_DNA: Record<string, string> = {
  woman_malay_hijab:
    "A friendly 25-year-old Malay woman with a warm smile, wearing a stylish light beige chiffon hijab and a modest pastel-colored modern Baju Kurung or blouse. Natural makeup look.",
  woman_malay_freehair:
    "A trendy 23-year-old Malay woman wearing a stylish hijab, with a casual modern outfit like a denim jacket over a white tee. Energetic and approachable vibe.",
  woman_malay_corporate:
    "A professional 30-year-old Malay woman with a confident posture, wearing a neat hijab and a dark blazer over a formal blouse. Sophisticated and authoritative look.",
  man_malay_casual:
    "A 26-year-old Malay man with a short, neat haircut and a slight stubble, wearing a plain oversized t-shirt or a flannel shirt. Relaxed and friendly boy-next-door vibe.",
  man_malay_corporate:
    "A sharp 32-year-old Malay man in a well-fitted white shirt and dark trousers, wearing a classic watch. Clean-shaven or with a very neat beard. Professional and successful appearance.",
  product_only:
    "No human model. Focus entirely on the product packaging, textures, and ingredients. High-end product photography style with aesthetic props and clean backgrounds.",
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
    };
  } else {
    const dbProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!dbProduct)
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    product = dbProduct;
  }

  const platformLogic =
    PLATFORM_LOGICS[platform]?.(duration) || PLATFORM_LOGICS.flow(duration);

  // --- DIALOG LOGIC ---
  const dialogLogic = `
    DIALOGUE STRUCTURE: Strictly follow [HOOK] + [CONTENT] + [CTA].
    ${includeDialog ? '1. MALAY ("dialog"): Soft Selling, Friendly. Must be a single string.' : ""}
    ${includeEnglishDialog ? '2. ENGLISH ("dialog_english"): Translated version. Must be a single string.' : ""}
    ${!includeDialog && !includeEnglishDialog ? "NO DIALOG REQUIRED." : ""}
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

  const avatarDna = AVATAR_DNA[avatarId] || AVATAR_DNA.woman_malay_hijab;

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

        STRUCTURE (AIDA - UGC REVIEW STYLE):
        1. SCENE 1 (ATTENTION/HOOK): Model holds/shows product prominently. Eye-catching pose.
        2. MIDDLE SCENES (INTEREST & DESIRE): Different product interactions — close-up, demo, turning product.
        3. LAST SCENE (ACTION/CTA): Model presents product directly to camera. Inviting expression.

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
    Marketing Angle: ${videoType}

    Output JSON: { "variations": [{ "description": "Title", "image_prompt": "...", ${outputFields}${dialogFields}, "tiktok_product_name": "Clean short product name for TikTok (max 30 chars, no special characters, no SKU codes)", "tiktok_description": "Compelling casual Malay product description with hashtags (max 200 chars)", "tiktok_caption": "Catchy casual Malay TikTok post caption (max 150 chars, no hashtags)", "tiktok_hashtags": ["fyp", "tiktokshop", "relevantTag1", "relevantTag2", "relevantTag3"] }] }
    Generate exactly ${variantCount} variations. All string fields must be plain strings (never objects).
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
          tiktokProductName: String(v.tiktok_product_name || "")
            .substring(0, 30)
            .trim(),
          tiktokDescription: String(v.tiktok_description || "").trim(),
          tiktokCaption: String(v.tiktok_caption || "").trim(),
          tiktokHashtags: hashtags,
        };
      },
    );

    return NextResponse.json({ type: "paired", platform, variations });
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
