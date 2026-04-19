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
  if (config.provider === "openai") {
    return callOpenAI(prompt, null, null, config);
  }
  return callGemini(prompt, null, null, config);
}

export async function generateTextWithImage(
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  config: AIConfig,
): Promise<string> {
  if (config.provider === "openai") {
    return callOpenAI(prompt, imageBase64, imageMimeType, config);
  }
  return callGemini(prompt, imageBase64, imageMimeType, config);
}

async function callGemini(
  prompt: string,
  imageBase64: string | null,
  imageMimeType: string | null,
  config: AIConfig,
): Promise<string> {
  const key = config.geminiApiKey;
  if (!key) throw new Error("Gemini API key not configured");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];

  if (imageBase64 && imageMimeType) {
    parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
  }

  const generationConfig: Record<string, unknown> = {};
  if (config.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }
  if (config.temperature !== undefined && config.temperature > 0) {
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
    throw new Error(err?.error?.message || `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAI(
  prompt: string,
  imageBase64: string | null,
  imageMimeType: string | null,
  config: AIConfig,
): Promise<string> {
  const key = config.openaiApiKey;
  if (!key) throw new Error("OpenAI API key not configured");

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentPart[] = [{ type: "text", text: prompt }];

  if (imageBase64 && imageMimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${imageMimeType};base64,${imageBase64}` },
    });
  }

  const body: Record<string, unknown> = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    temperature: config.temperature ?? 1.0,
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
    throw new Error(
      err?.error?.message || `OpenAI error: ${res.status}`,
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
