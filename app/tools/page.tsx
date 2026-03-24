"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  Sparkles,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  Wand2,
  Copy,
  Check,
  Clapperboard,
  Layers,
  Film,
  Zap,
  Brain,
  Image as ImageIcon,
  Video,
  Info,
  User,
  Package,
} from "lucide-react";

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
}

interface PairedOutput {
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  tiktokProductName: string;
  tiktokDescription: string;
  tiktokCaption: string;
  tiktokHashtags: string[];
}

const VIDEO_TYPES: Record<string, string> = {
  fungsi_produk: "Fungsi Produk",
  review: "Review Style",
  unboxing: "Unboxing Style",
  problem_solution: "Problem-Solution",
};

const PLATFORMS = {
  flow: {
    label: "Flow",
    icon: Layers,
    btn: "bg-blue-600 hover:bg-blue-700",
    activeTab: "bg-white shadow-sm ring-1 ring-blue-200 text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    ring: "ring-blue-500",
    durations: null as number[] | null,
  },
  kling: {
    label: "Kling",
    icon: Zap,
    btn: "bg-purple-600 hover:bg-purple-700",
    activeTab: "bg-white shadow-sm ring-1 ring-purple-200 text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    ring: "ring-purple-500",
    durations: [5, 10],
  },
  grok: {
    label: "Grok",
    icon: Brain,
    btn: "bg-emerald-600 hover:bg-emerald-700",
    activeTab: "bg-white shadow-sm ring-1 ring-emerald-200 text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    ring: "ring-emerald-500",
    durations: [6, 10],
  },
  sora: {
    label: "Sora",
    icon: Film,
    btn: "bg-gray-900 hover:bg-black",
    activeTab: "bg-white shadow-sm ring-1 ring-gray-200 text-gray-900",
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-900",
    ring: "ring-gray-500",
    durations: [10, 15],
  },
};

const AVATARS = [
  {
    id: "woman_malay_hijab",
    label: "Wanita Melayu (Bertudung)",
    emoji: "🧕",
  },
  {
    id: "woman_malay_freehair",
    label: "Wanita Melayu (Moden)",
    emoji: "👩",
  },
  {
    id: "woman_malay_corporate",
    label: "Wanita Melayu (Korporat)",
    emoji: "👩‍💼",
  },
  {
    id: "man_malay_casual",
    label: "Lelaki Melayu (Casual)",
    emoji: "👨",
  },
  {
    id: "man_malay_corporate",
    label: "Lelaki Melayu (Korporat)",
    emoji: "👨‍💼",
  },
  {
    id: "product_only",
    label: "Produk Sahaja",
    emoji: "📦",
  },
] as const;

type PlatformKey = keyof typeof PLATFORMS;

export default function ToolsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [videoType, setVideoType] = useState("fungsi_produk");
  const [platform, setPlatform] = useState<PlatformKey>("flow");
  const [duration, setDuration] = useState(10);

  const [genMode, setGenMode] = useState<"paired" | "storyline">("paired");
  const [avatarId, setAvatarId] = useState("woman_malay_hijab");

  const [includeDialog, setIncludeDialog] = useState(false);
  const [includeEnglishDialog, setIncludeEnglishDialog] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [outputs, setOutputs] = useState<PairedOutput[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [activeGenMode, setActiveGenMode] = useState<string | null>(null);
  // Track sending state per variation per type: "img-0", "vid-0", "both-0"
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyAllStatus, setCopyAllStatus] = useState(false);

  const imgRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const vidRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const adjustHeight = (el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    if (hasGenerated)
      setTimeout(() => {
        imgRefs.current.forEach(adjustHeight);
        vidRefs.current.forEach(adjustHeight);
      }, 0);
  }, [outputs, hasGenerated]);

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
  const p = PLATFORMS[platform];

  const handleGenerate = async (mode: typeof genMode) => {
    if (!selectedProductId) {
      setError("Pilih produk dulu");
      return;
    }
    if (!apiKey.trim()) {
      setError("Masukkan Gemini API key");
      return;
    }

    setGenMode(mode);
    setActiveGenMode(mode);
    setGenerating(true);
    setError("");
    setHasGenerated(false);
    setSentKeys(new Set());
    localStorage.setItem("gemini_api_key", apiKey);

    try {
      const res = await fetch("/api/prompts/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          platform,
          mode,
          duration,
          includeDialog,
          includeEnglishDialog,
          videoType,
          apiKey,
          avatarId,
          imageCount: Math.max(selectedImages.length, 1),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      setOutputs(
        (data.variations || []).map(
          (v: {
            description: string;
            imagePrompt?: string;
            videoPrompt?: string;
            tiktokProductName?: string;
            tiktokDescription?: string;
            tiktokCaption?: string;
            tiktokHashtags?: string[];
          }) => ({
            description: v.description || "",
            imagePrompt: v.imagePrompt || "",
            videoPrompt: v.videoPrompt || "",
            tiktokProductName: v.tiktokProductName || "",
            tiktokDescription: v.tiktokDescription || "",
            tiktokCaption: v.tiktokCaption || "",
            tiktokHashtags: v.tiktokHashtags || [],
          }),
        ),
      );
      setHasGenerated(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
      setActiveGenMode(null);
    }
  };

  const sendToQueue = async (
    index: number,
    type: "image" | "video" | "both",
  ) => {
    if (!selectedProductId) return;
    const output = outputs[index];
    if (!output) return;

    const key = `${type}-${index}`;
    setSendingKey(key);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          videoType,
          userImagePrompt:
            type === "image" || type === "both" ? output.imagePrompt : "",
          userVideoPrompt:
            type === "video" || type === "both" ? output.videoPrompt : "",
          tiktokProductName: output.tiktokProductName || "",
          tiktokDescription: output.tiktokDescription || "",
          tiktokCaption: output.tiktokCaption || "",
          tiktokHashtags: output.tiktokHashtags || [],
        }),
      });

      if (res.ok) {
        setSentKeys((prev) => {
          const next = new Set(prev);
          next.add(key);
          if (type === "both") {
            next.add(`image-${index}`);
            next.add(`video-${index}`);
          }
          return next;
        });
      }
    } catch {
      setError("Failed to add to queue");
    } finally {
      setSendingKey(null);
    }
  };

  const handleQueueAll = async () => {
    for (let i = 0; i < outputs.length; i++) {
      if (!sentKeys.has(`both-${i}`)) {
        await sendToQueue(i, "both");
      }
    }
  };

  const handleCopy = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyAll = () => {
    const txt = outputs
      .map(
        (o) =>
          `[${o.description.toUpperCase()}]\n🖼️ Image Prompt:\n${o.imagePrompt}\n\n🎬 Video Prompt:\n${o.videoPrompt}`,
      )
      .join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
    navigator.clipboard.writeText(txt);
    setCopyAllStatus(true);
    setTimeout(() => setCopyAllStatus(false), 1500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wand2 className="h-6 w-6 text-purple-500" />
          Prompt Tools
        </h1>
        <p className="text-sm text-gray-500">
          AI generates paired Image + Video prompts — same scene, always
          consistent
        </p>
      </div>

      {/* ─── PLATFORM TABS ─── */}
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1.5">
        {(Object.keys(PLATFORMS) as PlatformKey[]).map((key) => {
          const cfg = PLATFORMS[key];
          const Icon = cfg.icon;
          const isActive = platform === key;
          return (
            <button
              key={key}
              onClick={() => {
                setPlatform(key);
                setHasGenerated(false);
                setOutputs([]);
                if (cfg.durations) setDuration(cfg.durations[0]);
              }}
              className={`flex flex-col items-center justify-center rounded-lg py-3 transition-all duration-200 ${
                isActive
                  ? cfg.activeTab
                  : "text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
              }`}
            >
              <Icon size={20} className="mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── PRODUCT & SETTINGS ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Product & Settings
        </h2>

        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
            No products. Go to Katalog Produk first.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Product
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setHasGenerated(false);
                    setOutputs([]);
                  }}
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${p.ring}`}
                >
                  <option value="">-- Pilih produk --</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.title} {prod.price ? `(${prod.price})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-48">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Marketing Angle
                </label>
                <select
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${p.ring}`}
                >
                  {Object.entries(VIDEO_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                  <p className="text-sm font-medium">{selectedProduct.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {selectedProduct.shopName && (
                      <span>{selectedProduct.shopName} · </span>
                    )}
                    {selectedProduct.price}
                    {selectedImages.length > 0 && (
                      <span> · {selectedImages.length} image(s)</span>
                    )}
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

        {/* Avatar / Model Selection */}
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <User size={12} /> Model / Avatar
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AVATARS.map((av) => {
              const isActive = avatarId === av.id;
              return (
                <button
                  key={av.id}
                  onClick={() => setAvatarId(av.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all ${
                    isActive
                      ? "border-purple-400 bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base">{av.emoji}</span>
                  <span className="leading-tight">{av.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Duration toggle */}
        {p.durations && (
          <div className={`rounded-xl border p-4 ${p.bg} ${p.border}`}>
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${p.text}`}
              >
                <p.icon size={14} /> {p.label} Duration
              </div>
              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                {p.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
                      duration === d
                        ? `${p.btn} text-white shadow-sm`
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dialog toggles */}
        <div className="flex gap-3">
          <button
            onClick={() => setIncludeDialog(!includeDialog)}
            className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all ${
              includeDialog
                ? "border-black bg-black text-white shadow-md"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            Dialog Melayu: {includeDialog ? "On" : "Off"}
          </button>
          <button
            onClick={() => setIncludeEnglishDialog(!includeEnglishDialog)}
            className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all ${
              includeEnglishDialog
                ? "border-black bg-black text-white shadow-md"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            Dialog English: {includeEnglishDialog ? "On" : "Off"}
          </button>
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
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 ${p.ring}`}
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
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs font-medium ${p.bg} ${p.text} ${p.border}`}
        >
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Each variation generates a <strong>paired</strong> Image + Video
            prompt sharing the same scene. The image = first frame, the video =
            the motion. Queue them together or separately.
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* ─── ACTION BUTTONS ─── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleGenerate("paired")}
            disabled={generating || !selectedProductId}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:shadow-none ${p.btn}`}
          >
            {generating && activeGenMode === "paired" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            Generate Prompts
          </button>

          {platform !== "kling" && (
            <button
              onClick={() => handleGenerate("storyline")}
              disabled={generating || !selectedProductId}
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-black hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:shadow-none"
            >
              {generating && activeGenMode === "storyline" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Clapperboard className="h-5 w-5" />
              )}
              Generate Storyline
            </button>
          )}
        </div>
      </div>

      {/* ─── PAIRED OUTPUTS ─── */}
      {hasGenerated && outputs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${p.text}`}
            >
              {genMode === "storyline" ? (
                <Clapperboard size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {genMode === "storyline"
                ? "UGC Storyline"
                : `${p.label} Paired Prompts`}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {outputs.length} variations
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  copyAllStatus
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {copyAllStatus ? <Check size={14} /> : <Copy size={14} />}
                {copyAllStatus ? "Copied!" : "Copy All"}
              </button>
              <button
                onClick={handleQueueAll}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-orange-600"
              >
                <Send className="h-3.5 w-3.5" />
                Queue All
              </button>
            </div>
          </div>

          {outputs.map((o, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  {o.description}
                </span>
                <div className="flex items-center gap-2">
                  {/* Queue Both */}
                  <button
                    onClick={() => sendToQueue(i, "both")}
                    disabled={
                      sendingKey === `both-${i}` || sentKeys.has(`both-${i}`)
                    }
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                      sentKeys.has(`both-${i}`)
                        ? "bg-green-50 text-green-600"
                        : "bg-orange-500 text-white hover:bg-orange-600"
                    } disabled:opacity-60`}
                  >
                    {sendingKey === `both-${i}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : sentKeys.has(`both-${i}`) ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {sentKeys.has(`both-${i}`) ? "Queued!" : "Queue Both"}
                  </button>
                </div>
              </div>

              {/* Image Prompt Section */}
              <div className="border-b border-gray-100">
                <div className="flex items-center justify-between bg-amber-50/50 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Image Prompt (First Frame)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(o.imagePrompt, `img-${i}`)}
                      className={`text-[10px] font-bold transition-colors ${
                        copiedKey === `img-${i}`
                          ? "text-green-600"
                          : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {copiedKey === `img-${i}` ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => sendToQueue(i, "image")}
                      disabled={
                        sendingKey === `image-${i}` ||
                        sentKeys.has(`image-${i}`)
                      }
                      className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
                        sentKeys.has(`image-${i}`)
                          ? "text-green-600"
                          : "text-amber-600 hover:text-amber-700"
                      } disabled:opacity-50`}
                    >
                      {sendingKey === `image-${i}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : sentKeys.has(`image-${i}`) ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      {sentKeys.has(`image-${i}`) ? "Queued" : "→ Queue Image"}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={(el) => {
                    imgRefs.current[i] = el;
                    if (el) adjustHeight(el);
                  }}
                  value={o.imagePrompt}
                  onChange={(e) => {
                    const next = [...outputs];
                    next[i] = { ...next[i], imagePrompt: e.target.value };
                    setOutputs(next);
                  }}
                  className="min-h-20 w-full resize-none overflow-hidden bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 focus:outline-none"
                  spellCheck={false}
                />
              </div>

              {/* Video Prompt Section */}
              <div>
                <div className="flex items-center justify-between bg-blue-50/50 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    <Video className="h-3.5 w-3.5" />
                    Video Prompt (Motion)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(o.videoPrompt, `vid-${i}`)}
                      className={`text-[10px] font-bold transition-colors ${
                        copiedKey === `vid-${i}`
                          ? "text-green-600"
                          : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {copiedKey === `vid-${i}` ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => sendToQueue(i, "video")}
                      disabled={
                        sendingKey === `video-${i}` ||
                        sentKeys.has(`video-${i}`)
                      }
                      className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
                        sentKeys.has(`video-${i}`)
                          ? "text-green-600"
                          : "text-blue-600 hover:text-blue-700"
                      } disabled:opacity-50`}
                    >
                      {sendingKey === `video-${i}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : sentKeys.has(`video-${i}`) ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      {sentKeys.has(`video-${i}`) ? "Queued" : "→ Queue Video"}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={(el) => {
                    vidRefs.current[i] = el;
                    if (el) adjustHeight(el);
                  }}
                  value={o.videoPrompt}
                  onChange={(e) => {
                    const next = [...outputs];
                    next[i] = { ...next[i], videoPrompt: e.target.value };
                    setOutputs(next);
                  }}
                  className="min-h-20 w-full resize-none overflow-hidden bg-white px-5 py-3 font-mono text-sm leading-relaxed text-gray-700 focus:outline-none"
                  spellCheck={false}
                />
              </div>

              {/* TikTok Product Name & Description Section */}
              <div className="border-t border-gray-100">
                <div className="bg-rose-50/50 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                    <Package className="h-3.5 w-3.5" />
                    TikTok Product Info (Editable)
                  </span>
                </div>
                <div className="space-y-3 px-5 py-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Product Name{" "}
                      <span className="text-gray-400">(max 30 chars)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={30}
                      value={o.tiktokProductName}
                      onChange={(e) => {
                        const next = [...outputs];
                        next[i] = {
                          ...next[i],
                          tiktokProductName: e.target.value,
                        };
                        setOutputs(next);
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      placeholder="Clean product name..."
                    />
                    <span className="mt-0.5 block text-right text-[10px] text-gray-400">
                      {o.tiktokProductName.length}/30
                    </span>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Description + Hashtags
                    </label>
                    <textarea
                      value={o.tiktokDescription}
                      onChange={(e) => {
                        const next = [...outputs];
                        next[i] = {
                          ...next[i],
                          tiktokDescription: e.target.value,
                        };
                        setOutputs(next);
                      }}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      placeholder="Product description with hashtags..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Caption{" "}
                      <span className="text-gray-400">(post caption)</span>
                    </label>
                    <textarea
                      value={o.tiktokCaption}
                      onChange={(e) => {
                        const next = [...outputs];
                        next[i] = {
                          ...next[i],
                          tiktokCaption: e.target.value,
                        };
                        setOutputs(next);
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      placeholder="TikTok post caption..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Hashtags{" "}
                      <span className="text-gray-400">(comma separated)</span>
                    </label>
                    <input
                      type="text"
                      value={(o.tiktokHashtags || []).join(", ")}
                      onChange={(e) => {
                        const next = [...outputs];
                        next[i] = {
                          ...next[i],
                          tiktokHashtags: e.target.value
                            .split(",")
                            .map((t) => t.trim().replace(/^#/, ""))
                            .filter(Boolean),
                        };
                        setOutputs(next);
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      placeholder="fyp, tiktokshop, bestseller..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
