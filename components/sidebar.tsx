"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Zap,
  Settings,
  Package,
  Wand2,
  Film,
  ImageIcon,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Katalog Produk", icon: ShoppingBag },
  { href: "/tools", label: "Prompt Tools", icon: Wand2 },
  { href: "/image-tools", label: "Image Tools", icon: ImageIcon },
  { href: "/automation", label: "Automation", icon: Zap },
  { href: "/gallery", label: "Video Gallery", icon: Film },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <Package className="h-6 w-6 text-rose-500" />
        <span className="text-lg font-bold">TikTok Flow</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-rose-50 text-rose-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-400">
        v1.0.0
      </div>
    </aside>
  );
}
