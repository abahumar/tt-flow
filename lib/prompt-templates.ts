export const VIDEO_TYPES = {
  fungsi_produk: "Fungsi Produk",
  review: "Review Style",
  unboxing: "Unboxing Style",
  problem_solution: "Problem-Solution",
} as const;

export type VideoType = keyof typeof VIDEO_TYPES;

const IMAGE_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a professional product showcase photo. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Place it on a clean white/light background with studio lighting, showing the product in use demonstrating its function. " +
    "Product: {title}. {description}",
  review:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a realistic product review style photo. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Display the product attractively with warm lighting in a lifestyle setting. " +
    "Product: {title}. {description}",
  unboxing:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create an exciting unboxing scene. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Show the product being revealed from packaging with tissue paper and box, overhead angle, clean background. " +
    "Product: {title}. {description}",
  problem_solution:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a before-and-after style image. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Left side shows a common problem, right side shows the solution with the product prominently displayed. " +
    "Product: {title}. {description}",
};

const VIDEO_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "Create a short 15-second product demonstration video of {title}. " +
    "Show the product being used step by step, highlighting its key function. " +
    "Smooth camera movements, good lighting, engaging pace. Price: {price}",
  review:
    "Create a 15-second product review style video of {title}. " +
    "Start with the product reveal, show different angles, and end with a satisfied reaction. " +
    "Include text overlay spots for rating. Price: {price}",
  unboxing:
    "Create a 15-second unboxing video of {title}. " +
    "Start with the sealed package, slowly open it, reveal the product with excitement. " +
    "ASMR-style, close-up shots, satisfying reveal moment. Price: {price}",
  problem_solution:
    "Create a 15-second problem-solution video for {title}. " +
    "Start by showing a common frustration/problem, then introduce the product as the solution. " +
    "Quick transition, dramatic improvement, happy ending. Price: {price}",
};

interface PromptInput {
  title: string;
  description: string;
  price: string;
  videoType: VideoType;
  customImagePrompt?: string;
  customVideoPrompt?: string;
}

export function generateImagePrompt(input: PromptInput): string {
  if (input.customImagePrompt) return input.customImagePrompt;

  const template =
    IMAGE_TEMPLATES[input.videoType] || IMAGE_TEMPLATES.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "");
}

export function generateVideoPrompt(input: PromptInput): string {
  if (input.customVideoPrompt) return input.customVideoPrompt;

  const template =
    VIDEO_TEMPLATES[input.videoType] || VIDEO_TEMPLATES.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "");
}

// ---- TikTok Caption & Hashtag Generation ----

const CAPTION_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk: "{title} 🔥 Harga {price}",
  review: "Review {title} ⭐ Worth it!",
  unboxing: "Unboxing {title}! 📦",
  problem_solution: "{title} — solusi terbaik! 💡",
};

interface CaptionInput {
  title: string;
  description: string;
  price: string;
  videoType: VideoType;
}

export function generateTikTokCaption(input: CaptionInput): string {
  const template =
    CAPTION_TEMPLATES[input.videoType] || CAPTION_TEMPLATES.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "terjangkau");
}

interface HashtagInput {
  title: string;
  shopName: string;
  videoType: VideoType;
}

const VIDEO_TYPE_HASHTAGS: Record<VideoType, string[]> = {
  fungsi_produk: ["tutorial", "tipsdantrik"],
  review: ["reviewjujur", "reviewproduk"],
  unboxing: ["unboxing", "unboxinghaul"],
  problem_solution: ["solusi", "lifehack"],
};

export function generateTikTokHashtags(input: HashtagInput): string[] {
  const tags: string[] = ["fyp", "tiktokshop", "rekomendasitiktok"];

  // Add video-type specific hashtags
  const typeTags = VIDEO_TYPE_HASHTAGS[input.videoType] || [];
  tags.push(...typeTags);

  // Add product-specific words from title
  const words = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  for (const word of words.slice(0, 2)) {
    if (!tags.includes(word)) tags.push(word);
  }

  // Add shop name if available
  if (input.shopName) {
    const shopTag = input.shopName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (shopTag.length > 2 && !tags.includes(shopTag)) tags.push(shopTag);
  }

  return tags.slice(0, 8);
}

// ---- TikTok Product Name (clean, max 30 chars, no special characters) ----

export function generateTikTokProductName(title: string): string {
  // Remove common prefixes like "TT109)" or "SKU123)"
  let clean = title.replace(/^[A-Z]{1,5}\d+\)\s*/i, "");

  // Remove bracketed content like [READY STOCK + TAG PEWA]
  clean = clean.replace(/\[.*?\]/g, "").trim();

  // Remove special characters, keep only letters, numbers, spaces
  clean = clean.replace(/[^a-zA-Z0-9\s]/g, " ");

  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, " ").trim();

  // Capitalize first letter of each word
  clean = clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // Truncate to 30 chars (at word boundary)
  if (clean.length > 30) {
    clean = clean
      .substring(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return (
    clean ||
    title
      .substring(0, 30)
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
  );
}

// ---- TikTok Product Description (with hashtags) ----

const DESCRIPTION_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk: "{title} — Harga {price}. Jom dapatkan sekarang!",
  review: "Review {title} — Harga {price}. Cuba sekarang!",
  unboxing: "Unboxing {title}! Harga {price}. Grab yours!",
  problem_solution: "{title} — Harga {price}. Dapatkan sekarang!",
};

interface DescriptionInput {
  title: string;
  price: string;
  videoType: VideoType;
  hashtags: string[];
}

export function generateTikTokDescription(input: DescriptionInput): string {
  const cleanTitle = generateTikTokProductName(input.title);
  const template =
    DESCRIPTION_TEMPLATES[input.videoType] ||
    DESCRIPTION_TEMPLATES.fungsi_produk;

  let desc = template
    .replace(/{title}/g, cleanTitle)
    .replace(/{price}/g, input.price || "berpatutan");

  // Append hashtags
  if (input.hashtags && input.hashtags.length > 0) {
    const hashtagStr = input.hashtags.map((h) => `#${h}`).join(" ");
    desc = `${desc} ${hashtagStr}`;
  }

  return desc;
}
