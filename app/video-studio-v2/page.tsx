"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  Sparkles,
  Plus,
  User,
  Box,
  X,
  Smile,
  BookOpen,
  Heart,
  ShoppingBag,
  Coffee,
  Eye,
  EyeOff,
  Mic,
  Video,
  Send,
  RefreshCw,
  FileText,
} from "lucide-react";

// ─── Types ───

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
  usp: string;
  targetAudience: string;
}

interface SceneResult {
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  visualPromptEn: string;
  script: string;
  dialogEnglish: string;
  time: string;
  stage: string;
  tiktokProductName: string;
  tiktokDescription: string;
  tiktokCaption: string;
  tiktokHashtags: string[];
  overlayText: string;
  overlayPosition: "top" | "bottom" | "center";
  selected: boolean;
}

interface GempakResult {
  scriptTitle: string;
  hookTitle: string;
  hookSubtitle: string;
  visualDna: string;
  genreStyle: string;
  variations: Omit<SceneResult, "selected">[];
}

// ─── Constants ───

const GENRES = [
  {
    id: "comedy",
    label: "Kelakar",
    icon: Smile,
    color: "text-yellow-600",
    border: "border-yellow-400",
    bg: "bg-yellow-50",
  },
  {
    id: "educational",
    label: "Tips/Ilmiah",
    icon: BookOpen,
    color: "text-blue-600",
    border: "border-blue-400",
    bg: "bg-blue-50",
  },
  {
    id: "emotional",
    label: "Emosi/Sedih",
    icon: Heart,
    color: "text-pink-600",
    border: "border-pink-400",
    bg: "bg-pink-50",
  },
  {
    id: "hardsell",
    label: "Hard Sell",
    icon: ShoppingBag,
    color: "text-red-600",
    border: "border-red-400",
    bg: "bg-red-50",
  },
  {
    id: "softsell",
    label: "Soft Sell",
    icon: Coffee,
    color: "text-teal-600",
    border: "border-teal-400",
    bg: "bg-teal-50",
  },
  {
    id: "pov",
    label: "POV (Situasi)",
    icon: Eye,
    color: "text-purple-600",
    border: "border-purple-400",
    bg: "bg-purple-50",
  },
  {
    id: "asmr",
    label: "ASMR",
    icon: Mic,
    color: "text-indigo-600",
    border: "border-indigo-400",
    bg: "bg-indigo-50",
  },
  {
    id: "vlog",
    label: "Vlog Harian",
    icon: Video,
    color: "text-orange-600",
    border: "border-orange-400",
    bg: "bg-orange-50",
  },
] as const;

const PERSONAS = [
  { id: "woman_malay_hijab", label: "Wanita Melayu (Bertudung)", icon: User },
  { id: "woman_malay_freehair", label: "Wanita Melayu (Moden)", icon: User },
  {
    id: "woman_malay_corporate",
    label: "Wanita Melayu (Korporat)",
    icon: User,
  },
  { id: "product_only", label: "Produk Sahaja", icon: Box },
  { id: "man_malay_casual", label: "Lelaki Melayu (Casual)", icon: User },
  { id: "man_malay_corporate", label: "Lelaki Melayu (Korporat)", icon: User },
] as const;

// ─── Component ───

export default function VideoStudioV2Page() {
  // Product source
  const [productMode, setProductMode] = useState<"upload" | "catalog">(
    "upload",
  );
  const [productFile, setProductFile] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productFilename, setProductFilename] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productsLoading, setProductsLoading] = useState(false);

  // Inputs
  const [productName, setProductName] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [productUsp, setProductUsp] = useState("");
  const [productTargetAudience, setProductTargetAudience] = useState("");
  const [genre, setGenre] = useState("comedy");
  const [personaType, setPersonaType] = useState("woman_malay_hijab");
  const [numScenes, setNumScenes] = useState(5);
  const [includeDialog, setIncludeDialog] = useState(true);
  const [includeEnglishDialog, setIncludeEnglishDialog] = useState(false);
  const [varyBackground, setVaryBackground] = useState(false);

  // Model face
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelFilename, setModelFilename] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // API
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Generation
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [result, setResult] = useState<GempakResult | null>(null);
  const [scenes, setScenes] = useState<SceneResult[]>([]);

  // Queue
  const [sendingToFlow, setSendingToFlow] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  // Hook & Combine
  const [hookTitle, setHookTitle] = useState("");
  const [hookSubtitle, setHookSubtitle] = useState("");
  const [enableHook, setEnableHook] = useState(false);
  const [overlayFontSize, setOverlayFontSize] = useState(48);
  const [combining, setCombining] = useState(false);
  const [combinedVideoUrl, setCombinedVideoUrl] = useState("");
  const [combineError, setCombineError] = useState("");
  const [lastJobId, setLastJobId] = useState("");

  // UI
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Effects ───

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);
  }, []);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) setProducts(await res.json());
    } catch {
      /* ignore */
    }
    setProductsLoading(false);
  }, []);

  useEffect(() => {
    if (productMode === "catalog") fetchProducts();
  }, [productMode, fetchProducts]);

  // ─── Handlers ───

  // Upload a file to server
  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.filename;
  };

  // Ensure pending files are uploaded before generate/queue
  const ensureUploads = async () => {
    setUploading(true);
    try {
      let prod = productFilename;
      let model = modelFilename;
      console.log("[V2 ensureUploads] before:", {
        prod,
        model,
        hasProductFile: !!productFile,
        hasModelFile: !!modelFile,
      });
      if (productFile && !productFilename) prod = await uploadFile(productFile);
      if (modelFile && !modelFilename) model = await uploadFile(modelFile);
      console.log("[V2 ensureUploads] after:", { prod, model });
      setProductFilename(prod);
      setModelFilename(model);
      setUploading(false);
      return { prod, model };
    } catch (e) {
      console.error("[V2 ensureUploads] error:", e);
      setUploading(false);
      throw e;
    }
  };

  const handleProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Invalid file type. Allowed: PNG, JPEG, WebP");
      return;
    }
    setProductFile(file);
    setProductPreview(URL.createObjectURL(file));
    setProductFilename("");
    setError(null);
    setResult(null);
    setScenes([]);
    e.target.value = "";
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Invalid file type. Allowed: PNG, JPEG, WebP");
      return;
    }
    setModelFile(file);
    setModelPreview(URL.createObjectURL(file));
    setModelFilename("");
    e.target.value = "";
  };

  const handleGenerate = async () => {
    // Validate
    if (productMode === "upload" && !productFile && !productFilename) {
      setError("Sila upload gambar produk dahulu.");
      return;
    }
    if (productMode === "catalog" && !selectedProductId) {
      setError("Sila pilih produk dari katalog.");
      return;
    }
    if (!apiKey.trim()) {
      setError("Masukkan Gemini API key.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setScenes([]);
    setQueuedCount(0);
    localStorage.setItem("gemini_api_key", apiKey);

    try {
      const uploads = await ensureUploads();

      const body: Record<string, unknown> = {
        mode: "gempak",
        videoType: genre,
        apiKey,
        avatarId: modelPreview ? "custom" : personaType,
        sceneCount: numScenes,
        includeDialog,
        includeEnglishDialog,
        varyBackground,
        modelDesc:
          modelDesc ||
          (uploads.model
            ? "Use the uploaded model reference image exactly as shown"
            : ""),
      };

      if (productMode === "catalog") {
        body.productId = selectedProductId;
        // Allow overriding USP/audience from catalog product
        if (productUsp) body.customUsp = productUsp;
        if (productTargetAudience)
          body.customTargetAudience = productTargetAudience;
      } else {
        body.customProduct = {
          description: `${productName}${additionalContext ? `. ${additionalContext}` : ""}`,
          usp: productUsp || "",
          targetAudience: productTargetAudience || "",
        };
      }

      const res = await fetch("/api/prompts/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      setResult({
        scriptTitle: data.scriptTitle,
        hookTitle: data.hookTitle || "",
        hookSubtitle: data.hookSubtitle || "",
        visualDna: data.visualDna,
        genreStyle: data.genreStyle,
        variations: data.variations,
      });

      setScenes(
        data.variations.map((v: Omit<SceneResult, "selected">) => ({
          ...v,
          overlayText: v.overlayText || "",
          overlayPosition: v.overlayPosition || "bottom",
          selected: true,
        })),
      );

      // Set hook title from AI response
      if (data.hookTitle) {
        setHookTitle(data.hookTitle);
        setHookSubtitle(data.hookSubtitle || "");
        setEnableHook(true);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Network error. Sila cuba lagi.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQueueSelected = async () => {
    const selected = scenes.filter((s) => s.selected);
    if (selected.length === 0) {
      setError("Pilih sekurang-kurangnya satu scene.");
      return;
    }

    setSendingToFlow(true);
    setError(null);

    try {
      const uploads = await ensureUploads();

      const refImages: string[] = [];
      if (uploads.prod) refImages.push(uploads.prod);
      if (uploads.model) refImages.push(uploads.model);
      console.log(
        "[V2 Queue] refImages:",
        refImages,
        "prod:",
        uploads.prod,
        "model:",
        uploads.model,
      );
      const scene1 = selected[0];
      const allScenePrompts = selected.map((s) => ({
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt,
      }));

      // Build overlayConfig for auto-combine
      const overlays = selected.map((s) => ({
        text: s.overlayText || "",
        position: s.overlayPosition || "bottom",
      }));
      const overlayConfig = JSON.stringify({
        hookTitle: enableHook ? hookTitle : "",
        hookSubtitle: enableHook ? hookSubtitle : "",
        overlays,
        overlayFontSize,
      });

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: productMode === "catalog" ? selectedProductId : undefined,
          videoType: genre,
          userImagePrompt: scene1.imagePrompt,
          userVideoPrompt: scene1.videoPrompt,
          tiktokProductName: scene1.tiktokProductName,
          tiktokDescription: scene1.tiktokDescription,
          tiktokCaption: scene1.tiktokCaption,
          tiktokHashtags: scene1.tiktokHashtags,
          referenceImages: refImages,
          scenePrompts: JSON.stringify(allScenePrompts),
          overlayConfig,
        }),
      });

      if (res.ok) {
        const jobData = await res.json();
        setQueuedCount(selected.length);
        setLastJobId(jobData.id || "");
        setCombinedVideoUrl("");
      } else {
        setError("Gagal create job. Sila cuba lagi.");
      }
    } catch {
      setError("Network error semasa queue.");
    }

    setSendingToFlow(false);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Combine videos
  const handleCombine = async () => {
    if (!lastJobId) {
      setCombineError("Queue scenes first before combining");
      return;
    }
    setCombining(true);
    setCombineError("");
    setCombinedVideoUrl("");

    try {
      const overlays = scenes.map((s) =>
        s.overlayText
          ? { text: s.overlayText, position: s.overlayPosition }
          : null,
      );

      const res = await fetch(`/api/jobs/${lastJobId}/combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hookTitle: enableHook ? hookTitle : undefined,
          hookSubtitle: enableHook ? hookSubtitle : undefined,
          overlays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCombineError(data.error || "Combine failed");
        return;
      }
      setCombinedVideoUrl(data.combinedVideoUrl);
    } catch {
      setCombineError("Network error during combine");
    } finally {
      setCombining(false);
    }
  };

  const handleDownloadScript = () => {
    if (!result) return;
    const content = `TIKTOK VIRAL SCRIPT (${result.genreStyle})
-------------------
TITLE: ${result.scriptTitle}
VISUAL DNA: ${result.visualDna}
-------------------

${scenes
  .map(
    (s, i) =>
      `[${s.time}] SCENE ${i + 1}: ${s.stage}
DIALOG (BM): "${s.script}"${s.dialogEnglish ? `\nDIALOG (EN): "${s.dialogEnglish}"` : ""}
IMAGE PROMPT: ${s.imagePrompt}
VIDEO PROMPT: ${s.videoPrompt}
-------------------`,
  )
  .join("\n")}

Generated by GempakStudio Engine v2.
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `script-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleScene = (i: number) => {
    setScenes((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], selected: !next[i].selected };
      return next;
    });
  };

  const updateVisualPrompt = (idx: number, newPrompt: string) => {
    setScenes((prev) => {
      const next = [...prev];
      const visualDna = result?.visualDna || "";
      next[idx] = {
        ...next[idx],
        visualPromptEn: newPrompt,
        imagePrompt: `Generate a high-quality 9:16 vertical photo. SCENE: ${newPrompt}. MODEL DNA: ${visualDna}. STYLE: Cinematic, realistic, 8k.`,
      };
      return next;
    });
  };

  const updateVideoPrompt = (idx: number, newPrompt: string) => {
    setScenes((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], videoPrompt: newPrompt };
      return next;
    });
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedCount = scenes.filter((s) => s.selected).length;
  const currentGenre = GENRES.find((g) => g.id === genre);

  // ─── Render ───

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-indigo-500" />
          Video Studio v2
        </h1>
        <p className="text-sm text-gray-500">
          GempakStudio Engine — generate viral TikTok scripts & prompts with AI
        </p>
      </div>
      {/* ─── PRODUCT SOURCE ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Product Source
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setProductMode("upload");
              setSelectedProductId("");
            }}
            className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${productMode === "upload" ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
          >
            <Upload size={12} className="mr-1.5 inline" /> Upload Gambar
          </button>
          <button
            onClick={() => {
              setProductMode("catalog");
              setProductFile(null);
              setProductPreview(null);
              setProductFilename("");
            }}
            className={`rounded-lg border px-4 py-2 text-xs font-medium transition-all ${productMode === "catalog" ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
          >
            <Box size={12} className="mr-1.5 inline" /> Katalog Produk
          </button>
        </div>

        {productMode === "upload" ? (
          <div>
            {!productPreview ? (
              <label className="group relative flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30">
                <div className="flex flex-col items-center justify-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-600">
                    Upload Produk Anda
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    AI akan bina skrip & visual direction
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleProductUpload}
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-medium text-gray-500">
                    Product Image
                  </h2>
                  <button
                    onClick={() => {
                      setProductFile(null);
                      setProductPreview(null);
                      setProductFilename("");
                      setResult(null);
                      setScenes([]);
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    Reset
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200">
                    <img
                      src={productPreview}
                      alt="Product"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400">
                    <Plus size={16} className="text-gray-400" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleProductUpload}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {productsLoading ? (
              <p className="py-4 text-center text-sm text-gray-400">
                Loading produk...
              </p>
            ) : products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
                Tiada produk. Pergi ke Katalog Produk dulu.
              </div>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setResult(null);
                    setScenes([]);
                    // Auto-populate USP/audience from catalog product
                    const p = products.find((pr) => pr.id === e.target.value);
                    if (p) {
                      setProductUsp(p.usp || "");
                      setProductTargetAudience(p.targetAudience || "");
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih produk --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.price ? `(${p.price})` : ""}
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="flex items-start gap-4 rounded-lg bg-gray-50 p-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                      {JSON.parse(selectedProduct.images || "[]")[0] ? (
                        <img
                          src={JSON.parse(selectedProduct.images)[0]}
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── GENRE SELECTOR ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Genre Video
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {GENRES.map((g) => {
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 transition-all ${genre === g.id ? `${g.bg} ${g.border} ${g.color} shadow-sm ring-1 ${g.color.replace("text", "ring")}` : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
              >
                <Icon size={16} />
                <span className="text-xs font-medium">{g.label}</span>
                {genre === g.id && (
                  <div className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-current" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SETTINGS ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Settings
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Produk
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="cth: Sambal Nyet Level 10..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Offer / Vibe
            </label>
            <input
              type="text"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="cth: Promo Raya, Buy 1 Free 1..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* USP & Target Audience */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              USP / Kelebihan Utama
            </label>
            <textarea
              value={productUsp}
              onChange={(e) => setProductUsp(e.target.value)}
              placeholder="cth: Tahan 24 jam, tanpa paraben, kulit glowing 7 hari..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Target Audience
            </label>
            <textarea
              value={productTargetAudience}
              onChange={(e) => setProductTargetAudience(e.target.value)}
              placeholder="cth: Ibu-ibu busy, remaja kulit berjerawat, pekerja ofis..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Scene Count */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Bilangan Babak (Scenes)
          </label>
          <div className="flex gap-2">
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                onClick={() => setNumScenes(n)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-all ${numScenes === n ? "border-indigo-400 bg-indigo-600 text-white shadow-sm" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Model / Avatar */}
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <User size={12} /> Model / Avatar
          </label>

          {/* Custom model face upload */}
          <div className="mb-3">
            <input
              ref={modelInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleModelUpload}
            />
            {modelPreview ? (
              <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
                <img
                  src={modelPreview}
                  alt="Model"
                  className="h-16 w-16 shrink-0 rounded-lg border border-purple-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-purple-700">
                    Custom Model Face
                  </p>
                  <textarea
                    value={modelDesc}
                    onChange={(e) => setModelDesc(e.target.value)}
                    placeholder="Describe model (optional) — e.g., 25 tahun, pakai hijab biru..."
                    rows={2}
                    className="mt-1 w-full rounded border border-purple-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
                <button
                  onClick={() => {
                    setModelFile(null);
                    setModelPreview(null);
                    setModelFilename("");
                    setModelDesc("");
                  }}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => modelInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-3 text-xs font-medium text-gray-500 transition-colors hover:border-purple-400 hover:bg-purple-50/30 hover:text-purple-600"
              >
                <Upload size={14} /> Upload Muka Model Sendiri
              </button>
            )}
          </div>

          {/* Preset personas — dimmed when custom model uploaded */}
          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${modelPreview ? "pointer-events-none opacity-40" : ""}`}
          >
            {PERSONAS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPersonaType(p.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all ${!modelPreview && personaType === p.id ? "border-purple-400 bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                >
                  <Icon size={14} /> {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dialog Toggles */}
        <div className="flex gap-3">
          <button
            onClick={() => setIncludeDialog(!includeDialog)}
            className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all ${includeDialog ? "border-black bg-black text-white shadow-md" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
          >
            Dialog Melayu: {includeDialog ? "On" : "Off"}
          </button>
          <button
            onClick={() => setIncludeEnglishDialog(!includeEnglishDialog)}
            className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all ${includeEnglishDialog ? "border-black bg-black text-white shadow-md" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
          >
            Dialog English: {includeEnglishDialog ? "On" : "Off"}
          </button>
        </div>

        {/* Background Variation Toggle */}
        <div>
          <button
            onClick={() => setVaryBackground(!varyBackground)}
            className={`w-full rounded-xl border py-2.5 text-xs font-bold transition-all ${varyBackground ? "border-teal-500 bg-teal-500 text-white shadow-md" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
          >
            Tukar Background Setiap Scene: {varyBackground ? "On" : "Off"}
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
              placeholder="AIza..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={
            loading ||
            uploading ||
            (productMode === "upload" && !productFile && !productFilename) ||
            (productMode === "catalog" && !selectedProductId)
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : result ? (
            <RefreshCw className="h-5 w-5" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          {loading
            ? "Generating..."
            : result
              ? "Jana Semula"
              : `Generate ${numScenes} Scenes`}
        </button>
      </div>

      {/* ─── ERROR ─── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* ─── RESULTS ─── */}
      {result && scenes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-700">
              <Sparkles size={16} />
              {result.scriptTitle}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {selectedCount}/{scenes.length} selected
              </span>
            </h2>
            <div className="flex items-center gap-2">
              {queuedCount > 0 && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                  ✓ {queuedCount} queued
                </span>
              )}
              <button
                onClick={handleDownloadScript}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <FileText size={12} /> Script
              </button>
              <button
                onClick={handleQueueSelected}
                disabled={sendingToFlow || selectedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-orange-600 disabled:opacity-50"
              >
                {sendingToFlow ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Queue Selected ({selectedCount})
              </button>
            </div>
          </div>

          {/* Visual DNA Card */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              Visual DNA
            </p>
            <p className="text-xs italic leading-relaxed text-gray-600">
              {result.visualDna}
            </p>
          </div>

          {scenes.map((scene, idx) => (
            <div
              key={idx}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
                scene.selected
                  ? "border-indigo-300 ring-1 ring-indigo-100"
                  : "border-gray-200 opacity-60"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={scene.selected}
                    onChange={() => toggleScene(idx)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                      Scene {idx + 1}: {scene.stage.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {scene.time}
                    </span>
                    {idx === 0 && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">
                        Master
                      </span>
                    )}
                  </div>
                </label>
              </div>

              <div className="space-y-0">
                {/* Dialog */}
                {scene.script && (
                  <div className="border-b border-gray-100 px-5 py-3">
                    <p className="text-sm font-medium italic leading-relaxed text-gray-800">
                      &ldquo;{scene.script}&rdquo;
                    </p>
                    {scene.dialogEnglish && (
                      <p className="mt-1 text-xs italic text-gray-400">
                        &ldquo;{scene.dialogEnglish}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Visual Prompt (editable) */}
                <div className="border-b border-gray-100">
                  <div className="flex items-center justify-between bg-amber-50/50 px-5 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      <Sparkles className="h-3.5 w-3.5" /> Image Prompt
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(scene.visualPromptEn, `visual-${idx}`)
                      }
                      className={`text-[10px] font-bold ${
                        copiedKey === `visual-${idx}`
                          ? "text-green-600"
                          : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {copiedKey === `visual-${idx}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    value={scene.visualPromptEn}
                    onChange={(e) => updateVisualPrompt(idx, e.target.value)}
                    className="min-h-20 w-full resize-y bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 focus:outline-none"
                    rows={5}
                    spellCheck={false}
                  />
                </div>

                {/* Video Motion Prompt (editable) */}
                <div>
                  <div className="flex items-center justify-between bg-blue-50/50 px-5 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      <Video className="h-3.5 w-3.5" /> Video Prompt (Motion)
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(scene.videoPrompt, `video-${idx}`)
                      }
                      className={`text-[10px] font-bold ${
                        copiedKey === `video-${idx}`
                          ? "text-green-600"
                          : "text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {copiedKey === `video-${idx}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    value={scene.videoPrompt}
                    onChange={(e) => updateVideoPrompt(idx, e.target.value)}
                    className="min-h-20 w-full resize-y bg-white px-5 py-3 font-mono text-sm leading-relaxed text-gray-700 focus:outline-none"
                    rows={2}
                    spellCheck={false}
                  />
                </div>

                {/* Text Overlay (optional) */}
                <div className="border-t border-gray-100">
                  <div className="flex items-center justify-between bg-green-50/50 px-5 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                      📝 Text Overlay (Optional)
                    </span>
                    <select
                      value={scene.overlayPosition}
                      onChange={(e) => {
                        setScenes((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            overlayPosition: e.target.value as
                              | "top"
                              | "bottom"
                              | "center",
                          };
                          return next;
                        });
                      }}
                      className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 focus:outline-none"
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={scene.overlayText}
                    onChange={(e) => {
                      setScenes((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          overlayText: e.target.value,
                        };
                        return next;
                      });
                    }}
                    placeholder="e.g. Tahan 24 Jam, Kulit Glowing!"
                    className="w-full bg-white px-5 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none"
                    maxLength={200}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* ─── HOOK TITLE & COMBINE CONFIG ─── */}
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Video Combine Settings (Optional)
              </h2>

              {/* Hook Title Toggle */}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableHook}
                  onChange={(e) => setEnableHook(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-gray-600">
                  Include Title Hook (intro card)
                </span>
              </label>

              {enableHook && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Hook Title
                    </label>
                    <input
                      type="text"
                      value={hookTitle}
                      onChange={(e) => setHookTitle(e.target.value)}
                      placeholder="e.g. Rahsia Kulit Glowing!"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Subtitle (optional)
                    </label>
                    <input
                      type="text"
                      value={hookSubtitle}
                      onChange={(e) => setHookSubtitle(e.target.value)}
                      placeholder="e.g. Product name or tagline"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={150}
                    />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-gray-400">
                Edit text overlays per scene above. When you click Queue, settings are saved.
                Video will auto-combine after all scenes finish generating.
              </p>

              {/* Overlay Font Size */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Overlay Text Size: {overlayFontSize}px
                </label>
                <input
                  type="range"
                  min={24}
                  max={96}
                  step={2}
                  value={overlayFontSize}
                  onChange={(e) => setOverlayFontSize(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>24px (kecil)</span>
                  <span>96px (besar)</span>
                </div>
              </div>

              {combineError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {combineError}
                </div>
              )}

              {/* Re-combine button (only shows after queuing) */}
              {lastJobId && (
                <button
                  onClick={handleCombine}
                  disabled={combining}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-gray-700 disabled:opacity-50"
                >
                  {combining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {combining ? "Combining..." : "Re-combine (Manual)"}
                </button>
              )}

              {/* Combined video preview */}
              {combinedVideoUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-green-700">
                    ✓ Video combined successfully!
                  </p>
                  <video
                    src={combinedVideoUrl}
                    controls
                    className="w-full rounded-lg border border-gray-200"
                    style={{ maxHeight: "400px" }}
                  />
                  <a
                    href={combinedVideoUrl}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Download Combined Video
                  </a>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
}
