import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.videoTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, backgroundImage, backgroundDesc, modelImage, modelDesc } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const template = await prisma.videoTemplate.create({
    data: {
      name: name.trim(),
      backgroundImage: backgroundImage || "",
      backgroundDesc: backgroundDesc || "",
      modelImage: modelImage || "",
      modelDesc: modelDesc || "",
    },
  });

  return NextResponse.json(template, { status: 201 });
}
