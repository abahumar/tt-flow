import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateImagePrompt,
  generateVideoPrompt,
  generateTikTokCaption,
  generateTikTokHashtags,
  generateTikTokProductName,
  generateTikTokDescription,
  VideoType,
} from "@/lib/prompt-templates";

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
  } = body;

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

  const replacePlaceholders = (template: string) =>
    template
      .replace(/{title}/g, product.title)
      .replace(/{description}/g, product.description || product.title)
      .replace(/{price}/g, product.price || "");

  // If user-defined prompts are provided, use them directly
  if (userImagePrompt || userVideoPrompt) {
    imagePrompt = userImagePrompt
      ? replacePlaceholders(userImagePrompt)
      : generateImagePrompt({
          title: product.title,
          description: product.description,
          price: product.price,
          videoType: videoType as VideoType,
        });
    videoPrompt = userVideoPrompt
      ? replacePlaceholders(userVideoPrompt)
      : generateVideoPrompt({
          title: product.title,
          description: product.description,
          price: product.price,
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

  let tiktokCaption =
    userCaption && userCaption.trim()
      ? userCaption.trim()
      : generateTikTokCaption({
          title: product.title,
          description: product.description,
          price: product.price,
          videoType: videoType as VideoType,
        });
  const hashtags =
    userHashtags && Array.isArray(userHashtags) && userHashtags.length > 0
      ? userHashtags.map((h: string) => String(h).replace(/^#/, ""))
      : generateTikTokHashtags({
          title: product.title,
          shopName: product.shopName,
          videoType: videoType as VideoType,
        });
  const tiktokHashtags = JSON.stringify(hashtags);

  // Use user-provided values if available (from Tools page), otherwise generate
  let tiktokProductName =
    userProductName && userProductName.trim()
      ? userProductName.trim()
      : generateTikTokProductName(product.title);
  let tiktokDescription =
    userDescription && userDescription.trim()
      ? userDescription.trim()
      : generateTikTokDescription({
          title: product.title,
          price: product.price,
          videoType: videoType as VideoType,
          hashtags,
        });

  // Try to generate better product name + description via Gemini (only if not user-provided)
  if (
    !(userProductName && userProductName.trim()) ||
    !(userDescription && userDescription.trim())
  ) {
    try {
      const geminiKeySetting = await prisma.setting.findUnique({
        where: { key: "gemini_api_key" },
      });
      if (geminiKeySetting?.value) {
        const geminiResult = await generateWithGemini(
          geminiKeySetting.value,
          product.title,
          product.description,
          product.price,
          videoType as string,
          hashtags,
        );
        if (
          !(userProductName && userProductName.trim()) &&
          geminiResult.productName
        )
          tiktokProductName = geminiResult.productName;
        if (
          !(userDescription && userDescription.trim()) &&
          geminiResult.description
        )
          tiktokDescription = geminiResult.description;
      }
    } catch (err) {
      console.warn(
        "[jobs] Gemini generation failed, using template defaults:",
        err,
      );
    }
  }

  const job = await prisma.videoJob.create({
    data: {
      productId,
      videoType,
      imagePrompt,
      videoPrompt,
      tiktokCaption,
      tiktokHashtags,
      tiktokProductName,
      tiktokDescription,
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

// ---- Gemini-powered product name + description generation ----
async function generateWithGemini(
  apiKey: string,
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
