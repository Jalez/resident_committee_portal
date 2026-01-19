/**
 * TanStack Query configuration
 * Controls client-side caching behavior for data fetching
 */

// Duration before data is considered stale (in milliseconds)
// During this time, route transitions will use cached data without network requests
export const STALE_TIME = 10 * 60 * 1000; // 10 minutes

// Query keys for type-safe cache access
export const queryKeys = {
    calendar: ["calendar"] as const,
    calendarUrl: ["calendarUrl"] as const,
    minutes: ["minutes"] as const,
    social: ["social"] as const,
    inventory: ["inventory"] as const,
} as const;
