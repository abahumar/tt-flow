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
};

const FORMAT_SCENES: Record<string, number> = {
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
  "challenge — 'I tried this for 7 days' or dare-style content",
  "trending — ride a current TikTok trend format and weave the product in",
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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, customImage = "", modelImage = "" } = body;

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

  // 3. Load Gemini API key
  const apiKeySetting = await prisma.setting.findUnique({
    where: { key: "gemini_api_key" },
  });
  const apiKey = apiKeySetting?.value;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Set it in Settings." },
      { status: 400 },
    );
  }

  // Determine avatar: product-level > preset > default
  const avatarId = product.avatarId || preset.avatar || DEFAULT_PRESET.avatar;
  const sceneCount =
    FORMAT_SCENES[preset.format] ||
    preset.sceneCount ||
    DEFAULT_PRESET.sceneCount;

  // 4. Call AI generation (internal fetch to our own endpoint)
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

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
      variationSeed = pickRandom(VARIATION_ANGLES);
      hookStyleOverride = pickRandom(HOOK_STYLES);
    }
  } else {
    variationSeed = pickRandom(VARIATION_ANGLES);
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
        avatarId,
        consistentMode: true,
        sceneCount,
        includeDialog: preset.includeDialog,
        videoFormat: preset.format,
        // Quick Video variation params
        variationSeed,
        hookStyleOverride,
        temperature: preset.temperature ?? 1.5,
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

  // 5. Build scene prompts & overlay config (mirrors Video Studio handleQueueSelected)
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
    hookTitle: preset.enableHook ? aiData.hookTitle || "" : "",
    hookSubtitle: "",
    hookBgColor: preset.hookBgColor,
    hookTextColor: preset.hookTextColor,
    hookFontSize: preset.hookFontSize,
    overlays,
    overlayFontSize: preset.overlayFontSize,
  });

  // Build reference images array (custom product image + model image)
  const referenceImages: string[] = [];
  if (customImage) referenceImages.push(customImage);
  if (modelImage) referenceImages.push(modelImage);

  // 6. Create the VideoJob
  const scene1 = variations[0];

  try {
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
        tiktokCaption: scene1.tiktokCaption || "",
        tiktokHashtags: scene1.tiktokHashtags || [],
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        scenePrompts: JSON.stringify(allScenePrompts),
        overlayConfig,
      }),
    });

    const jobData = await jobRes.json();
    if (!jobRes.ok) {
      return NextResponse.json(
        { error: jobData.error || "Job creation failed" },
        { status: 500 },
      );
    }

    // Mark matrix combo as used
    if (matrixCombo) {
      const usedCombos = JSON.parse(matrix!.usedCombos) as string[];
      usedCombos.push(matrixCombo);
      const targets = JSON.parse(matrix!.targets) as string[];
      const scenarios = JSON.parse(matrix!.scenarios) as string[];
      const usps = JSON.parse(matrix!.usps) as string[];
      const phase1Total = targets.length * scenarios.length * usps.length;
      const phase1Used = usedCombos.filter((c) => !c.includes("+")).length;
      await prisma.contentMatrix.update({
        where: { productId },
        data: {
          usedCombos: JSON.stringify(usedCombos),
          phase: phase1Used >= phase1Total ? 2 : matrix!.phase,
        },
      });
    }

    return NextResponse.json({
      jobId: jobData.id,
      scenes: variations.length,
      hookTitle: aiData.hookTitle || "",
      format: preset.format,
      genre: preset.genre,
      avatar: avatarId,
      variationAngle: matrixCombo
        ? `[Tiga Segi P${matrixPhase}] ${matrixCombo}`
        : variationSeed.split("—")[0].trim(),
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
