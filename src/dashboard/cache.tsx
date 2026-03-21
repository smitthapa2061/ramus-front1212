// src/utils/cache.ts
export const setCache = (key: string, data: any) => {
  localStorage.setItem(
    key,
    JSON.stringify({ data, timestamp: Date.now() })
  );
};

export const getCache = (key: string, maxAge = 1000 * 60 * 60) => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;

  try {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > maxAge) return null; // expired
    return data;
  } catch {
    return null;
  }
};

export const removeCache = (key: string) => {
  localStorage.removeItem(key);
};

/**
 * Save new data only if it has changed compared to cached data
 */
export const updateCacheIfChanged = (key: string, newData: any) => {
  const oldData = getCache(key);
  if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
    removeCache(key); // remove old cache
    setCache(key, newData); // set new cache
  }
};