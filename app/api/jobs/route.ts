import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateText, type AIConfig } from "@/lib/ai-client";
import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  generateImagePrompt,
  generateVideoPrompt,
  generateTikTokCaption,
  generateTikTokHashtags,
  generateTikTokProductName,
  generateTikTokDescription,
  VideoType,
} from "@/lib/prompt-templates";

const IMAGE_DIR = "/data/images/generated";

export async function GET() {
  const jobs = await prisma.videoJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          url: true,
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
  const {
    productId,
    videoType = "fungsi_produk",
    customPromptId,
    userImagePrompt,
    userVideoPrompt,
    tiktokProductName: userProductName,
    tiktokDescription: userDescription,
    tiktokCaption: userCaption,
    tiktokHashtags: userHashtags,
    imageOnly = false,
    imagePrompt: directImagePrompt,
    referenceImage,
    referenceImages: refImagesInput,
    templateId,
    groupId,
    sceneIndex,
    masterJobId,
    scenePrompts,
    galleryImageId,
    videoPrompt: userVideoPromptForGallery,
    overlayConfig,
  } = body;

  // Create video job from a gallery image — skip image generation
  if (galleryImageId) {
    const galleryImage = await prisma.galleryImage.findUnique({
      where: { id: galleryImageId },
    });
    if (!galleryImage) {
      return NextResponse.json(
        { error: "Gallery image not found" },
        { status: 404 },
      );
    }

    // Copy gallery image to new job ID filename
    const ext = galleryImage.filename.split(".").pop() || "png";
    const job = await prisma.videoJob.create({
      data: {
        imagePrompt: galleryImage.prompt,
        videoPrompt: userVideoPromptForGallery || "",
        overlayConfig: overlayConfig || "",
        status: "pending",
      },
    });

    const srcPath = join(IMAGE_DIR, galleryImage.filename);
    const destFilename = `${job.id}.${ext}`;
    const destPath = join(IMAGE_DIR, destFilename);

    if (!existsSync(IMAGE_DIR)) {
      await mkdir(IMAGE_DIR, { recursive: true });
    }

    if (existsSync(srcPath)) {
      await copyFile(srcPath, destPath);
    }

    const imageServeUrl = `http://localhost:3000/api/jobs/${job.id}/image`;
    const updatedJob = await prisma.videoJob.update({
      where: { id: job.id },
      data: { imageUrl: imageServeUrl },
    });

    return NextResponse.json(updatedJob, { status: 201 });
  }

  // For imageOnly jobs, no product needed
  if (imageOnly) {
    const job = await prisma.videoJob.create({
      data: {
        imageOnly: true,
        imagePrompt: directImagePrompt || userImagePrompt || "",
        referenceImage: referenceImage || "",
        status: "pending",
      },
    });
    return NextResponse.json(job);
  }

  if (!productId && !userImagePrompt) {
    return NextResponse.json(
      { error: "productId or prompts required" },
      { status: 400 },
    );
  }

  let product: {
    title: string;
    description: string | null;
    price: string | null;
    shopName?: string | null;
    url?: string | null;
  } | null = null;
  if (productId) {
    product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
  }

  // Safe product info for prompt generation (works with or without product)
  const pTitle = product?.title || "";
  const pDesc = product?.description || "";
  const pPrice = product?.price || "";
  const pShopName =
    (product as { shopName?: string | null } | null)?.shopName || "";

  let imagePrompt: string;
  let videoPrompt: string;

  const replacePlaceholders = (template: string) =>
    template
      .replace(/{title}/g, pTitle)
      .replace(/{description}/g, pDesc || pTitle)
      .replace(/{price}/g, pPrice || "");

  // If user-defined prompts are provided, use them directly
  if (userImagePrompt || userVideoPrompt) {
    imagePrompt = userImagePrompt
      ? replacePlaceholders(userImagePrompt)
      : generateImagePrompt({
          title: pTitle,
          description: pDesc,
          price: pPrice,
          videoType: videoType as VideoType,
        });
    videoPrompt = userVideoPrompt
      ? replacePlaceholders(userVideoPrompt)
      : generateVideoPrompt({
          title: pTitle,
          description: pDesc,
          price: pPrice,
          videoType: videoType as VideoType,
        });
  } else if (customPromptId) {
    const customPrompt = await prisma.customPrompt.findUnique({
      where: { id: customPromptId },
    });
    if (customPrompt) {
      imagePrompt = customPrompt.imagePrompt
        ? replacePlaceholders(customPrompt.imagePrompt)
        : generateImagePrompt({
            title: pTitle,
            description: pDesc,
            price: pPrice,
            videoType: videoType as VideoType,
          });
      videoPrompt = customPrompt.videoPrompt
        ? replacePlaceholders(customPrompt.videoPrompt)
        : generateVideoPrompt({
            title: pTitle,
            description: pDesc,
            price: pPrice,
            videoType: videoType as VideoType,
          });
    } else {
      // Custom prompt not found, fall back to defaults
      imagePrompt = generateImagePrompt({
        title: pTitle,
        description: pDesc,
        price: pPrice,
        videoType: videoType as VideoType,
      });
      videoPrompt = generateVideoPrompt({
        title: pTitle,
        description: pDesc,
        price: pPrice,
        videoType: videoType as VideoType,
      });
    }
  } else {
    imagePrompt = generateImagePrompt({
      title: pTitle,
      description: pDesc,
      price: pPrice,
      videoType: videoType as VideoType,
    });
    videoPrompt = generateVideoPrompt({
      title: pTitle,
      description: pDesc,
      price: pPrice,
      videoType: videoType as VideoType,
    });
  }

  let tiktokCaption =
    userCaption && userCaption.trim()
      ? userCaption.trim()
      : generateTikTokCaption({
          title: pTitle,
          description: pDesc,
          price: pPrice,
          videoType: videoType as VideoType,
        });
  const hashtags =
    userHashtags && Array.isArray(userHashtags) && userHashtags.length > 0
      ? userHashtags.map((h: string) => String(h).replace(/^#/, ""))
      : generateTikTokHashtags({
          title: pTitle,
          shopName: pShopName,
          videoType: videoType as VideoType,
        });
  const tiktokHashtags = JSON.stringify(hashtags);

  // Use user-provided values if available (from Tools page), otherwise generate
  let tiktokProductName =
    userProductName && userProductName.trim()
      ? userProductName.trim()
      : generateTikTokProductName(pTitle);
  let tiktokDescription =
    userDescription && userDescription.trim()
      ? userDescription.trim()
      : generateTikTokDescription({
          title: pTitle,
          price: pPrice,
          videoType: videoType as VideoType,
          hashtags,
        });

  // Try to generate better product name + description via Gemini (only if not user-provided)
  if (
    !(userProductName && userProductName.trim()) ||
    !(userDescription && userDescription.trim())
  ) {
    try {
      const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
      const jobProvider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";
      const geminiKeySetting = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } });
      const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
      const jobGeminiKey = geminiKeySetting?.value || "";
      const jobOpenaiKey = openaiKeySetting?.value || "";
      const hasAiKey = jobProvider === "gemini" ? !!jobGeminiKey : !!jobOpenaiKey;
      if (hasAiKey) {
        const jobAiConfig: AIConfig = { provider: jobProvider, geminiApiKey: jobGeminiKey, openaiApiKey: jobOpenaiKey };
        const aiResult = await generateWithAI(
          jobAiConfig,
          pTitle,
          pDesc,
          pPrice,
          videoType as string,
          hashtags,
        );
        if (
          !(userProductName && userProductName.trim()) &&
          aiResult.productName
        )
          tiktokProductName = aiResult.productName;
        if (
          !(userDescription && userDescription.trim()) &&
          aiResult.description
        )
          tiktokDescription = aiResult.description;
      }
    } catch (err) {
      console.warn(
        "[jobs] AI generation failed, using template defaults:",
        err,
      );
    }
  }

  // Build referenceImages JSON array
  const referenceImages = Array.isArray(refImagesInput)
    ? JSON.stringify(refImagesInput)
    : "[]";

  const job = await prisma.videoJob.create({
    data: {
      productId: productId || undefined,
      videoType,
      imagePrompt,
      videoPrompt,
      tiktokCaption,
      tiktokHashtags,
      tiktokProductName,
      tiktokDescription,
      referenceImages,
      templateId: templateId || "",
      groupId: groupId || "",
      sceneIndex: typeof sceneIndex === "number" ? sceneIndex : 0,
      masterJobId: masterJobId || "",
      scenePrompts: scenePrompts || "",
      overlayConfig: overlayConfig || "",
      status: "pending",
    },
    include: {
      product: {
        select: {
          id: true,
          url: true,
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

// ---- AI-powered product name + description generation ----
async function generateWithAI(
  config: AIConfig,
  title: string,
  description: string,
  price: string,
  videoType: string,
  hashtags: string[],
): Promise<{ productName: string; description: string }> {
  const hashtagStr = hashtags.map((h) => `#${h}`).join(" ");

  const prompt = `You are a TikTok product marketing expert for the Malaysian market.

Given this product:
- Original Title: ${title}
- Description: ${description || "N/A"}
- Price: ${price || "N/A"}
- Marketing Angle: ${videoType}

Generate:
1. "productName": A clean, catchy product name for TikTok (max 30 characters). Remove SKU codes, brackets, special characters. Make it short, appealing, and easy to read. Use Malay or English.
2. "description": A compelling TikTok product description (max 200 characters). Include the product benefit, price if available, and a call to action. Write in casual Malay. Append these hashtags at the end: ${hashtagStr}

Output JSON only: { "productName": "...", "description": "..." }`;

  const rawText = await generateText(prompt, { ...config, responseFormat: "json" });
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Enforce max length for product name
  let productName = String(parsed.productName || "").trim();
  if (productName.length > 30) {
    productName = productName
      .substring(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return {
    productName,
    description: String(parsed.description || "").trim(),
  };
}
