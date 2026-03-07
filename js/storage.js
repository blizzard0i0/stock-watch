// js/storage.js
// LocalStorage operations

import { CONFIG, HOLIDAY_CACHE_KEY, HOLIDAY_CACHE_TTL_MS } from './config.js';

const { STORAGE_KEYS } = CONFIG;

export function loadStockList() {
    const stored = localStorage.getItem(STORAGE_KEYS.LIST);
    if (stored) {
        try { 
            return JSON.parse(stored); 
        } catch (e) { 
            return [...CONFIG.DEFAULT_CODES]; 
        }
    }
    return [...CONFIG.DEFAULT_CODES];
}

export function saveStockList(stockCodes) {
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify(stockCodes));
}

export function loadRefreshInterval() {
    const stored = localStorage.getItem(STORAGE_KEYS.INTERVAL);
    if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 3) return val;
    }
    return 5; // Default 5 seconds
}

export function saveRefreshInterval(seconds) {
    localStorage.setItem(STORAGE_KEYS.INTERVAL, seconds);
}

export function loadSortMode() {
    const stored = localStorage.getItem(STORAGE_KEYS.SORT_MODE);
    if (stored === 'code' || stored === 'pct_desc' || stored === 'pct_asc') {
        return stored;
    }
    return 'code'; // Default
}

export function saveSortMode(mode) {
    localStorage.setItem(STORAGE_KEYS.SORT_MODE, mode);
}

export function loadDataSource() {
    const stored = localStorage.getItem(STORAGE_KEYS.SOURCE);
    if (stored === 'oncc' || stored === 'tencent') return stored;
    return 'oncc'; // Default
}

export function saveDataSource(source) {
    localStorage.setItem(STORAGE_KEYS.SOURCE, source);
}

export function loadColumnSettings() {
    const stored = localStorage.getItem(STORAGE_KEYS.COLS);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return null;
        }
    }
    return null;
}

let saveColumnTimeout = null;
export function saveColumnSettings(settings) {
    if (saveColumnTimeout) clearTimeout(saveColumnTimeout);
    saveColumnTimeout = setTimeout(() => {
        localStorage.setItem(STORAGE_KEYS.COLS, JSON.stringify(settings));
    }, 300);
}

export function loadHsiList() {
    const stored = localStorage.getItem(STORAGE_KEYS.HSI_LIST);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map(String).map(s => s.trim()).filter(Boolean).map(code => code.padStart(5, '0'));
            }
        } catch (_) {}
    }
    return null;
}

export function saveHsiList(codes) {
    localStorage.setItem(STORAGE_KEYS.HSI_LIST, JSON.stringify(codes));
}

export function loadHolidayCache() {
    const cached = localStorage.getItem(HOLIDAY_CACHE_KEY);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        if (!parsed || !parsed.data || !parsed.updatedAt) return null;
        // Check if cache is still valid
        if ((Date.now() - parsed.updatedAt) > HOLIDAY_CACHE_TTL_MS) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

export function saveHolidayCache(data) {
    localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(data));
}
