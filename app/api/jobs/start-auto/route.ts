import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateImagePrompt,
  generateVideoPrompt,
  VideoType,
} from "@/lib/prompt-templates";

const VALID_VIDEO_TYPES = [
  "fungsi_produk",
  "review",
  "unboxing",
  "problem_solution",
];

export async function POST(request: NextRequest) {
  let videoType = "fungsi_produk";
  let customPromptId: string | undefined;
  try {
    const body = await request.json();
    if (body.videoType && VALID_VIDEO_TYPES.includes(body.videoType)) {
      videoType = body.videoType;
    }
    if (body.customPromptId) {
      customPromptId = body.customPromptId;
    }
  } catch {
    // use default videoType if body is empty/invalid
  }

  // Use a transaction to atomically find + claim the next pending job.
  // Two concurrent callers cannot claim the same job.
  const job = await prisma.$transaction(async (tx) => {
    const pendingJobs = await tx.videoJob.findMany({
      where: { status: "pending" },
      orderBy: [{ sceneIndex: "asc" }, { createdAt: "asc" }],
      include: { product: true },
    });

    let nextJob = null;
    for (const j of pendingJobs) {
      if (j.masterJobId) {
        const masterJob = await tx.videoJob.findUnique({
          where: { id: j.masterJobId },
          select: { imageUrl: true, status: true },
        });
        if (!masterJob?.imageUrl) continue;
      }
      nextJob = j;
      break;
    }

    if (!nextJob) return null;

    const nextStatus = nextJob.imageUrl ? "generating_video" : "generating_image";

    return tx.videoJob.update({
      where: { id: nextJob.id },
      data: {
        status: nextStatus,
        videoType,
        startedAt: new Date().toISOString(),
      },
      include: { product: true },
    });
  });

  if (!job) {
    return NextResponse.json(
      { error: "No pending jobs in queue" },
      { status: 404 },
    );
  }

  // Apply custom prompt overrides (outside transaction — read-only after claim)
  if (customPromptId) {
    const customPrompt = await prisma.customPrompt.findUnique({
      where: { id: customPromptId },
    });
    const product = job.product;
    if (customPrompt && product) {
      const replacePlaceholders = (template: string) =>
        template
          .replace(/{title}/g, product.title)
          .replace(/{description}/g, product.description || product.title)
          .replace(/{price}/g, product.price || "");

      const promptData: { imagePrompt?: string; videoPrompt?: string } = {};
      if (customPrompt.imagePrompt) {
        promptData.imagePrompt = replacePlaceholders(customPrompt.imagePrompt);
      }
      if (customPrompt.videoPrompt) {
        promptData.videoPrompt = replacePlaceholders(customPrompt.videoPrompt);
      }
      if (Object.keys(promptData).length > 0) {
        await prisma.videoJob.update({
          where: { id: job.id },
          data: promptData,
        });
      }
    }
  }

  return NextResponse.json(job);
}
