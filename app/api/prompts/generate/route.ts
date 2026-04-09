import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateImagePrompt,
  generateVideoPrompt,
  VideoType,
} from "@/lib/prompt-templates";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, videoType = "fungsi_produk", isClothing = false } = body;

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

  const imagePrompt = generateImagePrompt({
    title: product.title,
    description: product.description,
    price: product.price,
    videoType: videoType as VideoType,
    isClothing,
  });

  const videoPrompt = generateVideoPrompt({
    title: product.title,
    description: product.description,
    price: product.price,
    videoType: videoType as VideoType,
  });

  return NextResponse.json({ imagePrompt, videoPrompt });
}
