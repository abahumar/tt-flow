// lib/ai-client.ts

export interface AIConfig {
  provider: "gemini" | "openai";
  geminiApiKey?: string;
  openaiApiKey?: string;
  temperature?: number;
  responseFormat?: "json" | "text";
}

export async function generateText(
  prompt: string,
  config: AIConfig,
): Promise<string> {
  return generateTextWithImages(prompt, [], config);
}

export async function generateTextWithImage(
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  config: AIConfig,
): Promise<string> {
  return generateTextWithImages(
    prompt,
    [{ base64: imageBase64, mimeType: imageMimeType }],
    config,
  );
}

export async function generateTextWithImages(
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  config: AIConfig,
): Promise<string> {
  if (config.provider === "openai") {
    return callOpenAIMulti(prompt, images, config);
  }
  return callGeminiMulti(prompt, images, config);
}

async function callGeminiMulti(
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  config: AIConfig,
): Promise<string> {
  const key = config.geminiApiKey;
  if (!key) throw new Error("Gemini API key not configured");

  const model = "gemini-2.5-flash";
  const imgNote = images.length > 0 ? ` + ${images.length} image(s)` : "";
  console.log(`[ai-client] ▶ Gemini (${model})${imgNote} | temp=${config.temperature ?? "default"} | format=${config.responseFormat ?? "text"}`);
  const t0 = Date.now();

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];

  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  const generationConfig: Record<string, unknown> = {};
  if (config.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }
  if (config.temperature !== undefined) {
    generationConfig.temperature = config.temperature;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
      cache: "no-store" as RequestCache,
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[ai-client] ✗ Gemini error ${res.status} (${Date.now() - t0}ms)`);
    throw new Error(err?.error?.message || `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log(`[ai-client] ✓ Gemini done (${Date.now() - t0}ms) | ${text.length} chars`);
  return text;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function callOpenAIMulti(
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  config: AIConfig,
): Promise<string> {
  const key = config.openaiApiKey;
  if (!key) throw new Error("OpenAI API key not configured");

  const model = "gpt-4o-mini";
  const imgNote = images.length > 0 ? ` + ${images.length} image(s)` : "";
  // GPT-4o-mini becomes unstable above 1.0 for structured JSON — cap it
  const temperature = Math.min(config.temperature ?? 1.0, 1.0);
  console.log(`[ai-client] ▶ OpenAI (${model})${imgNote} | temp=${temperature} | format=${config.responseFormat ?? "text"}`);
  const t0 = Date.now();

  const content: ContentPart[] = [{ type: "text", text: prompt }];

  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }

  const body: Record<string, unknown> = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    temperature,
  };

  if (config.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    cache: "no-store" as RequestCache,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[ai-client] ✗ OpenAI error ${res.status} (${Date.now() - t0}ms)`);
    throw new Error(
      err?.error?.message || `OpenAI error: ${res.status}`,
    );
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  console.log(`[ai-client] ✓ OpenAI done (${Date.now() - t0}ms) | ${text.length} chars`);
  console.log(`[ai-client] OpenAI raw response (first 2000 chars):`, text.substring(0, 2000));
  return text;
}
