import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const prompts = await prisma.customPrompt.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(prompts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, imagePrompt, videoPrompt } = body;

  if (!name || (!imagePrompt && !videoPrompt)) {
    return NextResponse.json(
      { error: "Name and at least one prompt (image or video) are required" },
      { status: 400 },
    );
  }

  const prompt = await prisma.customPrompt.create({
    data: {
      name: String(name).slice(0, 200),
      imagePrompt: String(imagePrompt || ""),
      videoPrompt: String(videoPrompt || ""),
    },
  });

  return NextResponse.json(prompt, { status: 201 });
}
