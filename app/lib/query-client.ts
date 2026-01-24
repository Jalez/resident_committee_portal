/**
 * Shared QueryClient instance for TanStack Query
 * Used in both loaders (for ensureQueryData) and components (via QueryClientProvider)
 */

import { QueryClient } from "@tanstack/react-query";
import { STALE_TIME } from "./query-config";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: STALE_TIME,
			gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
			refetchOnWindowFocus: false, // Info reel doesn't need this
			refetchOnReconnect: false,
		},
	},
});
