"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  Clapperboard,
  Upload,
  Sparkles,
  Send,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  Save,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Video,
  FolderOpen,
  Plus,
  X,
} from "lucide-react";

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
}

interface VideoTemplate {
  id: string;
  name: string;
  backgroundImage: string;
  backgroundDesc: string;
  modelImage: string;
  modelDesc: string;
  createdAt: string;
}

interface SceneOutput {
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  tiktokProductName: string;
  tiktokDescription: string;
  tiktokCaption: string;
  tiktokHashtags: string[];
  selected: boolean;
}

const VIDEO_TYPES: Record<string, string> = {
  fungsi_produk: "Fungsi Produk",
  review: "Review Style",
  unboxing: "Unboxing Style",
  problem_solution: "Problem-Solution",
};

export default function VideoStudioPage() {
  // Templates
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Background & Model uploads
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgFilename, setBgFilename] = useState("");
  const [bgDesc, setBgDesc] = useState("");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelFilename, setModelFilename] = useState("");
  const [modelDesc, setModelDesc] = useState("");
  const [uploading, setUploading] = useState(false);

  // Product
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [videoType, setVideoType] = useState("fungsi_produk");
  const [loading, setLoading] = useState(true);

  // Scene generation
  const [sceneCount, setSceneCount] = useState(3);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scenes, setScenes] = useState<SceneOutput[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Queue
  const [sendingAll, setSendingAll] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  // UI
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const bgInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
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
  }, [scenes, hasGenerated]);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    setProducts(await res.json());
    setLoading(false);
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/video-templates");
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchTemplates();
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);
  }, [fetchProducts, fetchTemplates]);

  // Load template into form
  const loadTemplate = (t: VideoTemplate) => {
    setBgFilename(t.backgroundImage);
    setBgDesc(t.backgroundDesc);
    setModelFilename(t.modelImage);
    setModelDesc(t.modelDesc);
    if (t.backgroundImage) setBgPreview(`/api/upload/${t.backgroundImage}`);
    else setBgPreview(null);
    if (t.modelImage) setModelPreview(`/api/upload/${t.modelImage}`);
    else setModelPreview(null);
    setBgFile(null);
    setModelFile(null);
  };

  // Upload a file
  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.filename;
  };

  // Handle file select
  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "bg" | "model",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Invalid file type");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10MB");
      return;
    }
    setError("");
    const preview = URL.createObjectURL(file);
    if (type === "bg") {
      setBgFile(file);
      setBgPreview(preview);
      setBgFilename("");
    } else {
      setModelFile(file);
      setModelPreview(preview);
      setModelFilename("");
    }
  };

  // Upload pending files
  const ensureUploads = async () => {
    setUploading(true);
    try {
      let bg = bgFilename;
      let model = modelFilename;
      if (bgFile && !bgFilename) bg = await uploadFile(bgFile);
      if (modelFile && !modelFilename) model = await uploadFile(modelFile);
      setBgFilename(bg);
      setModelFilename(model);
      setUploading(false);
      return { bg, model };
    } catch (e) {
      setUploading(false);
      throw e;
    }
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setError("Template name required");
      return;
    }
    setSavingTemplate(true);
    setError("");
    try {
      const { bg, model } = await ensureUploads();
      const res = await fetch("/api/video-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          backgroundImage: bg,
          backgroundDesc: bgDesc,
          modelImage: model,
          modelDesc: modelDesc,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error);
        return;
      }
      const created = await res.json();
      setSelectedTemplateId(created.id);
      setTemplateName("");
      setShowCreateTemplate(false);
      fetchTemplates();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Delete template
  const handleDeleteTemplate = async (id: string) => {
    await fetch(`/api/video-templates/${id}`, { method: "DELETE" });
    if (selectedTemplateId === id) setSelectedTemplateId("");
    fetchTemplates();
  };

  // Generate scenes
  const handleGenerate = async () => {
    if (!selectedProductId) {
      setError("Pilih produk dulu");
      return;
    }
    if (!apiKey.trim()) {
      setError("Masukkan Gemini API key");
      return;
    }
    if (!bgPreview && !bgFilename) {
      setError("Upload background image dulu");
      return;
    }

    setGenerating(true);
    setError("");
    setHasGenerated(false);
    localStorage.setItem("gemini_api_key", apiKey);

    try {
      await ensureUploads();
      const res = await fetch("/api/prompts/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          platform: "flow",
          mode: "storyline",
          videoType,
          apiKey,
          avatarId: "woman_malay_hijab",
          consistentMode: true,
          sceneCount,
          backgroundDesc:
            bgDesc || "Use the uploaded background image exactly as shown",
          modelDesc: modelDesc || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      setScenes(
        (
          data.variations ||
          ([] as {
            description: string;
            imagePrompt?: string;
            videoPrompt?: string;
            tiktokProductName?: string;
            tiktokDescription?: string;
            tiktokCaption?: string;
            tiktokHashtags?: string[];
          }[])
        ).map(
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
            selected: true,
          }),
        ),
      );
      setHasGenerated(true);
      setQueuedCount(0);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Network error. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // Toggle scene selection
  const toggleScene = (i: number) => {
    const next = [...scenes];
    next[i] = { ...next[i], selected: !next[i].selected };
    setScenes(next);
  };

  // Queue selected scenes to automation
  const handleQueueSelected = async () => {
    const selected = scenes.filter((s) => s.selected);
    if (selected.length === 0) {
      setError("Select at least one scene");
      return;
    }
    setSendingAll(true);
    setError("");
    let count = 0;

    for (const scene of selected) {
      try {
        // Build reference images array from background + model uploads
        const refImages: string[] = [];
        if (bgFilename) refImages.push(bgFilename);
        if (modelFilename) refImages.push(modelFilename);

        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: selectedProductId,
            videoType,
            userImagePrompt: scene.imagePrompt,
            userVideoPrompt: scene.videoPrompt,
            tiktokProductName: scene.tiktokProductName,
            tiktokDescription: scene.tiktokDescription,
            tiktokCaption: scene.tiktokCaption,
            tiktokHashtags: scene.tiktokHashtags,
            templateId: selectedTemplateId || "",
            referenceImages: refImages,
          }),
        });
        if (res.ok) count++;
      } catch {
        /* continue */
      }
    }

    setQueuedCount(count);
    setSendingAll(false);
  };

  const handleCopy = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedImages: string[] = selectedProduct
    ? JSON.parse(selectedProduct.images || "[]")
    : [];
  const selectedCount = scenes.filter((s) => s.selected).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Clapperboard className="h-6 w-6 text-indigo-500" />
          Video Studio
        </h1>
        <p className="text-sm text-gray-500">
          Consistent background & model — generate multiple scenes for video
          creation
        </p>
      </div>

      {/* ─── TEMPLATE SECTION ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Background & Model Template
          </h2>
          <button
            onClick={() => setShowCreateTemplate(!showCreateTemplate)}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            {showCreateTemplate ? <ChevronUp size={14} /> : <Plus size={14} />}
            {showCreateTemplate ? "Close" : "New Template"}
          </button>
        </div>

        {/* Saved templates */}
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setSelectedTemplateId(t.id);
                    loadTemplate(t);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    selectedTemplateId === t.id
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <FolderOpen size={12} className="mr-1 inline" />
                  {t.name}
                </button>
                <button
                  onClick={() => handleDeleteTemplate(t.id)}
                  className="text-gray-300 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload area */}
        <div className="grid grid-cols-2 gap-4">
          {/* Background */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">
              Background Image
            </label>
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e, "bg")}
            />
            <div
              onClick={() => bgInputRef.current?.click()}
              className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30"
            >
              {bgPreview ? (
                <img
                  src={bgPreview}
                  alt="Background"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-6 w-6 text-gray-400" />
                  <p className="mt-1 text-xs text-gray-400">Click to upload</p>
                </div>
              )}
            </div>
            <textarea
              value={bgDesc}
              onChange={(e) => setBgDesc(e.target.value)}
              placeholder="Describe background (e.g., Modern white kitchen with marble countertop...)"
              rows={2}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Model */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">
              Model Image <span className="text-gray-400">(optional)</span>
            </label>
            <input
              ref={modelInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e, "model")}
            />
            <div
              onClick={() => modelInputRef.current?.click()}
              className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/30"
            >
              {modelPreview ? (
                <img
                  src={modelPreview}
                  alt="Model"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-6 w-6 text-gray-400" />
                  <p className="mt-1 text-xs text-gray-400">Click to upload</p>
                </div>
              )}
            </div>
            <textarea
              value={modelDesc}
              onChange={(e) => setModelDesc(e.target.value)}
              placeholder="Describe model (e.g., 25-year-old Malay woman with hijab, casual outfit...)"
              rows={2}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Save as template */}
        {showCreateTemplate && (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={handleSaveTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingTemplate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        )}
      </div>

      {/* ─── PRODUCT & SETTINGS ─── */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Product & Scene Settings
        </h2>

        {loading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
        ) : products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
            No products. Go to Katalog Produk first.
          </div>
        ) : (
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
                  setScenes([]);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Pilih produk --</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.title} {prod.price ? `(${prod.price})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-40">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Marketing Angle
              </label>
              <select
                value={videoType}
                onChange={(e) => setVideoType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Object.entries(VIDEO_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-32">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Scenes
              </label>
              <select
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} scenes
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

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
              </p>
            </div>
          </div>
        )}

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

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !selectedProductId || !bgPreview}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:shadow-none"
        >
          {generating || uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          {uploading
            ? "Uploading..."
            : generating
              ? "Generating Scenes..."
              : `Generate ${sceneCount} Scenes`}
        </button>
      </div>

      {/* ─── SCENE OUTPUTS ─── */}
      {hasGenerated && scenes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-700">
              <Clapperboard size={16} />
              Generated Scenes
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
                onClick={handleQueueSelected}
                disabled={sendingAll || selectedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-orange-600 disabled:opacity-50"
              >
                {sendingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Queue Selected ({selectedCount})
              </button>
            </div>
          </div>

          {scenes.map((s, i) => (
            <div
              key={i}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
                s.selected
                  ? "border-indigo-300 ring-1 ring-indigo-100"
                  : "border-gray-200 opacity-60"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => toggleScene(i)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    Scene {i + 1}: {s.description}
                  </span>
                </label>
              </div>

              {/* Image Prompt */}
              <div className="border-b border-gray-100">
                <div className="flex items-center justify-between bg-amber-50/50 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    <ImageIcon className="h-3.5 w-3.5" /> Image Prompt (First
                    Frame)
                  </span>
                  <button
                    onClick={() => handleCopy(s.imagePrompt, `img-${i}`)}
                    className={`text-[10px] font-bold ${
                      copiedKey === `img-${i}`
                        ? "text-green-600"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {copiedKey === `img-${i}` ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  ref={(el) => {
                    imgRefs.current[i] = el;
                    if (el) adjustHeight(el);
                  }}
                  value={s.imagePrompt}
                  onChange={(e) => {
                    const next = [...scenes];
                    next[i] = { ...next[i], imagePrompt: e.target.value };
                    setScenes(next);
                  }}
                  className="min-h-20 w-full resize-none overflow-hidden bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 focus:outline-none"
                  spellCheck={false}
                />
              </div>

              {/* Video Prompt */}
              <div>
                <div className="flex items-center justify-between bg-blue-50/50 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    <Video className="h-3.5 w-3.5" /> Video Prompt (Motion)
                  </span>
                  <button
                    onClick={() => handleCopy(s.videoPrompt, `vid-${i}`)}
                    className={`text-[10px] font-bold ${
                      copiedKey === `vid-${i}`
                        ? "text-green-600"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {copiedKey === `vid-${i}` ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  ref={(el) => {
                    vidRefs.current[i] = el;
                    if (el) adjustHeight(el);
                  }}
                  value={s.videoPrompt}
                  onChange={(e) => {
                    const next = [...scenes];
                    next[i] = { ...next[i], videoPrompt: e.target.value };
                    setScenes(next);
                  }}
                  className="min-h-20 w-full resize-none overflow-hidden bg-white px-5 py-3 font-mono text-sm leading-relaxed text-gray-700 focus:outline-none"
                  spellCheck={false}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
