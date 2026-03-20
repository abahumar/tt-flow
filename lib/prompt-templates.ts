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
