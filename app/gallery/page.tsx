"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Play, Film, Loader2, Trash2, Eye, X } from "lucide-react";

interface GalleryVideo {
  id: string;
  filename: string;
  videoType: string;
  caption: string;
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
  const [loading, setLoading] = useState(true);
  const [previewVideo, setPreviewVideo] = useState<GalleryVideo | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    setVideos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleDownload = (video: GalleryVideo) => {
    const link = document.createElement("a");
    link.href = `/api/gallery/${video.id}`;
    link.download = video.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (video: GalleryVideo) => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video Gallery</h1>
          <p className="mt-1 text-sm text-gray-500">
            {videos.length} video{videos.length !== 1 ? "s" : ""} saved
          </p>
        </div>
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
        </div>
      ) : videos.length === 0 ? (
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
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-black transition-shadow hover:shadow-lg"
            >
              {/* Video Thumbnail */}
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
                {/* Hover overlay with actions */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setPreviewVideo(video)}
                    className="rounded-full bg-white/90 p-2.5 shadow-lg transition-transform hover:scale-110"
                  >
                    <Eye className="h-5 w-5 text-gray-700" />
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(video)}
                      className="rounded-full bg-rose-500 p-2 text-white shadow-lg transition-transform hover:scale-110"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(video)}
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
                {/* Date badge */}
                <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                  {new Date(video.createdAt).toLocaleDateString("ms-MY", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
                {/* Type badge */}
                {video.videoType && (
                  <div className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                    {VIDEO_TYPES[video.videoType] || video.videoType}
                  </div>
                )}
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
            {/* Close button */}
            <button
              onClick={() => setPreviewVideo(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Video player */}
            <div className="aspect-9/16 max-h-[75vh] w-full">
              <video
                src={`/api/gallery/${previewVideo.id}`}
                className="h-full w-full object-contain"
                controls
                autoPlay
                playsInline
              />
            </div>

            {/* Actions bar */}
            <div className="flex gap-2 bg-gray-900 p-3">
              <button
                onClick={() => handleDownload(previewVideo)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={() => handleDelete(previewVideo)}
                disabled={deleting.has(previewVideo.id)}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
