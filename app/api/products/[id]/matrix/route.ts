import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText, type AIConfig } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

// Default real-scenario templates used by "parse" mode
const DEFAULT_SCENARIOS = [
  "Rushed morning before work/school",
  "Stuck waiting (traffic jam, queue, commute)",
  "Tired after a long day at work",
  "Browsing phone late at night before sleep",
  "Weekend at home with nothing planned",
];

// ─── Helpers ───

function splitToList(text: string): string[] {
  if (!text || !text.trim()) return [];
  // Split by newlines, bullets, numbered items, semicolons
  return text
    .split(/[\n;]|(?:\d+[.)]\s)|(?:[-•✅●]\s?)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function getNextCombo(
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
    // Phase 1: single USP per combo
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
    // Phase 1 exhausted — fall through to phase 2
  }

  // Phase 2: double USP combos
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

  return null; // All combos exhausted
}

function matrixStats(
  targets: string[],
  scenarios: string[],
  usps: string[],
  usedCombos: string[],
) {
  const phase1Total = targets.length * scenarios.length * usps.length;
  // C(n, 2) = n*(n-1)/2
  const uspPairs = (usps.length * (usps.length - 1)) / 2;
  const phase2Total = targets.length * scenarios.length * uspPairs;
  const total = phase1Total + phase2Total;
  const used = usedCombos.length;
  return { phase1Total, phase2Total, total, used, remaining: total - used };
}

// ─── GET: Return matrix + next combo ───

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;

  const matrix = await prisma.contentMatrix.findUnique({
    where: { productId },
  });

  if (!matrix) {
    return NextResponse.json({ exists: false, matrix: null, nextCombo: null });
  }

  const targets = JSON.parse(matrix.targets) as string[];
  const scenarios = JSON.parse(matrix.scenarios) as string[];
  const usps = JSON.parse(matrix.usps) as string[];
  const usedCombos = JSON.parse(matrix.usedCombos) as string[];

  const nextCombo = getNextCombo(
    targets,
    scenarios,
    usps,
    usedCombos,
    matrix.phase,
  );
  const stats = matrixStats(targets, scenarios, usps, usedCombos);

  return NextResponse.json({
    exists: true,
    matrix: {
      id: matrix.id,
      targets,
      scenarios,
      usps,
      usedCombos,
      phase: matrix.phase,
      mode: matrix.mode,
    },
    nextCombo,
    stats,
  });
}

// ─── POST: Generate matrix (Gemini or Parse mode) ───

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;
  const body = await req.json();
  const { mode = "gemini" } = body as { mode?: "gemini" | "parse" };

  // Fetch product
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let targets: string[];
  let scenarios: string[];
  let usps: string[];

  if (mode === "parse") {
    // ─── Parse mode: split existing fields, no AI cost ───
    usps = splitToList(product.usp);
    if (usps.length < 2) {
      // Try splitting description as fallback
      const descParts = splitToList(product.description);
      usps = [...usps, ...descParts].slice(0, 5);
    }
    if (usps.length < 2) {
      usps = [product.title, "Harga berbaloi"];
    }

    targets = splitToList(product.targetAudience);
    if (targets.length < 2) {
      targets = [
        "Sesiapa yang perlukan",
        "Pembeli bijak cari deal terbaik",
        "Gift buyer yang cari hadiah unik",
      ];
    }

    scenarios = DEFAULT_SCENARIOS.slice(0, 5);
  } else {
    // ─── AI mode: AI extracts structured T/RS/USP ───
    const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
    const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

    const geminiKeySetting = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } });
    const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    const geminiKey = geminiKeySetting?.value || "";
    const openaiKey = openaiKeySetting?.value || "";

    if (provider === "gemini" && !geminiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Set it in Settings." },
        { status: 400 },
      );
    }
    if (provider === "openai" && !openaiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Set it in Settings." },
        { status: 400 },
      );
    }

    const aiConfig: AIConfig = {
      provider,
      geminiApiKey: geminiKey,
      openaiApiKey: openaiKey,
      temperature: 1.0,
      responseFormat: "text",
    };

    const prompt = `You are a marketing strategist for TikTok affiliate videos. Analyze this product and extract the "Teknik Tiga Segi" (Three-Corner Technique) matrix.

Product: ${product.title}
Description: ${product.description}
Price: ${product.price}
USP: ${product.usp || "Not specified"}
Target Audience: ${product.targetAudience || "Not specified"}

Extract and return a JSON object with exactly these 3 arrays:
- "targets": 3-5 distinct target audience personas (specific, e.g. "Ibu bekerja yang sibuk" not just "Wanita")
- "scenarios": 3-5 real-life scenarios/pain points where this product is needed (specific moments, e.g. "Bangun pagi lambat, tak sempat siap" not just "Busy")
- "usps": 3-5 unique selling points/benefits of this product (specific, e.g. "Siap dalam 30 saat" not just "Fast")

Write in natural Bahasa Malaysia. Be specific and relatable for Malaysian TikTok audience.
Return ONLY the JSON object, no markdown, no explanation.`;

    try {
      let rawText: string;
      try {
        rawText = await generateText(prompt, aiConfig);
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : "AI error";
        return NextResponse.json({ error: `Matrix generation failed: ${msg}` }, { status: 500 });
      }

      // Clean and parse JSON
      const cleaned = rawText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      targets = Array.isArray(parsed.targets) ? parsed.targets.slice(0, 5) : [];
      scenarios = Array.isArray(parsed.scenarios)
        ? parsed.scenarios.slice(0, 5)
        : [];
      usps = Array.isArray(parsed.usps) ? parsed.usps.slice(0, 5) : [];

      // Validate minimum items
      if (targets.length < 2 || scenarios.length < 2 || usps.length < 2) {
        return NextResponse.json(
          {
            error:
              "AI returned insufficient data. Try again or use Parse mode.",
          },
          { status: 500 },
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json(
        { error: `Matrix generation failed: ${msg}` },
        { status: 500 },
      );
    }
  }

  // Upsert the matrix
  const matrix = await prisma.contentMatrix.upsert({
    where: { productId },
    create: {
      productId,
      targets: JSON.stringify(targets),
      scenarios: JSON.stringify(scenarios),
      usps: JSON.stringify(usps),
      usedCombos: "[]",
      phase: 1,
      mode,
    },
    update: {
      targets: JSON.stringify(targets),
      scenarios: JSON.stringify(scenarios),
      usps: JSON.stringify(usps),
      usedCombos: "[]",
      phase: 1,
      mode,
    },
  });

  const stats = matrixStats(targets, scenarios, usps, []);

  return NextResponse.json({
    matrix: {
      id: matrix.id,
      targets,
      scenarios,
      usps,
      usedCombos: [],
      phase: 1,
      mode,
    },
    stats,
  });
}

// ─── PATCH: Mark a combo as used ───

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;
  const body = await req.json();
  const { combo } = body as { combo: string };

  if (!combo) {
    return NextResponse.json({ error: "combo is required" }, { status: 400 });
  }

  const matrix = await prisma.contentMatrix.findUnique({
    where: { productId },
  });
  if (!matrix) {
    return NextResponse.json({ error: "Matrix not found" }, { status: 404 });
  }

  const usedCombos = JSON.parse(matrix.usedCombos) as string[];
  if (usedCombos.includes(combo)) {
    return NextResponse.json({ ok: true, alreadyUsed: true });
  }

  usedCombos.push(combo);

  // Check if we need to advance to phase 2
  const targets = JSON.parse(matrix.targets) as string[];
  const scenarios = JSON.parse(matrix.scenarios) as string[];
  const usps = JSON.parse(matrix.usps) as string[];
  const phase1Total = targets.length * scenarios.length * usps.length;
  const phase1Used = usedCombos.filter((c) => !c.includes("+")).length;
  const newPhase = phase1Used >= phase1Total ? 2 : matrix.phase;

  await prisma.contentMatrix.update({
    where: { productId },
    data: {
      usedCombos: JSON.stringify(usedCombos),
      phase: newPhase,
    },
  });

  const stats = matrixStats(targets, scenarios, usps, usedCombos);

  return NextResponse.json({ ok: true, phase: newPhase, stats });
}

// ─── DELETE: Reset matrix ───

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;

  await prisma.contentMatrix.deleteMany({ where: { productId } });

  return NextResponse.json({ ok: true });
}
