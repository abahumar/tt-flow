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
  const nextJob = await prisma.videoJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      product: true,
    },
  });

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
      const replacePlaceholders = (template: string) =>
        template
          .replace(/{title}/g, product.title)
          .replace(/{description}/g, product.description || product.title)
          .replace(/{price}/g, product.price || "");

      if (customPrompt.imagePrompt) {
        promptData.imagePrompt = replacePlaceholders(customPrompt.imagePrompt);
      }
      if (customPrompt.videoPrompt) {
        promptData.videoPrompt = replacePlaceholders(customPrompt.videoPrompt);
      }
    }
  }

  // Update status to generating_image, set videoType, record startedAt, and apply custom prompts
  const job = await prisma.videoJob.update({
    where: { id: nextJob.id },
    data: {
      status: "generating_image",
      videoType,
      startedAt: new Date().toISOString(),
      ...promptData,
    },
    include: { product: true },
  });

  return NextResponse.json(job);
}
