import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: List all image jobs
export async function GET() {
  const jobs = await prisma.imageJob.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(jobs);
}

// POST: Create a new image job
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imagePrompt, referenceImage } = body;

    if (!imagePrompt) {
      return NextResponse.json(
        { error: "imagePrompt is required" },
        { status: 400 },
      );
    }

    const job = await prisma.imageJob.create({
      data: {
        imagePrompt,
        referenceImage: referenceImage || "",
        status: "pending",
      },
    });

    return NextResponse.json(job);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[image-jobs] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
