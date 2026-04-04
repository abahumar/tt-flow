"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Video,
  RefreshCw,
  ExternalLink,
  Chrome,
  PenLine,
  Loader2,
  CheckCircle2,
  Upload,
  List,
  FileText,
  AlertCircle,
  Check,
  X,
} from "lucide-react";

interface Product {
  id: string;
  url: string;
  title: string;
  description: string;
  images: string;
  price: string;
  shopName: string;
  usp: string;
  targetAudience: string;
  videoReady: boolean;
  scrapedAt: string;
  _count?: { videoJobs: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [creatingJobId, setCreatingJobId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    usp: string;
    targetAudience: string;
  }>({ usp: "", targetAudience: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    created: number;
    skippedExisting: number;
    skippedQueued: number;
    skippedInvalid: number;
    details: { url: string; status: string; reason?: string }[];
  } | null>(null);
  const [manual, setManual] = useState({
    url: "",
    title: "",
    description: "",
    price: "",
    shopName: "",
    usp: "",
    targetAudience: "",
  });

  // Convert product ID or URL to a full TikTok Shop URL
  const toProductUrl = (input: string): string => {
    const trimmed = input.trim();
    // If it's already a URL, return as-is
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    // If it looks like a product ID (10+ digit number), convert to URL
    if (/^\d{10,}$/.test(trimmed)) {
      return `https://shop.tiktok.com/view/product/${trimmed}`;
    }
    return trimmed;
  };

  const fetchProducts = async () => {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Method 1: Scrape via Chrome extension (sends URL, extension opens tab and scrapes)
  const handleScrapeViaExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setScraping(true);

    const productUrl = toProductUrl(url);

    // Try to communicate with the extension
    try {
      // Check if extension is available by trying to send a message via a custom event
      const extensionId = await getExtensionId();
      if (extensionId) {
        // Use chrome.runtime.sendMessage via external messaging
        const result = await sendToExtension(extensionId, {
          type: "SCRAPE_PRODUCT_BY_URL",
          payload: { url: productUrl },
        });

        if (result?.success) {
          setUrl("");
          fetchProducts();
          setScraping(false);
          return;
        }
      }
    } catch {
      // Extension not available, fall through
    }

    // Fallback: try server-side (will likely fail with security check)
    const res = await fetch("/api/products/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: productUrl }),
    });

    if (res.ok) {
      setUrl("");
      fetchProducts();
    } else {
      const err = await res.json();
      if (err.needsExtension) {
        alert(
          "TikTok blocks direct scraping.\n\n" +
            "Options:\n" +
            "1. Open the product page in your browser, then click 'Scrape Current Page' in the extension side panel\n" +
            "2. Use 'Add Manually' below to enter product info by hand",
        );
        setShowManual(true);
        setManual((m) => ({ ...m, url: url.trim() }));
      } else {
        alert(err.error || "Failed to scrape product");
      }
    }
    setScraping(false);
  };

  // Method 2: Manual product entry
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.url.trim() || !manual.title.trim()) return;
    setScraping(true);

    const res = await fetch("/api/products/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual }),
    });

    if (res.ok) {
      setManual({
        url: "",
        title: "",
        description: "",
        price: "",
        shopName: "",
        usp: "",
        targetAudience: "",
      });
      setShowManual(false);
      fetchProducts();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to add product");
    }
    setScraping(false);
  };

  // Bulk import handler
  const handleBulkImport = async () => {
    const lines = bulkUrls
      .split(/[\n,]+/)
      .map((l) => toProductUrl(l.trim()))
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;

    setBulkLoading(true);
    setBulkResult(null);

    try {
      const res = await fetch("/api/scrape-requests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lines }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkResult(data);
        if (data.created > 0) {
          setBulkUrls("");
        }
      } else {
        alert(data.error || "Bulk import failed");
      }
    } catch {
      alert("Network error during bulk import");
    }
    setBulkLoading(false);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      // Parse CSV: extract URLs from all columns
      const urls: string[] = [];
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const cells = line
          .split(",")
          .map((c) => c.trim().replace(/^"|"$/g, ""));
        for (const cell of cells) {
          if (cell.startsWith("http://") || cell.startsWith("https://")) {
            urls.push(cell);
          }
        }
      }
      if (urls.length > 0) {
        setBulkUrls((prev) => (prev ? prev + "\n" : "") + urls.join("\n"));
      } else {
        alert("No URLs found in the CSV file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditData({ usp: p.usp || "", targetAudience: p.targetAudience || "" });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    const res = await fetch(`/api/products/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    if (res.ok) {
      fetchProducts();
      setEditingId(null);
    } else {
      alert("Failed to save changes");
    }
    setSavingEdit(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product and all its video jobs?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetchProducts();
  };

  const handleCreateJob = async (productId: string) => {
    setCreatingJobId(productId);
    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoReady: true }),
    });
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(productId));
      fetchProducts();
    } else {
      alert("Failed to mark product");
    }
    setCreatingJobId(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Katalog Produk</h1>
        <p className="text-sm text-gray-500">
          Add TikTok Shop products via Chrome extension or manually
        </p>
      </div>

      {/* Scrape via URL form */}
      <form
        onSubmit={handleScrapeViaExtension}
        className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Product ID or URL (e.g. 1734586118503434079)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            required
          />
          <button
            type="submit"
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
          >
            {scraping ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Chrome className="h-4 w-4" />
            )}
            {scraping ? "Scraping..." : "Fetch Produk"}
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Chrome className="h-3 w-3" /> Best: Open product page in browser,
            use extension to scrape
          </span>
          <span>·</span>
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-1 text-blue-500 hover:underline"
          >
            <PenLine className="h-3 w-3" />{" "}
            {showManual ? "Hide manual form" : "Add manually"}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => {
              setShowBulk(!showBulk);
              setBulkResult(null);
            }}
            className="flex items-center gap-1 text-purple-500 hover:underline"
          >
            <List className="h-3 w-3" />{" "}
            {showBulk ? "Hide bulk import" : "Bulk import"}
          </button>
        </div>
      </form>

      {/* Manual entry form */}
      {showManual && (
        <form
          onSubmit={handleManualAdd}
          className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4"
        >
          <h3 className="text-sm font-semibold text-blue-700">
            Add Product Manually
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="url"
              value={manual.url}
              onChange={(e) =>
                setManual((m) => ({ ...m, url: e.target.value }))
              }
              placeholder="Product URL *"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="text"
              value={manual.title}
              onChange={(e) =>
                setManual((m) => ({ ...m, title: e.target.value }))
              }
              placeholder="Product Title *"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="text"
              value={manual.price}
              onChange={(e) =>
                setManual((m) => ({ ...m, price: e.target.value }))
              }
              placeholder="Price (e.g. RM 29.90)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={manual.shopName}
              onChange={(e) =>
                setManual((m) => ({ ...m, shopName: e.target.value }))
              }
              placeholder="Shop Name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <textarea
            value={manual.description}
            onChange={(e) =>
              setManual((m) => ({ ...m, description: e.target.value }))
            }
            placeholder="Product description (helps with better AI prompts)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <textarea
            value={manual.usp}
            onChange={(e) => setManual((m) => ({ ...m, usp: e.target.value }))}
            placeholder="USP / Kelebihan Utama (cth: Tahan 24 jam, tanpa paraben, kulit glowing dalam 7 hari)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={manual.targetAudience}
            onChange={(e) =>
              setManual((m) => ({ ...m, targetAudience: e.target.value }))
            }
            placeholder="Target Audience (cth: Ibu-ibu busy, remaja kulit berjerawat, pekerja ofis)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </form>
      )}

      {/* Bulk import section */}
      {showBulk && (
        <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
              <List className="h-4 w-4" /> Bulk Product Import
            </h3>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-100">
              <FileText className="h-3 w-3" /> Import CSV
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>
          </div>

          <p className="text-xs text-purple-600/70">
            Paste product IDs or URLs below — one per line or comma-separated.
            IDs will be auto-converted to TikTok Shop URLs.
          </p>

          <textarea
            value={bulkUrls}
            onChange={(e) => setBulkUrls(e.target.value)}
            placeholder={
              "1734586118503434079\n1729300000000123456\nhttps://shop.tiktok.com/view/product/789..."
            }
            rows={6}
            className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-600/70">
              {bulkUrls.split(/[\n,]+/).filter((l) => l.trim()).length} URL(s)
              detected
            </span>
            <button
              onClick={handleBulkImport}
              disabled={bulkLoading || !bulkUrls.trim()}
              className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
            >
              {bulkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {bulkLoading ? "Queueing..." : "Queue All for Scraping"}
            </button>
          </div>

          {/* Bulk import results */}
          {bulkResult && (
            <div className="space-y-2 rounded-lg border border-purple-200 bg-white p-3">
              <h4 className="text-sm font-semibold text-gray-700">
                Import Results
              </h4>
              <div className="flex flex-wrap gap-3 text-xs">
                {bulkResult.created > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-green-700">
                    <Check className="h-3 w-3" /> {bulkResult.created} queued
                  </span>
                )}
                {bulkResult.skippedExisting > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-yellow-700">
                    <AlertCircle className="h-3 w-3" />{" "}
                    {bulkResult.skippedExisting} already exist
                  </span>
                )}
                {bulkResult.skippedQueued > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">
                    <RefreshCw className="h-3 w-3" /> {bulkResult.skippedQueued}{" "}
                    already queued
                  </span>
                )}
                {bulkResult.skippedInvalid > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                    <X className="h-3 w-3" /> {bulkResult.skippedInvalid}{" "}
                    invalid
                  </span>
                )}
              </div>

              {bulkResult.details.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                    Show details ({bulkResult.details.length} URLs)
                  </summary>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {bulkResult.details.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {d.status === "created" ? (
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                        ) : d.status === "exists" ? (
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-yellow-500" />
                        ) : d.status === "queued" ? (
                          <RefreshCw className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                        ) : (
                          <X className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                        )}
                        <span className="truncate font-mono text-gray-600">
                          {d.url}
                        </span>
                        {d.reason && (
                          <span className="shrink-0 text-gray-400">
                            — {d.reason}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading...</p>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400">
          No products yet. Paste a TikTok Shop URL above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => {
            const images: string[] = JSON.parse(p.images || "[]");
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Thumbnail */}
                <div className="aspect-square w-full overflow-hidden bg-gray-100">
                  {images[0] ? (
                    <img
                      src={images[0]}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
                      No img
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col flex-1 p-3">
                  <h3 className="text-sm font-semibold line-clamp-2 leading-tight">
                    {p.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {p.shopName}
                  </p>
                  <p className="text-sm font-bold text-rose-500 mt-1">
                    {p.price}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                  >
                    <ExternalLink className="h-3 w-3" /> View on TikTok
                  </a>

                  {/* USP & Target Audience indicators */}
                  {(p.usp || p.targetAudience) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.usp && (
                        <span
                          className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 truncate max-w-full"
                          title={p.usp}
                        >
                          USP ✓
                        </span>
                      )}
                      {p.targetAudience && (
                        <span
                          className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 truncate max-w-full"
                          title={p.targetAudience}
                        >
                          Audience ✓
                        </span>
                      )}
                    </div>
                  )}

                  {/* Inline Edit Form */}
                  {editingId === p.id && (
                    <div className="mt-2 space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
                      <textarea
                        value={editData.usp}
                        onChange={(e) =>
                          setEditData((d) => ({ ...d, usp: e.target.value }))
                        }
                        placeholder="USP / Kelebihan Utama"
                        rows={2}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editData.targetAudience}
                        onChange={(e) =>
                          setEditData((d) => ({
                            ...d,
                            targetAudience: e.target.value,
                          }))
                        }
                        placeholder="Target Audience"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="flex-1 flex items-center justify-center gap-1 rounded bg-indigo-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
                        >
                          {savingEdit ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}{" "}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-50"
                        >
                          <X className="h-3 w-3" /> Batal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-auto pt-2">
                    {p.videoReady || addedIds.has(p.id) ? (
                      <span className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-green-50 border border-green-200 px-2 py-1.5 text-xs font-medium text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Siap Video
                      </span>
                    ) : (
                      <button
                        onClick={() => handleCreateJob(p.id)}
                        disabled={creatingJobId === p.id}
                        className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-rose-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
                      >
                        {creatingJobId === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Video className="h-3 w-3" />
                        )}
                        {creatingJobId === p.id ? "..." : "Create Video"}
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-500 transition-colors"
                      title="Edit USP & Target Audience"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper: get extension ID from settings
async function getExtensionId(): Promise<string | null> {
  try {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    const entry = settings.find(
      (s: { key: string; value: string }) => s.key === "extension_id",
    );
    return entry?.value || null;
  } catch {
    return null;
  }
}

// Helper: send message to Chrome extension via externally_connectable
async function sendToExtension(
  extensionId: string,
  message: { type: string; payload?: unknown },
): Promise<{ success?: boolean; error?: string; product?: unknown } | null> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (globalThis as any).chrome;
      if (typeof c !== "undefined" && c.runtime?.sendMessage) {
        c.runtime.sendMessage(
          extensionId,
          message,
          (
            response: {
              success?: boolean;
              error?: string;
              product?: unknown;
            } | null,
          ) => {
            resolve(response || null);
          },
        );
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}
