import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateImagePrompt,
  generateVideoPrompt,
  VideoType,
} from "@/lib/prompt-templates";

export async function GET() {
  const jobs = await prisma.videoJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          shopName: true,
          images: true,
        },
      },
    },
  });
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, videoType = "fungsi_produk", customPromptId } = body;

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let imagePrompt: string;
  let videoPrompt: string;

  // If a custom prompt is selected, use it (with variable substitution)
  if (customPromptId) {
    const customPrompt = await prisma.customPrompt.findUnique({
      where: { id: customPromptId },
    });
    if (customPrompt) {
      const replacePlaceholders = (template: string) =>
        template
          .replace(/{title}/g, product.title)
          .replace(/{description}/g, product.description || product.title)
          .replace(/{price}/g, product.price || "");

      imagePrompt = customPrompt.imagePrompt
        ? replacePlaceholders(customPrompt.imagePrompt)
        : generateImagePrompt({
            title: product.title,
            description: product.description,
            price: product.price,
            videoType: videoType as VideoType,
          });
      videoPrompt = customPrompt.videoPrompt
        ? replacePlaceholders(customPrompt.videoPrompt)
        : generateVideoPrompt({
            title: product.title,
            description: product.description,
            price: product.price,
            videoType: videoType as VideoType,
          });
    } else {
      // Custom prompt not found, fall back to defaults
      imagePrompt = generateImagePrompt({
        title: product.title,
        description: product.description,
        price: product.price,
        videoType: videoType as VideoType,
      });
      videoPrompt = generateVideoPrompt({
        title: product.title,
        description: product.description,
        price: product.price,
        videoType: videoType as VideoType,
      });
    }
  } else {
    imagePrompt = generateImagePrompt({
      title: product.title,
      description: product.description,
      price: product.price,
      videoType: videoType as VideoType,
    });
    videoPrompt = generateVideoPrompt({
      title: product.title,
      description: product.description,
      price: product.price,
      videoType: videoType as VideoType,
    });
  }

  const job = await prisma.videoJob.create({
    data: {
      productId,
      videoType,
      imagePrompt,
      videoPrompt,
      status: "pending",
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          shopName: true,
          images: true,
        },
      },
    },
  });

  return NextResponse.json(job, { status: 201 });
}

export async function DELETE() {
  const { count } = await prisma.videoJob.deleteMany({});
  return NextResponse.json({ deleted: count });
}
