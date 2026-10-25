"use client";

/**
 * Providers.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side provider tree required by Wagmi v2.
 *
 * Add <Providers> inside app/layout.tsx (around {children}) to activate
 * wallet connection and contract reads/writes throughout the app.
 *
 * app/layout.tsx:
 *   import Providers from "@/components/web3/Providers";
 *   ...
 *   <body>
 *     <Providers>{children}</Providers>
 *   </body>
 */

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/web3/arcConfig";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  // QueryClient must be created inside the component (not at module scope)
  // so each Next.js server render gets a fresh instance.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Arc Testnet blocks every ~2s — stale after 4s is a reasonable default
        staleTime: 4_000,
        retry: 2,
      },
    },
  }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
