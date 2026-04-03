import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Convert product ID to full TikTok Shop URL
function toProductUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (/^\d{10,}$/.test(trimmed)) {
    return `https://shop.tiktok.com/view/product/${trimmed}`;
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { urls } = body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: "urls array is required" },
      { status: 400 },
    );
  }

  // Limit batch size to prevent abuse
  if (urls.length > 200) {
    return NextResponse.json(
      { error: "Maximum 200 URLs per batch" },
      { status: 400 },
    );
  }

  const results: {
    created: number;
    skippedExisting: number;
    skippedQueued: number;
    skippedInvalid: number;
    details: { url: string; status: string; reason?: string }[];
  } = {
    created: 0,
    skippedExisting: 0,
    skippedQueued: 0,
    skippedInvalid: 0,
    details: [],
  };

  for (const rawUrl of urls) {
    const url = typeof rawUrl === "string" ? toProductUrl(rawUrl.trim()) : "";

    if (!url) {
      results.skippedInvalid++;
      continue;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      results.skippedInvalid++;
      results.details.push({
        url: rawUrl,
        status: "invalid",
        reason: "Invalid URL or product ID format",
      });
      continue;
    }

    // Check if product already exists
    const existingProduct = await prisma.product.findUnique({ where: { url } });
    if (existingProduct) {
      results.skippedExisting++;
      results.details.push({
        url,
        status: "exists",
        reason: "Product already in catalog",
      });
      continue;
    }

    // Check if already queued for scraping
    const queued = await prisma.scrapeRequest.findFirst({
      where: { url, status: { in: ["pending", "scraping"] } },
    });
    if (queued) {
      results.skippedQueued++;
      results.details.push({
        url,
        status: "queued",
        reason: "Already in scrape queue",
      });
      continue;
    }

    // Create scrape request
    await prisma.scrapeRequest.create({ data: { url } });
    results.created++;
    results.details.push({ url, status: "created" });
  }

  return NextResponse.json(results, { status: 201 });
}
