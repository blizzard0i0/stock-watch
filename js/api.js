// js/api.js
// API fetching functions with retry mechanism

import { CONFIG, HK_TIMEZONE, HK_UTC_OFFSET_MINUTES, MS_PER_MINUTE, FALLBACK_HK_HOLIDAYS_BY_YEAR } from './config.js';

let currentFetchToken = 0;

export function getFetchToken() {
    return ++currentFetchToken;
}

function withCacheBust(url) {
    if (!currentFetchToken) return url;
    if (/[?\u0026]_=(\d+)/.test(url)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_=${currentFetchToken}`;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const finalUrl = withCacheBust(url);
        const response = await fetch(finalUrl, {
            signal: controller.signal,
            cache: 'no-store',
            credentials: 'omit'
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function fetchWithRetry(url, options = {}) {
    const { maxRetries = 3, retryDelay = 1000, timeoutMs = 8000 } = options;
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, timeoutMs);
            if (response.ok) {
                return response;
            }
            if (response.status >= 400 && response.status < 500) {
                return response;
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
            
            // Check for CORS errors
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                console.warn(`CORS or network error for ${url}. Attempt ${attempt + 1}/${maxRetries}`);
                // Don't retry CORS errors immediately, they likely won't succeed
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
                }
            }
            if (attempt < maxRetries - 1) {
                const delay = retryDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// Timezone helpers
export function getHongKongShiftedDate(date = new Date()) {
    return new Date(date.getTime() + HK_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function getHongKongParts(date = new Date()) {
    const hkDate = getHongKongShiftedDate(date);
    return {
        year: hkDate.getUTCFullYear(),
        month: hkDate.getUTCMonth(),
        day: hkDate.getUTCDate(),
        weekday: hkDate.getUTCDay(),
        hour: hkDate.getUTCHours(),
        minute: hkDate.getUTCMinutes(),
        second: hkDate.getUTCSeconds()
    };
}

export function createUtcDateFromHongKongParts(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
    return new Date(Date.UTC(year, month, day, hour, minute, second, ms) - HK_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function formatHongKongTime(date = new Date(), options = {}) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: HK_TIMEZONE,
        hour12: false,
        ...options
    }).format(date);
}

export function getDateKey(date) {
    const parts = getHongKongParts(date);
    const month = String(parts.month + 1).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
}

export function isWeekday(date) {
    const { weekday } = getHongKongParts(date);
    return weekday >= 1 && weekday <= 5;
}

// Holiday functions
export async function fetchHolidayCalendar(year) {
    const response = await fetchWithRetry(`https://date.nager.at/api/v3/PublicHolidays/${year}/HK`, {
        maxRetries: 3,
        retryDelay: 1000,
        timeoutMs: 8000
    });
    if (!response.ok) throw new Error('Holiday calendar fetch failed');
    const data = await response.json();
    return data.map(entry => entry.date);
}

export function getFallbackHolidayPayload(year) {
    const fallbackDates = FALLBACK_HK_HOLIDAYS_BY_YEAR[year];
    if (!fallbackDates || fallbackDates.length === 0) return null;
    return {
        updatedAt: Date.now(),
        data: {
            [year]: fallbackDates,
            [year + 1]: []
        }
    };
}

// Stock API functions
function extractStockName(data) {
    if (!data || !data.daily) return '';
    const rawName = data.daily.nameChi || data.daily.nameEng || '';
    return String(rawName).trim();
}

export async function fetchStockDataOncc(code) {
    try {
        const response = await fetchWithRetry(`https://realtime-money18-cdn.on.cc/securityQuote/genStockDetailHKJSON.php?stockcode=${code}`, {
            maxRetries: 3,
            retryDelay: 1000,
            timeoutMs: 8000
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const name = extractStockName(data);
        if (!name) {
            throw new Error('Invalid stock code');
        }
        const prevClose = parseFloat(data.daily.preCPrice);
        const currentPrice = parseFloat(data.real.np);
        let change = 'N/A', pctChange = 'N/A', dayDirection = 'none';

        if (!isNaN(prevClose) && !isNaN(currentPrice)) {
            const rawChange = currentPrice - prevClose;
            change = rawChange.toFixed(3).replace(/\.?0+$/, '');
            pctChange = (((currentPrice - prevClose) / prevClose) * 100).toFixed(2);
            dayDirection = currentPrice > prevClose ? 'up' : currentPrice < prevClose ? 'down' : 'none';
        }

        return {
            code: code,
            name: name,
            quote: Number.isFinite(currentPrice) ? currentPrice : 'N/A',
            change: change,
            pctChange: pctChange,
            preClose: data.daily.preCPrice || 'N/A',
            open: data.opening?.openPrice || 'N/A',
            high: data.real?.dyh || 'N/A',
            low: data.real?.dyl || 'N/A',
            turnover: (() => {
                const tvrNum = parseInt(data?.real?.tvr, 10);
                if (!Number.isFinite(tvrNum)) return 'N/A';
                return (tvrNum / 1000000).toFixed(2);
            })(),
            dayDirection: dayDirection,
            error: false
        };
    } catch (error) {
        const isInvalid = error instanceof Error && error.message === 'Invalid stock code';
        return {
            code,
            name: isInvalid ? 'INVALID' : 'ERROR',
            quote: 'N/A',
            change: 'N/A',
            pctChange: 'N/A',
            preClose: 'N/A',
            open: 'N/A',
            high: 'N/A',
            low: 'N/A',
            turnover: 'N/A',
            dayDirection: 'none',
            error: true,
            errorMessage: isInvalid ? 'Invalid stock code.' : 'Data unavailable. Retrying on next refresh.'
        };
    }
}

// Tencent API
function decodeGbText(arrayBuffer) {
    try {
        return new TextDecoder('gb18030').decode(arrayBuffer);
    } catch (_) {
        try { return new TextDecoder('gbk').decode(arrayBuffer); } catch (_) {}
    }
    return new TextDecoder('utf-8').decode(arrayBuffer);
}

async function fetchTencentBatchRaw(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return new Map();
    const symbols = codes.map(c => `r_hk${String(c).padStart(5, '0')}`).join(',');
    const url = `https://qt.gtimg.cn/q=${symbols}`;
    const response = await fetchWithRetry(url, { maxRetries: 3, retryDelay: 1000, timeoutMs: 8000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buf = await response.arrayBuffer();
    const text = decodeGbText(buf);

    const map = new Map();
    const reLine = /v_(?:r_)?hk(\d{5})="([^"]*)"/g;
    let m;
    while ((m = reLine.exec(text)) !== null) {
        const code = m[1];
        const payload = m[2] || '';
        const parts = payload.split('~');
        map.set(code, parts);
    }
    return map;
}

function toTencentStockObject(code, parts) {
    const safe = (i) => (parts && parts[i] !== undefined) ? String(parts[i]).trim() : '';
    const name = safe(1);
    const priceStr = safe(3);
    const preCloseStr = safe(4);
    const openStr = safe(5);
    const changeStr = safe(31);
    const pctStr = safe(32);
    const highStr = safe(33);
    const lowStr = safe(34);

    const priceVal = parseFloat(priceStr);
    const preCloseVal = parseFloat(preCloseStr);

    const dayDirection = (() => {
        if (!isNaN(priceVal) && !isNaN(preCloseVal)) {
            if (priceVal > preCloseVal) return 'up';
            if (priceVal < preCloseVal) return 'down';
        }
        return 'none';
    })();

    const isValid = !!name && Number.isFinite(priceVal);
    if (!isValid) {
        return {
            code,
            name: name || 'ERROR',
            quote: 'N/A',
            change: 'N/A',
            pctChange: 'N/A',
            preClose: 'N/A',
            open: 'N/A',
            high: 'N/A',
            low: 'N/A',
            turnover: 'N/A',
            dayDirection: 'none',
            error: true,
            errorMessage: 'Data unavailable. Retrying on next refresh.'
        };
    }

    return {
        code,
        name,
        quote: priceStr || 'N/A',
        change: changeStr || (Number.isFinite(priceVal) && Number.isFinite(preCloseVal) ? (priceVal - preCloseVal).toFixed(3).replace(/\.?0+$/, '') : 'N/A'),
        pctChange: pctStr || (Number.isFinite(priceVal) && Number.isFinite(preCloseVal) && preCloseVal !== 0 ? (((priceVal - preCloseVal) / preCloseVal) * 100).toFixed(2) : 'N/A'),
        preClose: preCloseStr || 'N/A',
        open: openStr || 'N/A',
        high: highStr || 'N/A',
        low: lowStr || 'N/A',
        turnover: 'N/A',
        dayDirection,
        error: false
    };
}

export async function fetchStockDataTencentBatch(codes) {
    const normalized = (codes || []).map(c => String(c).trim().padStart(5, '0')).filter(Boolean);
    if (normalized.length === 0) return [];

    const map = await fetchTencentBatchRaw(normalized);
    return normalized.map(code => {
        const parts = map.get(code);
        if (!parts) {
            return {
                code,
                name: 'ERROR',
                quote: 'N/A',
                change: 'N/A',
                pctChange: 'N/A',
                preClose: 'N/A',
                open: 'N/A',
                high: 'N/A',
                low: 'N/A',
                turnover: 'N/A',
                dayDirection: 'none',
                error: true,
                errorMessage: 'Data unavailable. Retrying on next refresh.'
            };
        }
        return toTencentStockObject(code, parts);
    });
}

export async function fetchStockDataTencentForList(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return [];
    const out = [];
    const batchSize = CONFIG.TENCENT_BATCH_SIZE;
    for (let i = 0; i < codes.length; i += batchSize) {
        const batch = codes.slice(i, i + batchSize);
        const batchRes = await fetchStockDataTencentBatch(batch);
        out.push(...batchRes);
    }
    return out;
}

export async function fetchIndexData(indexCode) {
    try {
        const response = await fetchWithRetry(`https://realtime-money18-cdn.on.cc/securityQuote/genIndexDetailHKJSON.php?code=${indexCode}`, {
            maxRetries: 3,
            retryDelay: 1000,
            timeoutMs: 8000
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return { value: data.real?.value || 'N/A', difference: data.real?.difference || 'N/A' };
    } catch (error) { 
        return { value: 'N/A', difference: 'N/A' }; 
    }
}
