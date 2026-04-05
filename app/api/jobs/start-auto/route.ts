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

// Signal the Chrome extension to start processing the queue
// The extension polls this endpoint or the jobs list to pick up work
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

  // Find the next pending job and mark it as ready for the extension
  // Sort by sceneIndex so Scene 0 (master) processes before Scene 1, 2...
  const pendingJobs = await prisma.videoJob.findMany({
    where: { status: "pending" },
    orderBy: [{ sceneIndex: "asc" }, { createdAt: "asc" }],
    include: {
      product: true,
    },
  });

  // Find the first job that's ready to process
  // For grouped scenes (sceneIndex > 0), the master scene must have an imageUrl
  let nextJob = null;
  for (const job of pendingJobs) {
    if (job.masterJobId) {
      // This is a dependent scene — check if master has generated its image
      const masterJob = await prisma.videoJob.findUnique({
        where: { id: job.masterJobId },
        select: { imageUrl: true, status: true },
      });
      if (!masterJob?.imageUrl) {
        // Master hasn't generated image yet — skip this job for now
        continue;
      }
    }
    nextJob = job;
    break;
  }

  if (!nextJob) {
    return NextResponse.json(
      { error: "No pending jobs in queue" },
      { status: 404 },
    );
  }

  // Build prompt overrides if a custom prompt is selected
  let promptData: { imagePrompt?: string; videoPrompt?: string } = {};
  if (customPromptId) {
    const customPrompt = await prisma.customPrompt.findUnique({
      where: { id: customPromptId },
    });
    if (customPrompt) {
      const product = nextJob.product;
      if (product) {
        const replacePlaceholders = (template: string) =>
          template
            .replace(/{title}/g, product.title)
            .replace(/{description}/g, product.description || product.title)
            .replace(/{price}/g, product.price || "");

        if (customPrompt.imagePrompt) {
          promptData.imagePrompt = replacePlaceholders(
            customPrompt.imagePrompt,
          );
        }
        if (customPrompt.videoPrompt) {
          promptData.videoPrompt = replacePlaceholders(
            customPrompt.videoPrompt,
          );
        }
      }
    }
  }

  // If the job already has an image (e.g. created from gallery), skip to video generation
  const nextStatus = nextJob.imageUrl ? "generating_video" : "generating_image";

  // Update status, set videoType, record startedAt, and apply custom prompts
  const job = await prisma.videoJob.update({
    where: { id: nextJob.id },
    data: {
      status: nextStatus,
      videoType,
      startedAt: new Date().toISOString(),
      ...promptData,
    },
    include: { product: true },
  });

  return NextResponse.json(job);
}
