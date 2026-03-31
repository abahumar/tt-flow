"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Play,
  RotateCcw,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  PackagePlus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  Download,
} from "lucide-react";

interface VideoJob {
  id: string;
  productId: string;
  status: string;
  videoType: string;
  imagePrompt: string;
  videoPrompt: string;
  imageUrl: string;
  videoUrl: string;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  lastError: string;
  startedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    title: string;
    price: string;
    shopName: string;
    images: string;
  };
}

interface CatalogProduct {
  id: string;
  title: string;
  price: string;
  shopName: string;
  images: string;
  description: string;
  videoReady: boolean;
  _count: { videoJobs: number };
}

interface CustomPrompt {
  id: string;
  name: string;
  imagePrompt: string;
  videoPrompt: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "Menunggu",
    color: "text-gray-500 bg-gray-50",
    icon: Clock,
  },
  generating_image: {
    label: "Image Gen",
    color: "text-blue-600 bg-blue-50",
    icon: Loader2,
  },
  generating_video: {
    label: "Video Gen",
    color: "text-purple-600 bg-purple-50",
    icon: Loader2,
  },
  multi_scene_processing: {
    label: "Multi-Scene",
    color: "text-indigo-600 bg-indigo-50",
    icon: Loader2,
  },
  ready: {
    label: "Ready",
    color: "text-emerald-600 bg-emerald-50",
    icon: CheckCircle2,
  },
  posting: {
    label: "Posting",
    color: "text-orange-600 bg-orange-50",
    icon: Loader2,
  },
  posted: {
    label: "Selesai",
    color: "text-green-600 bg-green-50",
    icon: CheckCircle2,
  },
  failed: { label: "Gagal", color: "text-red-600 bg-red-50", icon: XCircle },
};

const VIDEO_GENRES: Record<string, string> = {
  softsell: "Soft Sell / Lifestyle",
  hardsell: "Hard Sell / Promo",
  comedy: "Comedy / Sketch",
  educational: "Educational / Tips",
  emotional: "Emotional / Storytelling",
  pov: "POV (Point of View)",
  asmr: "ASMR / Satisfying",
  vlog: "Vlog / Day in Life",
  review: "Review Style",
  unboxing: "Unboxing Style",
};

export default function AutomationPage() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);

  // Per-product settings: { [productId]: { videoType, promptId, userImagePrompt, userVideoPrompt } }
  const [productSettings, setProductSettings] = useState<
    Record<
      string,
      {
        videoType: string;
        promptId: string;
        userImagePrompt: string;
        userVideoPrompt: string;
      }
    >
  >({});
  // Track which product cards are expanded to show settings
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );
  // Track which products are currently being added
  const [addingProducts, setAddingProducts] = useState<Set<string>>(new Set());
  // Catalog collapsed state
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data);
    setLoading(false);
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const data = await res.json();
    // Only show products marked as "Siap Video" in Katalog Produk
    setProducts(data.filter((p: CatalogProduct) => p.videoReady));
    setProductsLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchProducts();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs, fetchProducts]);

  useEffect(() => {
    fetch("/api/custom-prompts")
      .then((r) => r.json())
      .then((data) => setCustomPrompts(data));
  }, []);

  const getProductSetting = (productId: string) =>
    productSettings[productId] || {
      videoType: "softsell",
      promptId: "",
      userImagePrompt: "",
      userVideoPrompt: "",
    };

  const updateProductSetting = (
    productId: string,
    field: "videoType" | "promptId" | "userImagePrompt" | "userVideoPrompt",
    value: string,
  ) => {
    setProductSettings((prev) => ({
      ...prev,
      [productId]: { ...getProductSetting(productId), [field]: value },
    }));
  };

  const toggleExpanded = (productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleRemoveFromReady = async (productId: string) => {
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoReady: false }),
    });
    fetchProducts();
  };

  const handleAddSingleToQueue = async (productId: string) => {
    setAddingProducts((prev) => new Set(prev).add(productId));
    const settings = getProductSetting(productId);
    const isUserDefined = settings.promptId === "__user_defined__";
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        videoType: settings.videoType,
        ...(isUserDefined
          ? {
              userImagePrompt: settings.userImagePrompt,
              userVideoPrompt: settings.userVideoPrompt,
            }
          : { customPromptId: settings.promptId || undefined }),
      }),
    });
    setAddingProducts((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
    fetchJobs();
    fetchProducts();
  };

  const queueJobs = jobs.filter((j) =>
    [
      "pending",
      "generating_image",
      "generating_video",
      "multi_scene_processing",
      "posting",
    ].includes(j.status),
  );
  const logJobs = jobs.filter((j) =>
    ["ready", "posted", "failed"].includes(j.status),
  );

  const statusCounts = jobs.reduce(
    (acc, j) => {
      if (j.status === "pending") acc.waiting++;
      else if (
        [
          "generating_image",
          "generating_video",
          "posting",
          "multi_scene_processing",
        ].includes(j.status)
      )
        acc.processing++;
      else if (j.status === "posted") acc.done++;
      else if (j.status === "failed") acc.failed++;
      else if (j.status === "ready") acc.done++;
      return acc;
    },
    { waiting: 0, processing: 0, done: 0, failed: 0 },
  );

  const total = jobs.length;
  const completed = statusCounts.done;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleStartAuto = async () => {
    const res = await fetch("/api/jobs/start-auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to start automation");
    }
    fetchJobs();
  };

  const handleResetQueue = async () => {
    if (!confirm("Reset all pending/failed jobs to pending?")) return;
    await fetch("/api/jobs/reset", { method: "POST" });
    fetchJobs();
  };

  const handleClearQueue = async () => {
    if (!confirm("Delete ALL jobs from the queue? This cannot be undone."))
      return;
    await fetch("/api/jobs", { method: "DELETE" });
    fetchJobs();
  };

  const handleDeleteJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    fetchJobs();
  };

  const handleRetryJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "pending",
        errorMessage: "",
        lastError: "",
        retryCount: 0,
        startedAt: null,
      }),
    });
    fetchJobs();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automation</h1>
        <p className="text-sm text-gray-500">
          Select products from catalog, configure prompts individually, and add
          to queue
        </p>
      </div>

      {/* ─── Product Catalog ─── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <button
          onClick={() => setCatalogCollapsed(!catalogCollapsed)}
          className="flex w-full items-center justify-between"
        >
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Produk Siap Video ({products.length})
          </p>
          {catalogCollapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {!catalogCollapsed && (
          <>
            {productsLoading ? (
              <p className="py-4 text-center text-gray-400 text-sm">
                Loading products...
              </p>
            ) : products.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
                Belum ada produk. Klik &ldquo;Create Video&rdquo; di Katalog
                Produk dulu.
              </div>
            ) : (
              <div className="max-h-125 overflow-y-auto space-y-2">
                {products.map((product) => {
                  const images: string[] = JSON.parse(product.images || "[]");
                  const isExpanded = expandedProducts.has(product.id);
                  const isAdding = addingProducts.has(product.id);
                  const settings = getProductSetting(product.id);
                  const selectedPrompt = customPrompts.find(
                    (p) => p.id === settings.promptId,
                  );

                  return (
                    <div
                      key={product.id}
                      className="rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      {/* Product row */}
                      <div className="flex items-center gap-3 p-2.5">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {images[0] ? (
                            <img
                              src={images[0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[9px] text-gray-400">
                              N/A
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {product.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {product.shopName && (
                              <span>{product.shopName} &middot; </span>
                            )}
                            {product.price && (
                              <span>{product.price} &middot; </span>
                            )}
                            {product._count.videoJobs} job(s)
                          </p>
                        </div>

                        {/* Compact prompt indicator */}
                        {selectedPrompt && (
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                            <Sparkles className="h-2.5 w-2.5" />
                            {selectedPrompt.name}
                          </span>
                        )}

                        {/* Settings toggle */}
                        <button
                          onClick={() => toggleExpanded(product.id)}
                          className="rounded-md border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                          title="Configure prompt & style"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {/* Add to Queue button */}
                        <button
                          onClick={() => handleAddSingleToQueue(product.id)}
                          disabled={isAdding}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PackagePlus className="h-3.5 w-3.5" />
                          )}
                          {isAdding ? "Adding..." : "Add to Queue"}
                        </button>

                        {/* Remove from ready */}
                        <button
                          onClick={() => handleRemoveFromReady(product.id)}
                          className="rounded-md border border-gray-200 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="Remove from Produk Siap Video"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Expanded settings */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-2">
                          <div className="flex flex-wrap gap-4">
                            {/* Video Type */}
                            <div className="flex-1 min-w-45">
                              <label className="mb-1 block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                Video Genre
                              </label>
                              <select
                                value={settings.videoType}
                                onChange={(e) =>
                                  updateProductSetting(
                                    product.id,
                                    "videoType",
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              >
                                {Object.entries(VIDEO_GENRES).map(
                                  ([key, label]) => (
                                    <option key={key} value={key}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>

                            {/* Custom Prompt */}
                            <div className="flex-1 min-w-45">
                              <label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                <Sparkles className="h-2.5 w-2.5" />
                                Custom Prompt
                              </label>
                              <select
                                value={settings.promptId}
                                onChange={(e) =>
                                  updateProductSetting(
                                    product.id,
                                    "promptId",
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              >
                                <option value="">Default Template</option>
                                <option value="__user_defined__">
                                  ✏️ User Defined
                                </option>
                                {customPrompts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              {settings.promptId &&
                                settings.promptId !== "__user_defined__" && (
                                  <p className="mt-0.5 text-[10px] text-rose-500">
                                    Overrides default templates
                                  </p>
                                )}
                            </div>
                          </div>

                          {/* User Defined Prompt Fields */}
                          {settings.promptId === "__user_defined__" && (
                            <div className="space-y-2 mt-2">
                              <p className="text-[10px] text-rose-500">
                                Enter your own prompts. Use {"{title}"},{" "}
                                {"{description}"}, {"{price}"} as placeholders.
                              </p>
                              <div>
                                <label className="mb-1 block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                  Image Creation Prompt
                                </label>
                                <textarea
                                  value={settings.userImagePrompt}
                                  onChange={(e) =>
                                    updateProductSetting(
                                      product.id,
                                      "userImagePrompt",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="e.g. Create a product photo of {title} with clean white background..."
                                  rows={3}
                                  className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 resize-y"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                                  Video Prompt
                                </label>
                                <textarea
                                  value={settings.userVideoPrompt}
                                  onChange={(e) =>
                                    updateProductSetting(
                                      product.id,
                                      "userVideoPrompt",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="e.g. Create a 15-second video showcasing {title}..."
                                  rows={3}
                                  className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 resize-y"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Queue List ─── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Queue ({total} job{total !== 1 ? "s" : ""})
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetQueue}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              onClick={handleClearQueue}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Clear All
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                {completed} / {total} selesai
              </span>
              <span
                className={
                  progress === 100
                    ? "text-green-600 font-bold"
                    : "text-rose-500 font-bold"
                }
              >
                {progress}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-rose-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Status summary */}
        {total > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <MiniStat
              icon={Clock}
              label="Menunggu"
              count={statusCounts.waiting}
              color="text-gray-500"
            />
            <MiniStat
              icon={Loader2}
              label="Proses"
              count={statusCounts.processing}
              color="text-blue-500"
            />
            <MiniStat
              icon={CheckCircle2}
              label="Selesai"
              count={statusCounts.done}
              color="text-green-500"
            />
            <MiniStat
              icon={XCircle}
              label="Gagal"
              count={statusCounts.failed}
              color="text-red-500"
            />
          </div>
        )}

        {/* Job list — only pending/processing jobs */}
        {loading ? (
          <p className="py-6 text-center text-gray-400 text-sm">Loading...</p>
        ) : queueJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
            Queue kosong. Tambahkan produk dari katalog di atas.
          </div>
        ) : (
          <div className="max-h-100 overflow-y-auto space-y-1.5">
            {queueJobs.map((job) => {
              const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const images: string[] = JSON.parse(job.product?.images || "[]");
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-2.5"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {images[0] ? (
                      <img
                        src={images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-gray-400">
                        N/A
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {job.product?.title ||
                        (job.imageOnly ? "Image Only" : "No Product")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {job.imageOnly
                        ? "Image Generation"
                        : VIDEO_GENRES[job.videoType] || job.videoType}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}
                  >
                    <Icon
                      className={`h-3 w-3 ${job.status.includes("generating") || job.status === "posting" || job.status === "multi_scene_processing" ? "animate-spin" : ""}`}
                    />
                    {cfg.label}
                  </span>
                  {job.status === "pending" && (
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="rounded-md p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove from queue"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Start Full Auto - below the queue */}
        <div className="border-t border-gray-100 pt-3 flex items-center gap-3">
          <button
            onClick={handleStartAuto}
            disabled={statusCounts.waiting === 0}
            className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4" /> Start Full Auto
          </button>
          <span className="text-xs text-gray-400">
            {statusCounts.waiting > 0
              ? `${statusCounts.waiting} job(s) menunggu`
              : "Tidak ada job menunggu"}
          </span>
        </div>
      </div>

      {/* ─── Job Process Log ─── */}
      {logJobs.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Log ({logJobs.length} job{logJobs.length !== 1 ? "s" : ""})
            </h2>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {logJobs.map((job) => {
              const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const images: string[] = JSON.parse(job.product?.images || "[]");
              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 ${job.status === "failed" ? "border-red-100 bg-red-50/30" : "border-gray-100 bg-white"}`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {images[0] ? (
                      <img
                        src={images[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-gray-400">
                        N/A
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {job.product?.title ||
                        (job.imageOnly ? "Image Only" : "No Product")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {job.imageOnly
                        ? "Image Generation"
                        : VIDEO_GENRES[job.videoType] || job.videoType}
                    </p>
                    {job.errorMessage && (
                      <p
                        className="text-[10px] text-red-500 truncate mt-0.5"
                        title={job.errorMessage}
                      >
                        <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cfg.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                  {(job.status === "ready" || job.status === "posted") &&
                    job.videoUrl && (
                      <a
                        href={job.videoUrl}
                        download={`${job.product?.title || job.id}.mp4`}
                        className="rounded-md p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title="Download video"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  {job.status === "failed" && (
                    <button
                      onClick={() => handleRetryJob(job.id)}
                      className="rounded-md p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      title="Retry this job"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    className="rounded-md p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove from log"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 px-2.5 py-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className={`text-sm font-bold ${color}`}>{count}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}
