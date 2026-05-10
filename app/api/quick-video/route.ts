import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_PRESET = {
  avatar: "woman_malay_hijab",
  genre: "softsell",
  format: "short",
  sceneCount: 4,
  includeDialog: true,
  enableHook: true,
  enableOverlay: true,
  hookBgColor: "E91E63",
  hookTextColor: "FFFFFF",
  hookFontSize: 48,
  overlayFontSize: 28,
  temperature: 1.5,
  autoQueue: false,
  hookStyle: "background" as "background" | "stroke",
  hookPosition: "top" as "top" | "center" | "bottom",
};

const FORMAT_SCENES: Record<string, number> = {
  mini: 2,
  super_short: 3,
  short: 4,
  complete: 5,
};

// Variation angles — randomly picked per generation to steer AI in different creative directions
const VARIATION_ANGLES = [
  "humor — use a funny, relatable angle that makes the audience laugh and share",
  "emotion — focus on pain points, feelings, and emotional transformation",
  "urgency — create FOMO, scarcity, and 'buy now before it's gone' energy",
  "curiosity — make the audience think 'wait, what?' and watch till the end",
  "testimonial — frame it as a real user review, authentic first-person experience",
  "before-after — dramatic transformation showing life without vs with the product",
  "lifestyle — aspirational day-in-my-life content where product fits naturally",
  "comparison — subtle comparison with alternatives showing why this is better",
  "challenge — dare or test-style content, e.g. 'korang berani try tak?'",
  "trending — ride a current TikTok trend format and weave the product in",
];

// Safe seeds for mini format — excludes curiosity/testimonial/trending/challenge
// which produce teaser/mystery/first-person content incompatible with Hook→USP1→USP2→CTA structure
const MINI_VARIATION_ANGLES = [
  "emotion — focus on pain points, feelings, and emotional transformation",
  "urgency — create FOMO, scarcity, and 'buy now before it's gone' energy",
  "before-after — dramatic transformation showing life without vs with the product",
  "lifestyle — aspirational day-in-my-life content where product fits naturally",
  "comparison — subtle comparison with alternatives showing why this is better",
];

const HOOK_STYLES = ["controversial", "curiosity", "story_based"] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function findNextCombo(
  targets: string[],
  scenarios: string[],
  usps: string[],
  usedCombos: string[],
  phase: number,
): {
  combo: string;
  target: string;
  scenario: string;
  usp: string;
  phase: number;
} | null {
  const used = new Set(usedCombos);

  if (phase === 1) {
    for (let t = 0; t < targets.length; t++) {
      for (let rs = 0; rs < scenarios.length; rs++) {
        for (let u = 0; u < usps.length; u++) {
          const key = `T${t}-RS${rs}-USP${u}`;
          if (!used.has(key)) {
            return {
              combo: key,
              target: targets[t],
              scenario: scenarios[rs],
              usp: usps[u],
              phase: 1,
            };
          }
        }
      }
    }
  }

  // Phase 2: double USP
  for (let t = 0; t < targets.length; t++) {
    for (let rs = 0; rs < scenarios.length; rs++) {
      for (let u1 = 0; u1 < usps.length; u1++) {
        for (let u2 = u1 + 1; u2 < usps.length; u2++) {
          const key = `T${t}-RS${rs}-USP${u1}+USP${u2}`;
          if (!used.has(key)) {
            return {
              combo: key,
              target: targets[t],
              scenario: scenarios[rs],
              usp: `${usps[u1]} + ${usps[u2]}`,
              phase: 2,
            };
          }
        }
      }
    }
  }

  return null;
}

// ─── Helper: build overlay config & create job ───

async function createVideoJob(
  baseUrl: string,
  productId: string,
  preset: typeof DEFAULT_PRESET,
  hookTitle: string,
  tiktokCaption: string,
  variations: {
    imagePrompt?: string;
    videoPrompt?: string;
    tiktokProductName?: string;
    tiktokDescription?: string;
    tiktokCaption?: string;
    tiktokHashtags?: string[];
    overlayText?: string;
    overlayPosition?: string;
  }[],
  referenceImages: string[],
  customProductImage = "",
) {
  const allScenePrompts = variations.map((v) => ({
    imagePrompt: v.imagePrompt || "",
    videoPrompt: v.videoPrompt || "",
  }));

  const overlays =
    preset.enableOverlay !== false
      ? variations.map((v) =>
          v.overlayText
            ? { text: v.overlayText, position: v.overlayPosition || "bottom" }
            : null,
        )
      : variations.map(() => null);

  const overlayConfig = JSON.stringify({
    hookTitle: preset.enableHook ? hookTitle : "",
    hookSubtitle: "",
    hookBgColor: preset.hookBgColor,
    hookTextColor: preset.hookTextColor,
    hookFontSize: preset.hookFontSize,
    overlays,
    overlayFontSize: preset.overlayFontSize,
    hookStyle: preset.hookStyle ?? "background",
    hookPosition: preset.hookPosition ?? "top",
  });

  const scene1 = variations[0];

  const jobRes = await fetch(`${baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId,
      videoType: preset.genre,
      userImagePrompt: scene1.imagePrompt || "",
      userVideoPrompt: scene1.videoPrompt || "",
      tiktokProductName: scene1.tiktokProductName || "",
      tiktokDescription: scene1.tiktokDescription || "",
      tiktokCaption: tiktokCaption || scene1.tiktokCaption || "",
      tiktokHashtags: scene1.tiktokHashtags || [],
      referenceImage: customProductImage || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      scenePrompts: JSON.stringify(allScenePrompts),
      overlayConfig,
    }),
  });

  return jobRes;
}

// ─── Helper: mark matrix combo as used ───

async function markMatrixComboUsed(productId: string, matrixCombo: string) {
  const matrix = await prisma.contentMatrix.findUnique({
    where: { productId },
  });
  if (!matrix) return;

  const usedCombos = JSON.parse(matrix.usedCombos) as string[];
  usedCombos.push(matrixCombo);
  const targets = JSON.parse(matrix.targets) as string[];
  const scenarios = JSON.parse(matrix.scenarios) as string[];
  const usps = JSON.parse(matrix.usps) as string[];
  const phase1Total = targets.length * scenarios.length * usps.length;
  const phase1Used = usedCombos.filter((c) => !c.includes("+")).length;
  await prisma.contentMatrix.update({
    where: { productId },
    data: {
      usedCombos: JSON.stringify(usedCombos),
      phase: phase1Used >= phase1Total ? 2 : matrix.phase,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    productId,
    customImage = "",
    modelImage = "",
    preview = false,
    editedContent,
    specialInstruction: bodySpecialInstruction = "",
    forceAutoQueue = false,
  } = body;

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 },
    );
  }

  // 1. Fetch product
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // 2. Load preset from settings (or use defaults)
  const presetSetting = await prisma.setting.findUnique({
    where: { key: "quick_video_preset" },
  });
  let preset = { ...DEFAULT_PRESET };
  if (presetSetting) {
    try {
      preset = { ...DEFAULT_PRESET, ...JSON.parse(presetSetting.value) };
    } catch {
      // use defaults
    }
  }

  // Determine avatar: product-level > preset > default
  const avatarId = product.avatarId || preset.avatar || DEFAULT_PRESET.avatar;

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Build reference images array (model/avatar refs only — custom product image goes separately)
  const referenceImages: string[] = [];
  if (modelImage) referenceImages.push(modelImage);

  // Auto-inject avatar's custom image if no explicit modelImage provided
  let hasCustomAvatarImage = false;
  let effectiveModelImage = modelImage || "";
  if (!modelImage && avatarId !== "product_only" && avatarId !== "hands_only") {
    const avatarImgSetting = await prisma.setting.findUnique({
      where: { key: "avatar_images" },
    });
    if (avatarImgSetting?.value) {
      try {
        const avatarImagesMap = JSON.parse(avatarImgSetting.value) as Record<
          string,
          string
        >;
        if (avatarImagesMap[avatarId]) {
          referenceImages.push(avatarImagesMap[avatarId]);
          effectiveModelImage = avatarImagesMap[avatarId];
          hasCustomAvatarImage = true;
        }
      } catch {
        // ignore parse error
      }
    }
  }

  // Resolve product image: custom uploaded takes priority, then scraped catalog URL
  let productImages: string[] = [];
  try {
    productImages = JSON.parse(product.images || "[]");
  } catch {}
  const effectiveProductImage = customImage || productImages[0] || "";

  // ─── CONFIRM MODE: editedContent provided → skip AI, create job from edited data ───
  if (editedContent) {
    const {
      hookTitle,
      tiktokCaption,
      variations,
      matrixCombo,
      matrixPhase,
      variationAngle,
      hookStyle,
    } = editedContent;

    if (!Array.isArray(variations) || variations.length === 0) {
      return NextResponse.json(
        { error: "editedContent.variations is required" },
        { status: 400 },
      );
    }

    try {
      const jobRes = await createVideoJob(
        baseUrl,
        productId,
        preset,
        hookTitle || "",
        tiktokCaption || "",
        variations,
        referenceImages,
        effectiveProductImage,
      );

      const jobData = await jobRes.json();
      if (!jobRes.ok) {
        return NextResponse.json(
          { error: jobData.error || "Job creation failed" },
          { status: 500 },
        );
      }

      // Mark matrix combo as used
      if (matrixCombo) {
        await markMatrixComboUsed(productId, matrixCombo);
      }

      return NextResponse.json({
        jobId: jobData.id,
        scenes: variations.length,
        hookTitle: hookTitle || "",
        format: preset.format,
        genre: preset.genre,
        avatar: avatarId,
        variationAngle: variationAngle || null,
        hookStyle: hookStyle || null,
        matrixCombo: matrixCombo || null,
        matrixPhase: matrixPhase || null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json(
        { error: `Job creation failed: ${msg}` },
        { status: 500 },
      );
    }
  }

  // ─── GENERATE MODE: call AI, then either preview or create job ───

  // 3. Check AI provider key is configured
  const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
  const provider = providerSetting?.value === "openai" ? "openai" : "gemini";
  const geminiKeySetting = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } });
  const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
  const apiKey = geminiKeySetting?.value || "";
  const openaiApiKey = openaiKeySetting?.value || "";
  if (provider === "gemini" && !apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Set it in Settings." },
      { status: 400 },
    );
  }
  if (provider === "openai" && !openaiApiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set it in Settings." },
      { status: 400 },
    );
  }

  const sceneCount =
    FORMAT_SCENES[preset.format] ||
    preset.sceneCount ||
    DEFAULT_PRESET.sceneCount;

  let aiData: {
    variations?: {
      imagePrompt?: string;
      videoPrompt?: string;
      tiktokProductName?: string;
      tiktokDescription?: string;
      tiktokCaption?: string;
      tiktokHashtags?: string[];
      overlayText?: string;
      overlayPosition?: string;
    }[];
    hookTitle?: string;
    hookSubtitle?: string;
    error?: string;
  };

  // Pick variation angle — use Tiga Segi matrix if available, else random
  let variationSeed: string;
  let hookStyleOverride: string;
  let matrixCombo: string | null = null;
  let matrixPhase: number | null = null;

  const matrix = await prisma.contentMatrix.findUnique({
    where: { productId },
  });

  if (matrix) {
    const targets = JSON.parse(matrix.targets) as string[];
    const scenarios = JSON.parse(matrix.scenarios) as string[];
    const usps = JSON.parse(matrix.usps) as string[];
    const usedCombos = JSON.parse(matrix.usedCombos) as string[];

    // Find next unused combo
    const next = findNextCombo(
      targets,
      scenarios,
      usps,
      usedCombos,
      matrix.phase,
    );

    if (next) {
      variationSeed = `Target Audience: ${next.target}. Real Scenario/Pain Point: ${next.scenario}. Focus USP: ${next.usp}`;
      hookStyleOverride = pickRandom(HOOK_STYLES);
      matrixCombo = next.combo;
      matrixPhase = next.phase;
    } else {
      // All combos exhausted — fallback to random
      variationSeed = pickRandom(preset.format === "mini" ? MINI_VARIATION_ANGLES : VARIATION_ANGLES);
      hookStyleOverride = pickRandom(HOOK_STYLES);
    }
  } else {
    variationSeed = pickRandom(preset.format === "mini" ? MINI_VARIATION_ANGLES : VARIATION_ANGLES);
    hookStyleOverride = pickRandom(HOOK_STYLES);
  }

  try {
    const aiRes = await fetch(`${baseUrl}/api/prompts/ai-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        platform: "flow",
        mode: "storyline",
        videoType: preset.genre,
        apiKey,
        openaiApiKey,
        avatarId,
        consistentMode: true,
        sceneCount,
        includeDialog: preset.includeDialog,
        videoFormat: preset.format,
        // Send uploaded images to Gemini for AI analysis
        productImage: customImage || null,
        modelImage: effectiveModelImage || null,
        // When avatar has custom uploaded image, tell AI to use reference image
        ...(hasCustomAvatarImage
          ? {
              modelDesc:
                "Use the uploaded model reference image exactly as shown.",
            }
          : {}),
        // Quick Video variation params
        variationSeed,
        hookStyleOverride,
        temperature: preset.format === "mini" ? 0.7 : (preset.temperature ?? 1.5),
        // Mini format USPs — parse list, pick 2 randomly as strict schema fields
        ...(preset.format === "mini" && product.miniUsps
          ? (() => {
              const lines = product.miniUsps
                .split("\n")
                .map((l: string) => l.trim())
                .filter(Boolean);
              if (lines.length >= 2) {
                const shuffled = [...lines].sort(() => Math.random() - 0.5);
                return { miniUsp1: shuffled[0], miniUsp2: shuffled[1] };
              }
              if (lines.length === 1) return { miniUsp1: lines[0], miniUsp2: "" };
              return {};
            })()
          : {}),
        // Non-mini format USPs — inject as soft context hint
        ...(preset.format !== "mini" && product.miniUsps
          ? (() => {
              const lines = product.miniUsps
                .split("\n")
                .map((l: string) => l.trim())
                .filter(Boolean);
              if (lines.length === 0) return {};
              const shuffled = [...lines].sort(() => Math.random() - 0.5);
              const picked = shuffled.slice(0, lines.length >= 3 ? 3 : lines.length);
              return {
                uspHint: `Highlight these product benefits across the scenes: ${picked.join("; ")}`,
              };
            })()
          : {}),
        // Mini-format dialog schema instruction (prompt-only, never appended to image_prompt)
        ...(preset.format === "mini"
          ? {
              specialInstruction:
                "Follow the output schema field names — they define the content. " +
                "dialog_hook = audience pain-point hook sentence. dialog_usp1 = specific product benefit 1 sentence. " +
                "dialog_usp2 = specific product benefit 2 sentence (declarative, no question mark). dialog_cta = CTA sentence (Jom/Grab/Order now). " +
                "Each field = ONE sentence, max 10 words.",
            }
          : {}),
        // User visual instruction — appended verbatim to every image_prompt
        ...(bodySpecialInstruction ? { visualInstruction: bodySpecialInstruction } : {}),
      }),
    });

    aiData = await aiRes.json();
    if (!aiRes.ok) {
      return NextResponse.json(
        { error: aiData.error || "AI generation failed" },
        { status: 500 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `AI generation failed: ${msg}` },
      { status: 500 },
    );
  }

  const variations = aiData.variations || [];
  if (variations.length === 0) {
    return NextResponse.json(
      { error: "AI returned no scenes" },
      { status: 500 },
    );
  }

  const variationAngle = matrixCombo
    ? `[Tiga Segi P${matrixPhase}] ${matrixCombo}`
    : variationSeed.split("—")[0].trim();

  // ─── PREVIEW MODE: return AI content for editing, don't create job yet ───
  if (preview && !forceAutoQueue) {
    return NextResponse.json({
      preview: true,
      hookTitle: aiData.hookTitle || "",
      tiktokCaption: variations[0]?.tiktokCaption || "",
      variations,
      format: preset.format,
      genre: preset.genre,
      avatar: avatarId,
      variationAngle,
      hookStyle: hookStyleOverride,
      matrixCombo: matrixCombo || null,
      matrixPhase: matrixPhase || null,
    });
  }

  // ─── DIRECT MODE (legacy): create job immediately ───

  try {
    const jobRes = await createVideoJob(
      baseUrl,
      productId,
      preset,
      aiData.hookTitle || "",
      variations[0]?.tiktokCaption || "",
      variations,
      referenceImages,
      effectiveProductImage,
    );

    const jobData = await jobRes.json();
    if (!jobRes.ok) {
      return NextResponse.json(
        { error: jobData.error || "Job creation failed" },
        { status: 500 },
      );
    }

    // Mark matrix combo as used
    if (matrixCombo) {
      await markMatrixComboUsed(productId, matrixCombo);
    }

    return NextResponse.json({
      jobId: jobData.id,
      scenes: variations.length,
      hookTitle: aiData.hookTitle || "",
      format: preset.format,
      genre: preset.genre,
      avatar: avatarId,
      variationAngle,
      hookStyle: hookStyleOverride,
      matrixCombo: matrixCombo || null,
      matrixPhase: matrixPhase || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Job creation failed: ${msg}` },
      { status: 500 },
    );
  }
}
