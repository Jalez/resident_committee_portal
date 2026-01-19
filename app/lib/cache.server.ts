/**
 * Simple in-memory cache for server-side data
 * TTL values are in milliseconds
 */

// Configurable cache durations (in milliseconds)
export const CACHE_TTL = {
    CALENDAR_EVENTS: 3 * 60 * 60 * 1000,  // 3 hours
    MINUTES: 3 * 60 * 60 * 1000,           // 3 hours
    SOCIAL_CHANNELS: 3 * 60 * 60 * 1000,   // 3 hours
    INVENTORY: 3 * 60 * 60 * 1000,         // 3 hours
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();

/**
 * Get cached data if it exists and hasn't expired
 */
export function getCached<T>(key: string, ttl: number): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > ttl) {
        // Cache expired
        cache.delete(key);
        return null;
    }

    console.log(`[Cache] HIT for '${key}' (age: ${Math.round((now - entry.timestamp) / 1000)}s)`);
    return entry.data as T;
}

/**
 * Store data in cache
 */
export function setCache<T>(key: string, data: T): void {
    cache.set(key, {
        data,
        timestamp: Date.now(),
    });
    console.log(`[Cache] SET '${key}'`);
}

/**
 * Clear a specific cache entry
 */
export function clearCache(key: string): void {
    cache.delete(key);
    console.log(`[Cache] CLEARED '${key}'`);
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
    cache.clear();
    console.log(`[Cache] CLEARED ALL`);
}

// Cache keys
export const CACHE_KEYS = {
    CALENDAR_EVENTS: "calendar_events",
    MINUTES: "minutes",
    SOCIAL_CHANNELS: "social_channels",
    INVENTORY: "inventory",
};
