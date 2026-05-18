"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, daysUntil } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";
import {
  LayoutDashboard,
  Grid3x3,
  Zap,
  Activity,
  Brain,
  Shield,
  Moon,
  Sun,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posts", label: "Posts", icon: Grid3x3 },
  { href: "/triggers", label: "Triggers", icon: Zap },
  { href: "/logs", label: "Activity", icon: Activity },
  { href: "/setup", label: "Brain", icon: Brain },
] as const;

export function SideNav() {
  const pathname = usePathname();
  const accounts = useQuery(api.accounts.list);
  const account = accounts?.[0];
  const tokenDays = daysUntil(account?.tokenExpiresAt);
  const { theme, toggle } = useTheme();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <Link href="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-border">
        <Logo />
        <span className="font-bold text-base tracking-tight">InstaReply</span>
      </Link>

      <nav className="px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={active ? "nav-item-active" : "nav-item"}>
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-3 space-y-2 border-t border-border">
        <button
          onClick={toggle}
          className="w-full nav-item justify-between"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          <span className="flex items-center gap-3">
            {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>Theme</span>
          </span>
          <span className="text-2xs uppercase tracking-wide text-fg-faint">{theme}</span>
        </button>

        {account ? (
          <Link
            href="/setup"
            className="block rounded-lg border border-border p-3 hover:bg-hover transition"
          >
            <div className="flex items-center gap-3">
              {account.profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.profilePictureUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-fg text-bg grid place-items-center text-xs font-bold">
                  {(account.username ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">@{account.username ?? "—"}</div>
                <div className="flex items-center gap-1 text-2xs text-fg-muted">
                  <Shield className="w-2.5 h-2.5" />
                  {tokenDays !== null && tokenDays >= 7 ? (
                    <span>Connected · auto-refresh</span>
                  ) : tokenDays !== null && tokenDays >= 0 ? (
                    <span className="text-warn">Refresh in {tokenDays}d</span>
                  ) : (
                    <span className="text-accent">Token expired</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-2xs text-fg-muted">
            Not connected yet
          </div>
        )}
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="0" y="0" width="26" height="26" rx="6" fill="currentColor" className="text-fg" />
      <path
        d="M6 16.5 L10 12.5 L13 15 L19 9"
        stroke="#ef4444"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="6.5" r="1.8" fill="#ef4444" />
    </svg>
  );
}

export { Logo };
