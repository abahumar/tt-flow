import { prisma } from "@/lib/prisma";
import { readFileSync, existsSync } from "fs";
import https from "https";
import path from "path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTelegramConfig(): Promise<{
  botToken: string;
  chatId: string;
} | null> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ["telegram_bot_token", "telegram_chat_id"] } },
  });
  const botToken = settings.find((s) => s.key === "telegram_bot_token")?.value;
  const chatId = settings.find((s) => s.key === "telegram_chat_id")?.value;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

async function sendMultipartWithRetry(
  url: string,
  fields: Record<string, string>,
  fileField: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  maxRetries = 3,
): Promise<{ ok: boolean; description?: string }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Telegram] Retry attempt ${attempt + 1}/${maxRetries}...`);
        await sleep(2000 * attempt);
      }
      return await sendMultipart(
        url,
        fields,
        fileField,
        filePath,
        fileName,
        mimeType,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      if (
        msg.includes("socket hang up") ||
        msg.includes("ECONNRESET") ||
        msg.includes("timed out")
      ) {
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

function sendMultipart(
  url: string,
  fields: Record<string, string>,
  fileField: string,
  filePath: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: boolean; description?: string }> {
  return new Promise((resolve, reject) => {
    const boundary = "----TelegramBotBoundary" + Date.now().toString(16);

    // Read entire file into memory
    const fileBuffer = readFileSync(filePath);

    // Build multipart body parts
    const parts: Buffer[] = [];

    for (const [key, value] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
          "utf-8",
        ),
      );
    }

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        "utf-8",
      ),
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8"));

    const body = Buffer.concat(parts);

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
        Connection: "close",
      },
      timeout: 120000,
      agent: false as const,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 120s"));
    });
    req.on("error", reject);

    req.end(body);
  });
}

export async function sendVideoToTelegram(
  videoPath: string,
  caption?: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getTelegramConfig();
  if (!config) {
    return {
      success: false,
      error: "Telegram bot token or chat ID not configured",
    };
  }

  if (!existsSync(videoPath)) {
    return { success: false, error: `Video file not found: ${videoPath}` };
  }

  try {
    const fields: Record<string, string> = { chat_id: config.chatId };
    if (caption) fields.caption = caption;

    const data = await sendMultipartWithRetry(
      `https://api.telegram.org/bot${config.botToken}/sendVideo`,
      fields,
      "video",
      videoPath,
      path.basename(videoPath),
      "video/mp4",
    );

    if (!data.ok) {
      console.error("[Telegram] Failed to send video:", data.description);
      return { success: false, error: data.description || "Unknown error" };
    }

    console.log("[Telegram] Video sent successfully to chat:", config.chatId);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Telegram] Error sending video:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

export async function sendImageToTelegram(
  imagePath: string,
  caption?: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getTelegramConfig();
  if (!config) {
    return {
      success: false,
      error: "Telegram bot token or chat ID not configured",
    };
  }

  if (!existsSync(imagePath)) {
    return { success: false, error: `Image file not found: ${imagePath}` };
  }

  try {
    const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };

    const fields: Record<string, string> = { chat_id: config.chatId };
    if (caption) fields.caption = caption;

    const data = await sendMultipartWithRetry(
      `https://api.telegram.org/bot${config.botToken}/sendPhoto`,
      fields,
      "photo",
      imagePath,
      path.basename(imagePath),
      mimeMap[ext] || "image/png",
    );

    if (!data.ok) {
      console.error("[Telegram] Failed to send image:", data.description);
      return { success: false, error: data.description || "Unknown error" };
    }

    console.log("[Telegram] Image sent successfully to chat:", config.chatId);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Telegram] Error sending image:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
