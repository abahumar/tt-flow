"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Film,
  Loader2,
  Trash2,
  Eye,
  X,
  ImageIcon,
  Video,
  Save,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Send,
  CheckSquare,
  Square,
  Combine,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface GalleryVideo {
  id: string;
  filename: string;
  videoType: string;
  caption: string;
  createdAt: string;
}

interface GalleryImage {
  id: string;
  filename: string;
  prompt: string;
  createdAt: string;
}

interface SavedVideoPrompt {
  id: string;
  name: string;
  videoPrompt: string;
  createdAt: string;
}

const VIDEO_TYPES: Record<string, string> = {
  fungsi_produk: "Fungsi Produk",
  review: "Review",
  unboxing: "Unboxing",
  problem_solution: "Problem-Solution",
};

export default function GalleryPage() {
  const [videos, setVideos] = useState<GalleryVideo[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"videos" | "images">("videos");
  const [previewVideo, setPreviewVideo] = useState<GalleryVideo | null>(null);
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [creatingVideo, setCreatingVideo] = useState<Set<string>>(new Set());
  const [createVideoImage, setCreateVideoImage] = useState<GalleryImage | null>(
    null,
  );
  const [videoPromptInput, setVideoPromptInput] = useState("");
  const [savedVideoPrompts, setSavedVideoPrompts] = useState<
    SavedVideoPrompt[]
  >([]);
  const [showSavedVideoPrompts, setShowSavedVideoPrompts] = useState(false);
  const [savingVideoPrompt, setSavingVideoPrompt] = useState(false);
  const [saveVideoPromptName, setSaveVideoPromptName] = useState("");
  const [showSaveVideoForm, setShowSaveVideoForm] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState<Set<string>>(
    new Set(),
  );
  const [postingTiktok, setPostingTiktok] = useState<Set<string>>(new Set());
  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Combine videos
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [combining, setCombining] = useState(false);
  // Hook & Overlay for gallery video
  const [galleryHookTitle, setGalleryHookTitle] = useState("");
  const [galleryOverlayText, setGalleryOverlayText] = useState("");
  const [galleryOverlayPosition, setGalleryOverlayPosition] = useState<
    "top" | "bottom" | "center"
  >("bottom");
  const [galleryFontSize, setGalleryFontSize] = useState(28);
  const [galleryHookBgColor, setGalleryHookBgColor] = useState("#E91E63");
  const [galleryHookTextColor, setGalleryHookTextColor] = useState("#FFFFFF");
  const [galleryHookFontSize, setGalleryHookFontSize] = useState(36);
  const router = useRouter();

  const fetchGallery = useCallback(async () => {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    setVideos(data.videos || []);
    setImages(data.images || []);
    setLoading(false);
  }, []);

  const fetchSavedVideoPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/custom-prompts");
      const data = await res.json();
      setSavedVideoPrompts(data.filter((p: SavedVideoPrompt) => p.videoPrompt));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchGallery();
    fetchSavedVideoPrompts();
  }, [fetchGallery, fetchSavedVideoPrompts]);

  const handleDownloadVideo = (video: GalleryVideo) => {
    const link = document.createElement("a");
    link.href = `/api/gallery/${video.id}`;
    link.download = video.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadImage = (image: GalleryImage) => {
    const link = document.createElement("a");
    link.href = `/api/gallery/${image.id}?type=image`;
    link.download = image.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteVideo = async (video: GalleryVideo) => {
    if (!confirm("Delete this video? The file will be removed from storage."))
      return;
    setDeleting((prev) => new Set(prev).add(video.id));
    await fetch(`/api/gallery/${video.id}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    setDeleting((prev) => {
      const next = new Set(prev);
      next.delete(video.id);
      return next;
    });
    if (previewVideo?.id === video.id) setPreviewVideo(null);
  };

  const handleDeleteImage = async (image: GalleryImage) => {
    if (!confirm("Delete this image? The file will be removed from storage."))
      return;
    setDeleting((prev) => new Set(prev).add(image.id));
    await fetch(`/api/gallery/${image.id}?type=image`, { method: "DELETE" });
    setImages((prev) => prev.filter((i) => i.id !== image.id));
    setDeleting((prev) => {
      const next = new Set(prev);
      next.delete(image.id);
      return next;
    });
    if (previewImage?.id === image.id) setPreviewImage(null);
  };

  const handleSendVideoToTelegram = async (video: GalleryVideo) => {
    setSendingTelegram((prev) => new Set(prev).add(video.id));
    try {
      const res = await fetch(`/api/gallery/${video.id}/telegram`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to send: " + (err.error || "Unknown error"));
      }
    } catch {
      alert("Failed to send video to Telegram");
    } finally {
      setSendingTelegram((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
    }
  };

  const handlePostToTiktok = async (video: GalleryVideo) => {
    setPostingTiktok((prev) => new Set(prev).add(video.id));
    try {
      const extensionId = await getExtensionId();
      if (!extensionId) {
        alert("Extension not found. Make sure the Chrome extension is installed.");
        return;
      }
      const result = await sendToExtension(extensionId, {
        type: "POST_GALLERY_VIDEO",
        payload: { galleryId: video.id },
      });
      if (result && "error" in result && result.error) {
        alert("Failed to post: " + result.error);
      }
    } catch {
      alert("Failed to post video to TikTok");
    } finally {
      setPostingTiktok((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
    }
  };

  const handleSendImageToTelegram = async (image: GalleryImage) => {
    setSendingTelegram((prev) => new Set(prev).add(image.id));
    try {
      const res = await fetch(`/api/gallery/${image.id}/telegram?type=image`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to send: " + (err.error || "Unknown error"));
      }
    } catch {
      alert("Failed to send image to Telegram");
    } finally {
      setSendingTelegram((prev) => {
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });
    }
  };

  const openCreateVideoModal = (image: GalleryImage) => {
    setCreateVideoImage(image);
    setVideoPromptInput("");
    setShowSaveVideoForm(false);
    setSaveVideoPromptName("");
  };

  const handleSaveVideoPrompt = async () => {
    if (!videoPromptInput.trim() || !saveVideoPromptName.trim()) return;
    setSavingVideoPrompt(true);
    try {
      const res = await fetch("/api/custom-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveVideoPromptName.trim(),
          videoPrompt: videoPromptInput,
        }),
      });
      if (res.ok) {
        setSaveVideoPromptName("");
        setShowSaveVideoForm(false);
        fetchSavedVideoPrompts();
      }
    } catch {
      // ignore
    } finally {
      setSavingVideoPrompt(false);
    }
  };

  const handleDeleteSavedVideoPrompt = async (id: string) => {
    try {
      await fetch(`/api/custom-prompts/${id}`, { method: "DELETE" });
      fetchSavedVideoPrompts();
    } catch {
      // ignore
    }
  };

  const loadSavedVideoPrompt = (prompt: SavedVideoPrompt) => {
    setVideoPromptInput(prompt.videoPrompt);
    setShowSavedVideoPrompts(false);
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedItems(new Set());
  };

  const handleCombineVideos = async () => {
    if (selectedItems.size < 2) return;
    setCombining(true);
    try {
      const res = await fetch("/api/gallery/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoIds: Array.from(selectedItems),
          hookTitle: galleryHookTitle.trim() || undefined,
          hookBgColor: galleryHookBgColor.replace("#", ""),
          hookTextColor: galleryHookTextColor.replace("#", ""),
          hookFontSize: galleryHookFontSize,
          overlayText: galleryOverlayText.trim() || undefined,
          overlayPosition: galleryOverlayPosition,
          overlayFontSize: galleryFontSize,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to combine: " + (err.error || "Unknown error"));
        return;
      }
      const newVideo = await res.json();
      setVideos((prev) => [newVideo, ...prev]);
      setShowCombineModal(false);
      setSelectedItems(new Set());
      setSelectMode(false);
      setGalleryHookTitle("");
      setGalleryOverlayText("");
      alert("Videos combined successfully!");
    } catch {
      alert("Failed to combine videos");
    } finally {
      setCombining(false);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const items = tab === "videos" ? videos : images;
    const allIds = items.map((i) => i.id);
    const allSelected = allIds.every((id) => selectedItems.has(id));
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedItems.size} ${tab === "videos" ? "video" : "image"}${selectedItems.size !== 1 ? "s" : ""}? Files will be removed from storage.`,
      )
    )
      return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedItems),
          type: tab === "videos" ? "video" : "image",
        }),
      });
      if (res.ok) {
        if (tab === "videos") {
          setVideos((prev) => prev.filter((v) => !selectedItems.has(v.id)));
        } else {
          setImages((prev) => prev.filter((i) => !selectedItems.has(i.id)));
        }
        setSelectedItems(new Set());
        setSelectMode(false);
      } else {
        alert("Failed to delete selected items");
      }
    } catch {
      alert("Failed to delete selected items");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const items = tab === "videos" ? videos : images;
    if (items.length === 0) return;
    if (
      !confirm(
        `Delete ALL ${items.length} ${tab === "videos" ? "video" : "image"}${items.length !== 1 ? "s" : ""}? This cannot be undone.`,
      )
    )
      return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: items.map((i) => i.id),
          type: tab === "videos" ? "video" : "image",
        }),
      });
      if (res.ok) {
        if (tab === "videos") setVideos([]);
        else setImages([]);
        setSelectedItems(new Set());
        setSelectMode(false);
      } else {
        alert("Failed to delete all items");
      }
    } catch {
      alert("Failed to delete all items");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCreateVideo = async () => {
    if (!createVideoImage) return;
    const image = createVideoImage;
    setCreatingVideo((prev) => new Set(prev).add(image.id));
    try {
      // Build overlayConfig for single-scene hook/overlay
      const overlayConfig = JSON.stringify({
        hookTitle: galleryHookTitle.trim(),
        hookSubtitle: "",
        hookBgColor: galleryHookBgColor.replace("#", ""),
        hookTextColor: galleryHookTextColor.replace("#", ""),
        hookFontSize: galleryHookFontSize,
        overlays: [
          galleryOverlayText.trim()
            ? {
                text: galleryOverlayText.trim(),
                position: galleryOverlayPosition,
              }
            : null,
        ],
        overlayFontSize: galleryFontSize,
      });

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryImageId: image.id,
          videoPrompt: videoPromptInput.trim() || undefined,
          overlayConfig,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to create video job: " + (err.error || "Unknown error"));
        return;
      }
      setCreateVideoImage(null);
      setGalleryHookTitle("");
      setGalleryOverlayText("");
      setGalleryOverlayPosition("bottom");
      setGalleryFontSize(48);
      alert(
        "Video job queued successfully! Go to Automation to start processing.",
      );
      router.push("/automation");
    } catch {
      alert("Failed to create video job");
    } finally {
      setCreatingVideo((prev) => {
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="mt-1 text-sm text-gray-500">
            {videos.length} video{videos.length !== 1 ? "s" : ""},{" "}
            {images.length} image{images.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        <button
          onClick={toggleSelectMode}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            selectMode
              ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          <CheckSquare className="h-4 w-4" />
          {selectMode ? "Cancel" : "Select"}
        </button>
      </div>

      {/* Bulk Action Bar */}
      {selectMode && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {(tab === "videos" ? videos : images).length > 0 &&
              (tab === "videos" ? videos : images).every((i) =>
                selectedItems.has(i.id),
              ) ? (
                <CheckSquare className="h-4 w-4 text-rose-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Select All
            </button>
            <span className="text-sm text-gray-500">
              {selectedItems.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tab === "videos" && (
              <button
                onClick={() => {
                  setGalleryHookTitle("");
                  setGalleryOverlayText("");
                  setShowCombineModal(true);
                }}
                disabled={selectedItems.size < 2 || bulkDeleting || combining}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {combining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Combine className="h-4 w-4" />
                )}
                Combine ({selectedItems.size})
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={selectedItems.size === 0 || bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete ({selectedItems.size})
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={
                bulkDeleting ||
                (tab === "videos" ? videos : images).length === 0
              }
              className="flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-900 disabled:opacity-50"
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete All
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          onClick={() => {
            setTab("videos");
            setSelectedItems(new Set());
          }}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "videos"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Film className="h-4 w-4" />
          Videos ({videos.length})
        </button>
        <button
          onClick={() => {
            setTab("images");
            setSelectedItems(new Set());
          }}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "images"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Images ({images.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
        </div>
      ) : tab === "videos" ? (
        /* Videos Grid */
        videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16">
            <Film className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No videos yet. Videos will appear here when generated from
              Automation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((video) => (
              <div
                key={video.id}
                className={`group relative overflow-hidden rounded-xl border transition-shadow hover:shadow-lg ${
                  selectMode && selectedItems.has(video.id)
                    ? "border-rose-400 ring-2 ring-rose-300"
                    : "border-gray-200"
                } bg-black`}
                onClick={
                  selectMode ? () => toggleSelectItem(video.id) : undefined
                }
              >
                {selectMode && (
                  <div className="absolute left-2 top-2 z-10">
                    {selectedItems.has(video.id) ? (
                      <CheckSquare className="h-5 w-5 text-rose-500" />
                    ) : (
                      <Square className="h-5 w-5 text-white/80" />
                    )}
                  </div>
                )}
                <div className="relative aspect-9/16 w-full">
                  <video
                    src={`/api/gallery/${video.id}`}
                    className="h-full w-full object-contain"
                    preload="metadata"
                    muted
                    playsInline
                    onMouseEnter={(e) => {
                      const v = e.target as HTMLVideoElement;
                      v.currentTime = 0;
                      v.play().catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      const v = e.target as HTMLVideoElement;
                      v.pause();
                      v.currentTime = 0;
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setPreviewVideo(video)}
                      className="rounded-full bg-white/90 p-2.5 shadow-lg transition-transform hover:scale-110"
                    >
                      <Eye className="h-5 w-5 text-gray-700" />
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownloadVideo(video)}
                        className="rounded-full bg-rose-500 p-2 text-white shadow-lg transition-transform hover:scale-110"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleSendVideoToTelegram(video)}
                        disabled={sendingTelegram.has(video.id)}
                        title="Send to Telegram"
                        className="rounded-full bg-blue-500 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                      >
                        {sendingTelegram.has(video.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                      {video.videoType === "combined" && (
                        <button
                          onClick={() => handlePostToTiktok(video)}
                          disabled={postingTiktok.has(video.id)}
                          title="Post to TikTok"
                          className="rounded-full bg-gray-900 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                        >
                          {postingTiktok.has(video.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteVideo(video)}
                        disabled={deleting.has(video.id)}
                        className="rounded-full bg-red-600 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                      >
                        {deleting.has(video.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                    {new Date(video.createdAt).toLocaleDateString("ms-MY", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  {video.videoType && (
                    <div className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                      {VIDEO_TYPES[video.videoType] || video.videoType}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : /* Images Grid */
      images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16">
          <ImageIcon className="h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            No images yet. Images will appear here when generated from Image
            Tools.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <div
              key={image.id}
              className={`group relative overflow-hidden rounded-xl border transition-shadow hover:shadow-lg ${
                selectMode && selectedItems.has(image.id)
                  ? "border-rose-400 ring-2 ring-rose-300"
                  : "border-gray-200"
              } bg-gray-100`}
              onClick={
                selectMode ? () => toggleSelectItem(image.id) : undefined
              }
            >
              {selectMode && (
                <div className="absolute left-2 top-2 z-10">
                  {selectedItems.has(image.id) ? (
                    <CheckSquare className="h-5 w-5 text-rose-500" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-500" />
                  )}
                </div>
              )}
              <div className="relative aspect-9/16 w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/gallery/${image.id}?type=image`}
                  alt="Generated image"
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setPreviewImage(image)}
                    className="rounded-full bg-white/90 p-2.5 shadow-lg transition-transform hover:scale-110"
                  >
                    <Eye className="h-5 w-5 text-gray-700" />
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openCreateVideoModal(image)}
                      disabled={creatingVideo.has(image.id)}
                      title="Create Video"
                      className="rounded-full bg-indigo-500 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      {creatingVideo.has(image.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDownloadImage(image)}
                      className="rounded-full bg-pink-500 p-2 text-white shadow-lg transition-transform hover:scale-110"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSendImageToTelegram(image)}
                      disabled={sendingTelegram.has(image.id)}
                      title="Send to Telegram"
                      className="rounded-full bg-blue-500 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      {sendingTelegram.has(image.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteImage(image)}
                      disabled={deleting.has(image.id)}
                      className="rounded-full bg-red-600 p-2 text-white shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      {deleting.has(image.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                  {new Date(image.createdAt).toLocaleDateString("ms-MY", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewVideo(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="aspect-9/16 max-h-[75vh] w-full">
              <video
                src={`/api/gallery/${previewVideo.id}`}
                className="h-full w-full object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>
            <div className="flex gap-2 bg-gray-900 p-3">
              <button
                onClick={() => handleDownloadVideo(previewVideo)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={() => handleSendVideoToTelegram(previewVideo)}
                disabled={sendingTelegram.has(previewVideo.id)}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                {sendingTelegram.has(previewVideo.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
              {previewVideo.videoType === "combined" && (
                <button
                  onClick={() => handlePostToTiktok(previewVideo)}
                  disabled={postingTiktok.has(previewVideo.id)}
                  title="Post to TikTok"
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
                >
                  {postingTiktok.has(previewVideo.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={() => handleDeleteVideo(previewVideo)}
                disabled={deleting.has(previewVideo.id)}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="max-h-[75vh] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/gallery/${previewImage.id}?type=image`}
                alt="Generated image"
                className="h-full w-full object-contain"
              />
            </div>
            {previewImage.prompt && (
              <div className="bg-gray-900 px-3 py-2">
                <p className="line-clamp-3 text-xs text-gray-400">
                  {previewImage.prompt}
                </p>
              </div>
            )}
            <div className="flex gap-2 bg-gray-900 p-3 pt-0">
              <button
                onClick={() => openCreateVideoModal(previewImage)}
                disabled={creatingVideo.has(previewImage.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              >
                {creatingVideo.has(previewImage.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                Create Video
              </button>
              <button
                onClick={() => handleDownloadImage(previewImage)}
                className="flex items-center justify-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-600"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleSendImageToTelegram(previewImage)}
                disabled={sendingTelegram.has(previewImage.id)}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                {sendingTelegram.has(previewImage.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => handleDeleteImage(previewImage)}
                disabled={deleting.has(previewImage.id)}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combine Videos Modal */}
      {showCombineModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowCombineModal(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Combine {selectedItems.size} Videos
              </h3>
              <button
                onClick={() => setShowCombineModal(false)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Selected videos will be combined in the order they were
                  selected.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from(selectedItems).map((id, idx) => {
                    const v = videos.find((v) => v.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                      >
                        {idx + 1}.{" "}
                        {v?.videoType
                          ? VIDEO_TYPES[v.videoType] || v.videoType
                          : v?.filename?.slice(0, 15) || "Video"}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Hook & Overlay Settings */}
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Hook & Caption (Optional)
                </p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Hook Title (shows first 0.5s on first clip)
                  </label>
                  <input
                    type="text"
                    value={galleryHookTitle}
                    onChange={(e) => setGalleryHookTitle(e.target.value)}
                    placeholder="e.g. Rahsia Kulit Glowing!"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    maxLength={100}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Hook BG Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={galleryHookBgColor}
                        onChange={(e) => setGalleryHookBgColor(e.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                      />
                      <span className="text-[10px] text-gray-400">
                        {galleryHookBgColor}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Hook Text Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={galleryHookTextColor}
                        onChange={(e) =>
                          setGalleryHookTextColor(e.target.value)
                        }
                        className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                      />
                      <span className="text-[10px] text-gray-400">
                        {galleryHookTextColor}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Hook Text Size: {galleryHookFontSize}px
                  </label>
                  <input
                    type="range"
                    min={32}
                    max={96}
                    step={2}
                    value={galleryHookFontSize}
                    onChange={(e) =>
                      setGalleryHookFontSize(Number(e.target.value))
                    }
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>32px (kecil)</span>
                    <span>96px (besar)</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Caption Text (shows after hook on first clip)
                  </label>
                  <input
                    type="text"
                    value={galleryOverlayText}
                    onChange={(e) => setGalleryOverlayText(e.target.value)}
                    placeholder="e.g. Tahan 24 Jam, Kulit Glowing!"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    maxLength={200}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Position
                    </label>
                    <select
                      value={galleryOverlayPosition}
                      onChange={(e) =>
                        setGalleryOverlayPosition(
                          e.target.value as "top" | "bottom" | "center",
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Text Size: {galleryFontSize}px
                    </label>
                    <input
                      type="range"
                      min={24}
                      max={96}
                      step={2}
                      value={galleryFontSize}
                      onChange={(e) =>
                        setGalleryFontSize(Number(e.target.value))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                onClick={() => setShowCombineModal(false)}
                disabled={combining}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCombineVideos}
                disabled={combining}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              >
                {combining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Combine className="h-4 w-4" />
                )}
                {combining ? "Combining..." : "Combine Videos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Video Modal */}
      {createVideoImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCreateVideoImage(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Create Video from Image
              </h3>
              <button
                onClick={() => setCreateVideoImage(null)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-4">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/gallery/${createVideoImage.id}?type=image`}
                    alt="Selected image"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-700">
                    Image Prompt
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-xs text-gray-500">
                    {createVideoImage.prompt || "No prompt"}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Video Prompt
                  </label>
                  <div className="flex gap-1">
                    {savedVideoPrompts.length > 0 && (
                      <button
                        onClick={() =>
                          setShowSavedVideoPrompts(!showSavedVideoPrompts)
                        }
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
                      >
                        <BookmarkPlus className="h-3 w-3" />
                        Saved ({savedVideoPrompts.length})
                        {showSavedVideoPrompts ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                    {videoPromptInput.trim() && (
                      <button
                        onClick={() => setShowSaveVideoForm(!showSaveVideoForm)}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-600 hover:bg-green-50"
                      >
                        <Save className="h-3 w-3" />
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {/* Save form */}
                {showSaveVideoForm && (
                  <div className="mt-1 flex gap-2">
                    <input
                      value={saveVideoPromptName}
                      onChange={(e) => setSaveVideoPromptName(e.target.value)}
                      placeholder="Prompt name..."
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSaveVideoPrompt()
                      }
                    />
                    <button
                      onClick={handleSaveVideoPrompt}
                      disabled={
                        savingVideoPrompt || !saveVideoPromptName.trim()
                      }
                      className="rounded bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {savingVideoPrompt ? "Saving..." : "Save"}
                    </button>
                  </div>
                )}

                {/* Saved prompts list */}
                {showSavedVideoPrompts && savedVideoPrompts.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
                    {savedVideoPrompts.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-1.5 last:border-0 hover:bg-gray-100"
                      >
                        <button
                          onClick={() => loadSavedVideoPrompt(sp)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-xs font-medium text-gray-700">
                            {sp.name}
                          </p>
                          <p className="truncate text-[10px] text-gray-400">
                            {sp.videoPrompt}
                          </p>
                        </button>
                        <button
                          onClick={() => handleDeleteSavedVideoPrompt(sp.id)}
                          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={videoPromptInput}
                  onChange={(e) => setVideoPromptInput(e.target.value)}
                  placeholder="Describe how the video should look... (e.g. Zoom in slowly on the product, then pan around showing details)"
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Leave empty to let the system generate a default video prompt.
                </p>
              </div>

              {/* Hook & Overlay Settings */}
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Text Overlay (Optional)
                </p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Hook Title (shows first 0.5s)
                  </label>
                  <input
                    type="text"
                    value={galleryHookTitle}
                    onChange={(e) => setGalleryHookTitle(e.target.value)}
                    placeholder="e.g. Rahsia Kulit Glowing!"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    maxLength={100}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Hook BG Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={galleryHookBgColor}
                        onChange={(e) => setGalleryHookBgColor(e.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                      />
                      <span className="text-[10px] text-gray-400">
                        {galleryHookBgColor}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Hook Text Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={galleryHookTextColor}
                        onChange={(e) =>
                          setGalleryHookTextColor(e.target.value)
                        }
                        className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                      />
                      <span className="text-[10px] text-gray-400">
                        {galleryHookTextColor}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Hook Text Size: {galleryHookFontSize}px
                  </label>
                  <input
                    type="range"
                    min={32}
                    max={96}
                    step={2}
                    value={galleryHookFontSize}
                    onChange={(e) =>
                      setGalleryHookFontSize(Number(e.target.value))
                    }
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>32px (kecil)</span>
                    <span>96px (besar)</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Overlay Text (shows after hook)
                  </label>
                  <input
                    type="text"
                    value={galleryOverlayText}
                    onChange={(e) => setGalleryOverlayText(e.target.value)}
                    placeholder="e.g. Tahan 24 Jam, Kulit Glowing!"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    maxLength={200}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Position
                    </label>
                    <select
                      value={galleryOverlayPosition}
                      onChange={(e) =>
                        setGalleryOverlayPosition(
                          e.target.value as "top" | "bottom" | "center",
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      Text Size: {galleryFontSize}px
                    </label>
                    <input
                      type="range"
                      min={24}
                      max={96}
                      step={2}
                      value={galleryFontSize}
                      onChange={(e) =>
                        setGalleryFontSize(Number(e.target.value))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                onClick={() => setCreateVideoImage(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVideo}
                disabled={creatingVideo.has(createVideoImage.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              >
                {creatingVideo.has(createVideoImage.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                Create Video Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

async function sendToExtension(
  extensionId: string,
  message: { type: string; payload?: unknown },
): Promise<{ ok?: boolean; error?: string } | null> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (globalThis as any).chrome;
      if (typeof c !== "undefined" && c.runtime?.sendMessage) {
        c.runtime.sendMessage(
          extensionId,
          message,
          (response: { ok?: boolean; error?: string } | null) => {
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
