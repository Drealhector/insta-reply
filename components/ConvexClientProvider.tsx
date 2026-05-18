"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="max-w-md mx-auto py-16 px-6">
        <div className="card card-pad">
          <h2 className="font-semibold text-lg">Not connected</h2>
          <p className="text-sm text-fg-muted mt-2">
            Backend not yet configured. Check your local environment file.
          </p>
        </div>
      </div>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
