import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
    const pendingJobs = await tx.videoJob.findMany({
      where: { status: "pending" },
      orderBy: [{ sceneIndex: "asc" }, { createdAt: "asc" }],
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
  } catch (err: any) {
    // Transaction failed (e.g. serialization conflict with concurrent claimer).
    // Return 409 so the caller can retry.
    if (err?.code === "P2034") {
      return NextResponse.json(
        { error: "Transaction conflict, retry" },
        { status: 409 },
      );
    }
    throw err;
  }

  if (!job) {
    return NextResponse.json(
      { error: "No pending jobs in queue" },
      { status: 404 },
    );
  }

  // Apply custom prompt overrides (outside transaction — job already claimed, no race)
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
