import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [productCount, jobStats] = await Promise.all([
    prisma.product.count(),
    prisma.videoJob.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const stats = {
    pending: 0,
    generating_image: 0,
    generating_video: 0,
    ready: 0,
    posting: 0,
    posted: 0,
    failed: 0,
  };
  for (const s of jobStats) {
    stats[s.status as keyof typeof stats] = s._count.status;
  }

  const totalJobs = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          TikTok Affiliate Video Automation
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Products" value={productCount} />
        <StatCard label="Total Jobs" value={totalJobs} />
        <StatCard label="Completed" value={stats.posted} color="green" />
        <StatCard label="Failed" value={stats.failed} color="red" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickAction
          href="/products"
          title="Add Product"
          desc="Scrape a TikTok Shop product URL"
        />
        <QuickAction
          href="/automation"
          title="Automation"
          desc="Create videos & manage queue"
        />
        <QuickAction
          href="/settings"
          title="Settings"
          desc="Extension ID, prompts, defaults"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "red"
        ? "text-red-600"
        : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
    </Link>
  );
}
