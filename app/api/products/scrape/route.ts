import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, scraped, manual } = body;

  // Mode 1: Pre-scraped data from Chrome extension
  if (scraped) {
    if (!scraped.url || !scraped.title) {
      return NextResponse.json(
        { error: "Scraped data must include url and title" },
        { status: 400 },
      );
    }

    const existing = await prisma.product.findUnique({
      where: { url: scraped.url },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Product already exists", product: existing },
        { status: 409 },
      );
    }

    const product = await prisma.product.create({
      data: {
        url: scraped.url,
        title: scraped.title,
        description: scraped.description || "",
        images: JSON.stringify(scraped.images || []),
        price: scraped.price || "",
        shopName: scraped.shopName || "TikTok Shop",
      },
    });
    return NextResponse.json(product, { status: 201 });
  }

  // Mode 2: Manual entry from web app form
  if (manual) {
    if (!manual.url || !manual.title) {
      return NextResponse.json(
        { error: "URL and title are required" },
        { status: 400 },
      );
    }

    try {
      new URL(manual.url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    const existing = await prisma.product.findUnique({
      where: { url: manual.url },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Product already exists", product: existing },
        { status: 409 },
      );
    }

    const product = await prisma.product.create({
      data: {
        url: manual.url,
        title: manual.title,
        description: manual.description || "",
        images: JSON.stringify(manual.images || []),
        price: manual.price || "",
        shopName: manual.shopName || "TikTok Shop",
      },
    });
    return NextResponse.json(product, { status: 201 });
  }

  // Mode 3: URL-only (server-side attempt — may hit security check)
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { url } });
  if (existing) {
    return NextResponse.json(
      { error: "Product already exists", product: existing },
      { status: 409 },
    );
  }

  // Server-side scrape is unreliable due to TikTok's bot protection.
  // Return an error suggesting to use the Chrome extension instead.
  return NextResponse.json(
    {
      error:
        "TikTok blocks server-side scraping. Use the Chrome extension to scrape, or add the product manually.",
      needsExtension: true,
    },
    { status: 422 },
  );
}
