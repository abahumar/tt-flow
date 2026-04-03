"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Type,
  FileText,
  Hash,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Package,
  PenTool,
  Info,
  RefreshCw,
} from "lucide-react";

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
}

interface Variation {
  label: string;
  title?: string;
  title_malay?: string;
  title_english?: string;
  description?: string;
  description_malay?: string;
  description_english?: string;
  hashtags: string[];
}

const TONES = [
  {
    id: "casual",
    label: "Santai",
    emoji: "😊",
    desc: "Kawan sharing best product",
  },
  {
    id: "professional",
    label: "Professional",
    emoji: "💼",
    desc: "Polished & trustworthy",
  },
  { id: "hype", label: "Hype", emoji: "🔥", desc: "HIGH ENERGY! Urgency!" },
  {
    id: "friendly",
    label: "Friendly",
    emoji: "🤝",
    desc: "Warm recommendation",
  },
];

const LANGUAGES = [
  { id: "malay", label: "Bahasa Melayu" },
  { id: "english", label: "English" },
  { id: "both", label: "Both (BM + EN)" },
];

export default function ContentToolsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Input mode: "product" or "custom"
  const [inputMode, setInputMode] = useState<"product" | "custom">("product");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // Generation options
  const [tone, setTone] = useState("casual");
  const [language, setLanguage] = useState("malay");
  const [variationCount, setVariationCount] = useState(5);

  // API key
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Results
  const [variations, setVariations] = useState<Variation[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);
  }, [fetchProducts]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedImages: string[] = selectedProduct
    ? JSON.parse(selectedProduct.images || "[]")
    : [];

  const canGenerate =
    apiKey.trim() &&
    (inputMode === "product"
      ? !!selectedProductId
      : customTitle.trim() || customDescription.trim());

  const handleGenerate = async () => {
    if (!canGenerate) {
      setError(
        inputMode === "product"
          ? "Pilih produk dulu"
          : "Masukkan nama atau description produk",
      );
      return;
    }
    if (!apiKey.trim()) {
      setError("Masukkan Gemini API key");
      return;
    }

    setGenerating(true);
    setError("");
    setHasGenerated(false);
    localStorage.setItem("gemini_api_key", apiKey);

    try {
      const payload: Record<string, unknown> = {
        apiKey,
        language,
        tone,
        variationCount,
        contentTypes: ["title", "description", "hashtags"],
      };

      if (inputMode === "product") {
        payload.productId = selectedProductId;
      } else {
        payload.customProduct = {
          title:
            customTitle.trim() ||
            customDescription.split(/[\n.]/)[0]?.trim()?.substring(0, 60) ||
            "Custom Product",
          description: customDescription.trim(),
          price: customPrice.trim() || null,
        };
      }

      const res = await fetch("/api/prompts/ai-generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      setVariations(data.variations || []);
      setHasGenerated(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyAll = (variation: Variation, index: number) => {
    const isBoth = language === "both";
    const lines: string[] = [`[${variation.label}]`];

    if (isBoth) {
      if (variation.title_malay)
        lines.push(`Title (BM): ${variation.title_malay}`);
      if (variation.title_english)
        lines.push(`Title (EN): ${variation.title_english}`);
      if (variation.description_malay)
        lines.push(`\nDescription (BM):\n${variation.description_malay}`);
      if (variation.description_english)
        lines.push(`\nDescription (EN):\n${variation.description_english}`);
    } else {
      if (variation.title) lines.push(`Title: ${variation.title}`);
      if (variation.description)
        lines.push(`\nDescription:\n${variation.description}`);
    }

    if (variation.hashtags?.length) {
      lines.push(
        `\nHashtags: ${variation.hashtags.map((h) => `#${h}`).join(" ")}`,
      );
    }

    handleCopy(lines.join("\n"), `all-${index}`);
  };

  const CopyBtn = ({
    text,
    copyKey,
    label,
    className = "",
  }: {
    text: string;
    copyKey: string;
    label?: string;
    className?: string;
  }) => {
    const isCopied = copiedKey === copyKey;
    return (
      <button
        onClick={() => handleCopy(text, copyKey)}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
          isCopied
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        } ${className}`}
      >
        {isCopied ? <Check size={10} /> : <Copy size={10} />}
        {label || (isCopied ? "Copied!" : "Copy")}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PenTool className="h-6 w-6 text-teal-500" />
          Content Tools
        </h1>
        <p className="text-sm text-gray-500">
          AI generates TikTok Title, Description & Hashtags — optimized for
          Malaysian market
        </p>
      </div>

      {/* Input Mode Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1.5">
        <button
          onClick={() => {
            setInputMode("product");
            setHasGenerated(false);
            setVariations([]);
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all ${
            inputMode === "product"
              ? "bg-white text-teal-700 shadow-sm ring-1 ring-teal-200"
              : "text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
          }`}
        >
          <Package size={16} />
          From Product
        </button>
        <button
          onClick={() => {
            setInputMode("custom");
            setHasGenerated(false);
            setVariations([]);
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all ${
            inputMode === "custom"
              ? "bg-white text-teal-700 shadow-sm ring-1 ring-teal-200"
              : "text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
          }`}
        >
          <PenTool size={16} />
          Custom Input
        </button>
      </div>

      {/* Input Section */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {inputMode === "product" ? "Select Product" : "Custom Product"}
        </h2>

        {inputMode === "product" ? (
          <>
            {loading ? (
              <p className="py-4 text-center text-sm text-gray-400">
                Loading...
              </p>
            ) : products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
                No products. Go to Katalog Produk first.
              </div>
            ) : (
              <>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setHasGenerated(false);
                    setVariations([]);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Pilih produk --</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.title} {prod.price ? `(${prod.price})` : ""}
                    </option>
                  ))}
                </select>

                {/* Product preview */}
                {selectedProduct && (
                  <div className="flex items-start gap-4 rounded-lg bg-gray-50 p-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                      {selectedImages[0] ? (
                        <img
                          src={selectedImages[0]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">
                          N/A
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {selectedProduct.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {selectedProduct.shopName && (
                          <span>{selectedProduct.shopName} · </span>
                        )}
                        {selectedProduct.price}
                      </p>
                      {selectedProduct.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                          {selectedProduct.description}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Product Name
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Whitening Serum 30ml"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Product Description
              </label>
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Describe the product — key features, benefits, ingredients, USP..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Price (optional)
              </label>
              <input
                type="text"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="e.g. RM29.90"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Options Section */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Generation Options
        </h2>

        {/* Tone */}
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-500">
            Tone / Gaya
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-medium transition-all ${
                  tone === t.id
                    ? "border-teal-400 bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="font-bold">{t.label}</span>
                <span className="text-[10px] text-gray-400">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-500">
            Language
          </label>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={`flex-1 rounded-lg border py-2.5 text-xs font-bold transition-all ${
                  language === l.id
                    ? "border-teal-400 bg-teal-50 text-teal-700 ring-1 ring-teal-200"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Variation count */}
        <div className="flex items-center gap-4">
          <label className="text-xs font-medium text-gray-500">
            Variations
          </label>
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {[3, 5, 8, 10].map((n) => (
              <button
                key={n}
                onClick={() => setVariationCount(n)}
                className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
                  variationCount === n
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... (from Google AI Studio — free)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            Get free API key at aistudio.google.com
          </p>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-medium text-teal-700">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Generates optimized <strong>Title</strong> (max 30 chars),{" "}
            <strong>Description</strong> (with hashtags), and{" "}
            <strong>Hashtag</strong> sets for TikTok Shop product listings.
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !canGenerate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-teal-700 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:shadow-none"
        >
          {generating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          {generating ? "Generating..." : "Generate Content"}
        </button>
      </div>

      {/* ─── RESULTS ─── */}
      {hasGenerated && variations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-700">
              <Sparkles size={16} />
              Generated Content
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {variations.length} variations
              </span>
            </h2>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw
                size={12}
                className={generating ? "animate-spin" : ""}
              />
              Regenerate
            </button>
          </div>

          {variations.map((v, i) => {
            const isBoth = language === "both";
            return (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    {v.label || `Variation ${i + 1}`}
                  </span>
                  <button
                    onClick={() => handleCopyAll(v, i)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                      copiedKey === `all-${i}`
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {copiedKey === `all-${i}` ? (
                      <Check size={10} />
                    ) : (
                      <Copy size={10} />
                    )}
                    {copiedKey === `all-${i}` ? "Copied!" : "Copy All"}
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  {/* Title */}
                  {isBoth ? (
                    <div className="space-y-2">
                      {v.title_malay && (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              <Type size={10} /> Title (BM)
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-mono ${v.title_malay.length > 30 ? "text-red-500" : "text-gray-400"}`}
                              >
                                {v.title_malay.length}/30
                              </span>
                              <CopyBtn
                                text={v.title_malay}
                                copyKey={`title-bm-${i}`}
                              />
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium">
                            {v.title_malay}
                          </div>
                        </div>
                      )}
                      {v.title_english && (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              <Type size={10} /> Title (EN)
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-mono ${v.title_english.length > 30 ? "text-red-500" : "text-gray-400"}`}
                              >
                                {v.title_english.length}/30
                              </span>
                              <CopyBtn
                                text={v.title_english}
                                copyKey={`title-en-${i}`}
                              />
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium">
                            {v.title_english}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    v.title && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            <Type size={10} /> Title
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono ${v.title.length > 30 ? "text-red-500" : "text-gray-400"}`}
                            >
                              {v.title.length}/30
                            </span>
                            <CopyBtn text={v.title} copyKey={`title-${i}`} />
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium">
                          {v.title}
                        </div>
                      </div>
                    )
                  )}

                  {/* Description */}
                  {isBoth ? (
                    <div className="space-y-2">
                      {v.description_malay && (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              <FileText size={10} /> Description (BM)
                            </span>
                            <CopyBtn
                              text={v.description_malay}
                              copyKey={`desc-bm-${i}`}
                            />
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
                            {v.description_malay}
                          </div>
                        </div>
                      )}
                      {v.description_english && (
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              <FileText size={10} /> Description (EN)
                            </span>
                            <CopyBtn
                              text={v.description_english}
                              copyKey={`desc-en-${i}`}
                            />
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
                            {v.description_english}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    v.description && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            <FileText size={10} /> Description
                          </span>
                          <CopyBtn text={v.description} copyKey={`desc-${i}`} />
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
                          {v.description}
                        </div>
                      </div>
                    )
                  )}

                  {/* Hashtags */}
                  {v.hashtags?.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          <Hash size={10} /> Hashtags
                        </span>
                        <CopyBtn
                          text={v.hashtags.map((h) => `#${h}`).join(" ")}
                          copyKey={`hash-${i}`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {v.hashtags.map((tag, ti) => (
                          <button
                            key={ti}
                            onClick={() =>
                              handleCopy(`#${tag}`, `tag-${i}-${ti}`)
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                              copiedKey === `tag-${i}-${ti}`
                                ? "border-green-300 bg-green-100 text-green-700"
                                : "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
