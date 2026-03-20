import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Extension polls for pending requests, or web app fetches all active requests
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all");

  if (all) {
    // Web app wants to see all pending/scraping requests for UI status
    const requests = await prisma.scrapeRequest.findMany({
      where: { status: { in: ["pending", "scraping"] } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(requests);
  }

  // Extension polls for next pending request
  const pending = await prisma.scrapeRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 1,
  });
  return NextResponse.json(pending);
}

// POST: Web app submits a URL to scrape
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Check if product already exists
  const existing = await prisma.product.findUnique({ where: { url } });
  if (existing) {
    return NextResponse.json(
      { error: "Product already exists", product: existing },
      { status: 409 },
    );
  }

  // Check if already queued
  const queued = await prisma.scrapeRequest.findFirst({
    where: { url, status: { in: ["pending", "scraping"] } },
  });
  if (queued) {
    return NextResponse.json(queued);
  }

  const request = await prisma.scrapeRequest.create({
    data: { url },
  });

  return NextResponse.json(request, { status: 201 });
}
