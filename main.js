// --------------------
// Config (集中常數 + storage keys，方便維護/升級)
// --------------------
const CONFIG = {
    DEFAULT_CODES: ['00388', '00700', '9992'],
    HSI_LIST_URL: './hsi_constituents.json',
    STORAGE_KEYS: {
        HSI_LIST: 'hk_hsi_list_v1',
        COLS: 'hk_stock_cols_v6',
        LIST: 'hk_stock_list_v1',
        INTERVAL: 'hk_stock_interval_v1',
        SORT_LEGACY: 'hk_stock_sort_v1',
        SORT_MODE: 'hk_stock_sort_mode_v1'
    },
    TRADE: {
        START_HOUR: 9,
        START_MIN: 0,
        MORNING_END_HOUR: 12,
        MORNING_END_MIN: 0,
        AFTERNOON_START_HOUR: 13,
        AFTERNOON_START_MIN: 0,
        END_HOUR: 16,
        END_MIN: 10
    },
    SCHEDULER: {
        // Avoid extremely large setTimeout() delays (iOS Safari/PWA stability)
        MAX_TIMEOUT_MS: 1000 * 60 * 60,   // 1 hour
        CLOSED_TICK_MS: 1000 * 60         // 60 seconds
    },
    HSI_BATCH_SIZE: 20
};

const DEFAULT_CODES = CONFIG.DEFAULT_CODES;

// --- 恒生指數成份股 (HSI) list ---
// NOTE: 成份股會不時調整。如你要更新：
// 1) 直接修改 DEFAULT_HSI_CODES；或
// 2) 在同一個目錄放一個 hsi_constituents.json (內容係 ['00001','00002',...])，系統會優先讀取。
const HSI_LIST_URL = CONFIG.HSI_LIST_URL;
const STORAGE_KEY_HSI_LIST = CONFIG.STORAGE_KEYS.HSI_LIST;
const DEFAULT_HSI_CODES = ["00001", "00002", "00003", "00005", "00006", "00011", "00012", "00016", "00017", "00019", "00020", "00027", "00066", "00101", "00135", "00144", "00151", "00175", "00267", "00288", "00291", "00386", "00388", "00390", "00493", "00669", "00688", "00700", "00762", "00823", "00836", "00857", "00883", "00939", "00941", "00960", "00981", "00992", "01024", "01038", "01088", "01093", "01109", "01113", "01114", "01177", "01211", "01299", "01398", "01516", "01618", "01810", "01833", "01928", "01972", "01988", "02007", "02269", "02313", "02318", "02319", "02328", "02382", "02628", "02828", "03328", "03690", "03888", "03968", "03988", "06098", "06618", "06862", "09618", "09868", "09988"];

let hsiCodes = [...DEFAULT_HSI_CODES];
let listMode = 'watch'; // 'watch' | 'hsi'

const STORAGE_KEY_COLS = CONFIG.STORAGE_KEYS.COLS;
const STORAGE_KEY_LIST = CONFIG.STORAGE_KEYS.LIST;
const STORAGE_KEY_INTERVAL = CONFIG.STORAGE_KEYS.INTERVAL;
const STORAGE_KEY_SORT = CONFIG.STORAGE_KEYS.SORT_LEGACY; // legacy (code asc/desc)
const STORAGE_KEY_SORT_MODE = CONFIG.STORAGE_KEYS.SORT_MODE; // new (code / %desc / %asc)

let stockCodes = [];
let stockStates = {};
const dom = {};
const indexElements = {};
const rowCache = new Map();
let isRefreshing = false;
let currentFetchToken = 0;

// --- State for Index Arrows ---
let indexStates = {
    hsi: { lastPrice: null, arrow: '' },
    china_index: { lastPrice: null, arrow: '' }
};

let indexDataCache = {
    hsi: { value: 'N/A', difference: 'N/A' },
    china_index: { value: 'N/A', difference: 'N/A' }
};

let refreshTimer = null;
let schedulerToken = 0;
let lastScheduledTickMs = 0;
let refreshRateSec = 5; // Default 5s
// Sorting display mode:
// - code: stock number small -> large
// - pct_desc: % change large -> small
// - pct_asc: % change small -> large
let sortMode = 'code';

const TRADE_START_HOUR = CONFIG.TRADE.START_HOUR;
const TRADE_START_MIN = CONFIG.TRADE.START_MIN;  // 9:00
const TRADE_MORNING_END_HOUR = CONFIG.TRADE.MORNING_END_HOUR;
const TRADE_MORNING_END_MIN = CONFIG.TRADE.MORNING_END_MIN; // 12:00
const TRADE_AFTERNOON_START_HOUR = CONFIG.TRADE.AFTERNOON_START_HOUR;
const TRADE_AFTERNOON_START_MIN = CONFIG.TRADE.AFTERNOON_START_MIN; // 13:00
const TRADE_END_HOUR = CONFIG.TRADE.END_HOUR;
const TRADE_END_MIN = CONFIG.TRADE.END_MIN;   // 16:10

const HOLIDAY_CACHE_KEY = 'hk_holiday_calendar_v1';
const HOLIDAY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
// Update annually with current-year HK holidays for offline fallback.
const FALLBACK_HK_HOLIDAYS_BY_YEAR = {
    2026: [
        '2026-01-01',
        '2026-02-17',
        '2026-02-18',
        '2026-02-19',
        '2026-04-03',
        '2026-04-04',
        '2026-04-05',
        '2026-04-06',
        '2026-04-07',
        '2026-05-01',
        '2026-05-24',
        '2026-05-25',
        '2026-06-19',
        '2026-07-01',
        '2026-09-26',
        '2026-10-01',
        '2026-10-18',
        '2026-10-19',
        '2026-12-25',
        '2026-12-26'
    ]
};

let holidayState = {
    status: 'loading',
    dates: new Set(),
    source: 'none'
};

const numberFormatters = {
    price: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
    percent: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    turnover: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

function sortStocks() {
    // Keep stored list in a stable, predictable order (code asc).
    stockCodes.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function loadStockList() {
    const stored = localStorage.getItem(STORAGE_KEY_LIST);
    if (stored) {
        try { stockCodes = JSON.parse(stored); } catch (e) { stockCodes = [...DEFAULT_CODES]; }
    } else { stockCodes = [...DEFAULT_CODES]; }
    sortStocks();
}

function saveStockList() { localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(stockCodes)); }

async function loadHsiConstituents() {
    // Priority:
    // 1) Same-origin JSON file: ./hsi_constituents.json
    // 2) localStorage cache (manual override)
    // 3) DEFAULT_HSI_CODES
    try {
        const response = await fetchWithTimeout(HSI_LIST_URL, 5000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                hsiCodes = data.map(String).map(s => s.trim()).filter(Boolean).map(code => code.padStart(5, '0'));
                localStorage.setItem(STORAGE_KEY_HSI_LIST, JSON.stringify(hsiCodes));
                return;
            }
        }
    } catch (_) {}

    const cached = localStorage.getItem(STORAGE_KEY_HSI_LIST);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                hsiCodes = parsed.map(String).map(s => s.trim()).filter(Boolean).map(code => code.padStart(5, '0'));
                return;
            }
        } catch (_) {}
    }

    hsiCodes = [...DEFAULT_HSI_CODES];
}

function isHsiMode() {
    return listMode === 'hsi';
}

function updateToggleButtonUI() {
    if (!dom.toggleListButton) return;
    if (isHsiMode()) {
        dom.toggleListButton.classList.add('active');
        dom.toggleListButton.textContent = 'WL';
        dom.toggleListButton.setAttribute('aria-label', 'Switch list back to watch list');
        dom.toggleListButton.title = 'Back to Watchlist';
    } else {
        dom.toggleListButton.classList.remove('active');
        dom.toggleListButton.textContent = 'HSI';
        dom.toggleListButton.setAttribute('aria-label', 'Switch list to Hang Seng Index constituents');
        dom.toggleListButton.title = 'Switch to HSI constituents';
    }
}

function setControlsEnabled(enabled) {
    // Disable watchlist editing controls while viewing HSI constituents
    const toToggle = [
        dom.addStockButton,
        dom.newStockInput,
        dom.resetButton
    ];
    toToggle.forEach(el => {
        if (!el) return;
        el.disabled = !enabled;
    });
}

function switchToHsiList() {
    listMode = 'hsi';
    stockCodes = [...hsiCodes];
    sortStocks();
    updateToggleButtonUI();
    setControlsEnabled(false);
    showToast('HSI constituents mode');
    updateStockTable();
}

function switchToWatchList() {
    listMode = 'watch';
    loadStockList(); // Restore from localStorage
    updateToggleButtonUI();
    setControlsEnabled(true);
    showToast('Watchlist mode');
    updateStockTable();
}

function toggleListMode() {
    if (isHsiMode()) switchToWatchList();
    else switchToHsiList();
}

let toastTimer = null;
function showToast(message, durationMs = 1200) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        dom.toast.classList.remove('show');
    }, durationMs);
}

function loadRefreshInterval() {
    const stored = localStorage.getItem(STORAGE_KEY_INTERVAL);
    if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 3) refreshRateSec = val;
    }
    dom.refreshInput.value = refreshRateSec;
}

function loadSortMode() {
    // Migrate: if legacy key existed, ignore it and default to 'code'
    const stored = localStorage.getItem(STORAGE_KEY_SORT_MODE);
    if (stored === 'code' || stored === 'pct_desc' || stored === 'pct_asc') {
        sortMode = stored;
    }
    updateSortModeButtons();
}

function setSortMode(nextMode) {
    sortMode = nextMode;
    localStorage.setItem(STORAGE_KEY_SORT_MODE, sortMode);
    updateSortModeButtons();
    updateStockTable();
}

function cycleSortMode() {
    const next = sortMode === 'code'
        ? 'pct_desc'
        : (sortMode === 'pct_desc' ? 'pct_asc' : 'code');
    setSortMode(next);
}

function sortModeLabelShort() {
    if (sortMode === 'pct_desc') return '%↓';
    if (sortMode === 'pct_asc') return '%↑';
    return '123';
}

function sortModeLabelLong() {
    if (sortMode === 'pct_desc') return 'Sort: % High→Low';
    if (sortMode === 'pct_asc') return 'Sort: % Low→High';
    return 'Sort: Code';
}

function updateSortModeButtons() {
    if (dom.sortModeButton) {
        dom.sortModeButton.textContent = sortModeLabelShort();
        dom.sortModeButton.title = sortModeLabelLong();
    }
    if (dom.sortButton) {
        dom.sortButton.textContent = sortModeLabelLong();
    }
}

function getSortedStockData(stockData) {
    const normalizePct = (s) => {
        const v = parseFloat(s.pctChange);
        return Number.isFinite(v) ? v : null;
    };

    const sorted = [...stockData];
    if (sortMode === 'code') {
        sorted.sort((a, b) => parseInt(a.code, 10) - parseInt(b.code, 10));
        return sorted;
    }

    const dir = sortMode === 'pct_desc' ? -1 : 1; // -1 => desc, +1 => asc
    sorted.sort((a, b) => {
        const pa = normalizePct(a);
        const pb = normalizePct(b);
        const aBad = pa === null;
        const bBad = pb === null;
        if (aBad && bBad) return parseInt(a.code, 10) - parseInt(b.code, 10);
        if (aBad) return 1;  // N/A always at bottom
        if (bBad) return -1;
        if (pa === pb) return parseInt(a.code, 10) - parseInt(b.code, 10);
        return (pa - pb) * dir;
    });
    return sorted;
}

function setRefreshInterval() {
    const input = dom.refreshInput;
    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < 3) {
        showInputMessage(dom.refreshMessage, 'Enter 3 seconds or more.');
        input.value = refreshRateSec;
        return;
    }
    refreshRateSec = val;
    localStorage.setItem(STORAGE_KEY_INTERVAL, refreshRateSec);
    showInputMessage(dom.refreshMessage, 'Refresh updated.', true);
    scheduleNextRefresh();
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isWeekday(date) {
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function isHolidayDate(date) {
    if (holidayState.status !== 'ready') return false;
    return holidayState.dates.has(getDateKey(date));
}

async function fetchHolidayCalendar(year) {
    const response = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/HK`, 8000);
    if (!response.ok) throw new Error('Holiday calendar fetch failed');
    const data = await response.json();
    return data.map(entry => entry.date);
}

function loadHolidayCache() {
    const cached = localStorage.getItem(HOLIDAY_CACHE_KEY);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        if (!parsed || !parsed.data || !parsed.updatedAt) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function setHolidayStateFromCache(cache, source) {
    const dates = [];
    Object.values(cache.data).forEach(list => {
        if (Array.isArray(list)) dates.push(...list);
    });
    holidayState = {
        status: 'ready',
        dates: new Set(dates),
        source: source
    };
}

function getFallbackHolidayPayload(year) {
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

async function loadHolidayCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const nextYear = year + 1;
    const cache = loadHolidayCache();
    const cacheValid = cache
        && cache.data
        && cache.data[year]
        && cache.data[nextYear]
        && (Date.now() - cache.updatedAt) < HOLIDAY_CACHE_TTL_MS;

    if (cacheValid) {
        setHolidayStateFromCache(cache, 'cache');
        return;
    }

    try {
        const [currentYearDates, nextYearDates] = await Promise.all([
            fetchHolidayCalendar(year),
            fetchHolidayCalendar(nextYear)
        ]);
        const payload = {
            updatedAt: Date.now(),
            data: {
                [year]: currentYearDates,
                [nextYear]: nextYearDates
            }
        };
        localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(payload));
        setHolidayStateFromCache(payload, 'live');
    } catch (error) {
        if (cache) {
            setHolidayStateFromCache(cache, 'cache-stale');
            return;
        }

        const fallback = getFallbackHolidayPayload(year);
        if (fallback) {
            setHolidayStateFromCache(fallback, 'fallback');
            return;
        }

        holidayState = { status: 'unavailable', dates: new Set(), source: 'none' };
    }
}

function getTradingDayStart(date) {
    const target = new Date(date);
    target.setHours(TRADE_START_HOUR, TRADE_START_MIN, 0, 0);
    return target;
}

function getNextTradingDayStart(fromDate) {
    const target = new Date(fromDate);
    target.setDate(target.getDate() + 1);
    target.setHours(TRADE_START_HOUR, TRADE_START_MIN, 0, 0);
    while (!isWeekday(target) || isHolidayDate(target)) {
        target.setDate(target.getDate() + 1);
    }
    return target;
}

function getMarketStatus(now = new Date()) {
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const morningStart = TRADE_START_HOUR * 60 + TRADE_START_MIN;
    const morningEnd = TRADE_MORNING_END_HOUR * 60 + TRADE_MORNING_END_MIN;
    const afternoonStart = TRADE_AFTERNOON_START_HOUR * 60 + TRADE_AFTERNOON_START_MIN;
    const afternoonEnd = TRADE_END_HOUR * 60 + TRADE_END_MIN;

    if (!isWeekday(now)) {
        return { state: 'closed', reason: 'Weekend', nextOpen: getNextTradingDayStart(now) };
    }

    if (isHolidayDate(now)) {
        return { state: 'holiday', reason: 'Holiday', nextOpen: getNextTradingDayStart(now) };
    }

    if (minutesNow >= morningStart && minutesNow < morningEnd) {
        return { state: 'open', session: 'morning' };
    }

    if (minutesNow >= afternoonStart && minutesNow <= afternoonEnd) {
        return { state: 'open', session: 'afternoon' };
    }

    if (minutesNow >= morningEnd && minutesNow < afternoonStart) {
        const nextOpen = new Date(now);
        nextOpen.setHours(TRADE_AFTERNOON_START_HOUR, TRADE_AFTERNOON_START_MIN, 0, 0);
        return { state: 'lunch', reason: 'Lunch Break', nextOpen };
    }

    if (minutesNow < morningStart) {
        return { state: 'closed', reason: 'Before open', nextOpen: getTradingDayStart(now) };
    }

    return { state: 'closed', reason: 'After hours', nextOpen: getNextTradingDayStart(now) };
}

function isTradingHours() {
    const marketStatus = getMarketStatus();
    return marketStatus.state === 'open';
}

function scheduleNextRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    // Token to invalidate any previously scheduled callbacks
    const myToken = ++schedulerToken;
    const statusEl = dom.status;
    const nextRefreshEl = dom.nextRefresh;
    const now = new Date();
    const marketStatus = getMarketStatus(now);

    const maxTimeout = CONFIG.SCHEDULER.MAX_TIMEOUT_MS;
    const closedTickMs = CONFIG.SCHEDULER.CLOSED_TICK_MS;

    if (marketStatus.state === 'open') {
        if (holidayState.status === 'unavailable') {
            statusEl.textContent = 'Active (Holiday calendar unavailable)';
            statusEl.style.color = '#cc6600';
        } else {
            statusEl.textContent = 'Active (Mon-Fri 9:00-12:00, 13:00-16:10)';
            statusEl.style.color = '#006600';
        }
        // If we just transitioned into open state, refresh once immediately.
        if (!lastScheduledTickMs) {
            lastScheduledTickMs = now.getTime();
            updateStockTable().finally(() => {
                if (myToken !== schedulerToken) return;
                scheduleNextRefresh();
            });
            return;
        }

        // Keep the configured refresh frequency as close as possible.
        // Schedule based on the last tick target time, not "finish time".
        const intervalMs = refreshRateSec * 1000;
        const nowMs = now.getTime();
        const targetMs = lastScheduledTickMs ? (lastScheduledTickMs + intervalMs) : (nowMs + intervalMs);
        const effectiveTargetMs = targetMs < nowMs ? nowMs : targetMs;
        lastScheduledTickMs = effectiveTargetMs;

        const nextTime = new Date(effectiveTargetMs);
        nextRefreshEl.textContent = nextTime.toLocaleTimeString();

        const delayMs = Math.min(Math.max(0, effectiveTargetMs - nowMs), maxTimeout);
        refreshTimer = setTimeout(() => {
            if (myToken !== schedulerToken) return;
            updateStockTable().finally(() => {
                if (myToken !== schedulerToken) return;
                scheduleNextRefresh();
            });
        }, delayMs);
        return;
    }

    // Not open: reset tick baseline
    lastScheduledTickMs = 0;

    const nextStart = marketStatus.nextOpen || getNextTradingDayStart(now);
    const delay = nextStart.getTime() - now.getTime();

    if (marketStatus.state === 'lunch') {
        statusEl.textContent = 'Lunch Break (12:00-13:00)';
        statusEl.style.color = '#cc6600';
    } else if (marketStatus.state === 'holiday') {
        statusEl.textContent = 'Market Holiday';
        statusEl.style.color = '#cc6600';
    } else {
        statusEl.textContent = `Market Closed (${marketStatus.reason})`;
        statusEl.style.color = '#cc6600';
    }

    const dateStr = nextStart.toLocaleDateString() + ' ' + nextStart.toLocaleTimeString();
    nextRefreshEl.textContent = dateStr;

    if (delay > 0) {
        // Avoid very large delays; keep a short heartbeat and re-calc.
        const delayMs = Math.min(delay, maxTimeout);
        refreshTimer = setTimeout(() => {
            if (myToken !== schedulerToken) return;
            // If we're still not open, just re-calc (cheap). When it becomes open,
            // it will start refreshing again.
            scheduleNextRefresh();
        }, delayMs);
    } else {
        refreshTimer = setTimeout(() => {
            if (myToken !== schedulerToken) return;
            scheduleNextRefresh();
        }, closedTickMs);
    }
}

function showInputMessage(target, message, isSuccess = false) {
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('success', isSuccess);
    if (message) {
        setTimeout(() => {
            if (target.textContent === message) {
                target.textContent = '';
                target.classList.remove('success');
            }
        }, 3000);
    }
}

async function addStock() {
    if (isHsiMode()) { showInputMessage(dom.addStockMessage, 'HSI list is view-only.'); return; }
    const input = dom.newStockInput;
    let code = input.value.trim();
    if (!code) return;
    if (!/^\d+$/.test(code)) {
        showInputMessage(dom.addStockMessage, 'Use digits only.');
        return;
    }
    if (code.length > 5) {
        showInputMessage(dom.addStockMessage, 'Max 5 digits.');
        return;
    }
    while (code.length < 5) code = '0' + code;
    if (stockCodes.includes(code)) {
        showInputMessage(dom.addStockMessage, 'Stock already added.');
        input.value = '';
        return;
    }
    if (dom.addStockButton) dom.addStockButton.disabled = true;
    input.disabled = true;
    showInputMessage(dom.addStockMessage, 'Validating...');
    const validation = await fetchStockData(code);
    if (validation.error) {
        showInputMessage(
            dom.addStockMessage,
            validation.errorMessage === 'Invalid stock code.'
                ? 'Invalid stock code.'
                : 'Unable to validate now. Try again.'
        );
        if (dom.addStockButton) dom.addStockButton.disabled = false;
        input.disabled = false;
        return;
    }
    stockCodes.push(code);
    sortStocks();
    saveStockList();
    input.value = '';
    showInputMessage(dom.addStockMessage, 'Stock added.', true);
    updateStockTable();
    if (dom.addStockButton) dom.addStockButton.disabled = false;
    input.disabled = false;
}

function removeStock(code) {
    if (isHsiMode()) return;
    stockCodes = stockCodes.filter(c => c !== code);
    saveStockList();
    updateStockTable();
}

function resetDefaults() {
    if (isHsiMode()) return;
    if (confirm('Reset to original stock list?')) {
        stockCodes = [...DEFAULT_CODES];
        sortStocks();
        saveStockList();
        updateStockTable();
    }
}

function formatNumber(value, formatter) {
    if (value === 'N/A' || value === undefined || value === null) return 'N/A';
    const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (Number.isNaN(numeric)) return 'N/A';
    return formatter.format(numeric);
}

function withCacheBust(url) {
    if (!currentFetchToken) return url;
    if (/[?&]_=(\d+)/.test(url)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_=${currentFetchToken}`;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const finalUrl = withCacheBust(url);
        // IMPORTANT:
        // Do NOT send custom request headers here.
        // Adding headers like Cache-Control/Pragma triggers a CORS preflight on iOS Safari,
        // and the on.cc endpoint may not allow OPTIONS, causing all requests to fail.
        // We rely on cache: 'no-store' + a cache-busting query parameter instead.
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

function extractStockName(data) {
    if (!data || !data.daily) return '';
    const rawName = data.daily.nameChi || data.daily.nameEng || '';
    return String(rawName).trim();
}

async function fetchStockData(code) {
    try {
        const response = await fetchWithTimeout(`https://realtime-money18-cdn.on.cc/securityQuote/genStockDetailHKJSON.php?stockcode=${code}`);
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
            open: data.opening.openPrice || 'N/A',
            high: data.real.dyh || 'N/A',
            low: data.real.dyl || 'N/A',
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

async function fetchIndexData(indexCode) {
    try {
        const response = await fetchWithTimeout(`https://realtime-money18-cdn.on.cc/securityQuote/genIndexDetailHKJSON.php?code=${indexCode}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return { value: data.real.value || 'N/A', difference: data.real.difference || 'N/A' };
    } catch (error) { return { value: 'N/A', difference: 'N/A' }; }
}

function getTickArrow(code, currentPriceStr, dayDirection) {
    const currentPrice = parseFloat(currentPriceStr);
    if (isNaN(currentPrice)) return '';
    let arrow = '';
    if (stockStates[code]) {
        const lastPrice = stockStates[code].lastPrice;
        const lastArrow = stockStates[code].arrow;
        if (currentPrice > lastPrice) arrow = '↑';
        else if (currentPrice < lastPrice) arrow = '↓';
        else arrow = lastArrow;
    } else {
        if (dayDirection === 'up') arrow = '↑';
        else if (dayDirection === 'down') arrow = '↓';
    }
    stockStates[code] = { lastPrice: currentPrice, arrow: arrow };
    return arrow;
}

function createCell(tag, className, text) {
    const cell = document.createElement(tag);
    if (className) cell.className = className;
    if (text !== undefined) cell.textContent = text;
    return cell;
}

function createLink({ href, text, className }) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.className = className || '';
    link.textContent = text;
    return link;
}

function createButton({ className, title, text, onClick }) {
    const button = document.createElement('button');
    button.className = className || '';
    button.title = title || '';
    button.textContent = text;
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

function createArrowSpan(symbol, label) {
    const wrapper = document.createElement('span');
    const arrowSpan = document.createElement('span');
    arrowSpan.textContent = symbol;
    arrowSpan.setAttribute('aria-hidden', 'true');

    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = label;

    wrapper.append(arrowSpan, srText);
    return { wrapper, arrowSpan, srText };
}

function createTrendIndicator(direction) {
    if (!direction || direction === 'none') return null;
    const symbol = direction === 'up' ? '▲' : '▼';
    const span = document.createElement('span');
    span.className = `trend-indicator ${direction === 'up' ? 'arrow-up' : 'arrow-down'}`;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = symbol;
    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = direction === 'up' ? 'Up' : 'Down';
    const wrapper = document.createElement('span');
    wrapper.append(span, srText);
    return wrapper;
}

function getRowForStock(code) {
    if (rowCache.has(code)) return rowCache.get(code);

    const row = document.createElement('tr');
    const noLink = createLink({ href: '#', className: 'stock-link', text: '' });
    const nameLink = createLink({ href: '#', className: 'stock-link', text: '' });
    const deleteButton = createButton({
        className: 'btn-delete',
        title: 'Remove Stock',
        text: '✕',
        onClick: () => removeStock(code)
    });
    const dayRangeIndicator = createArrowSpan('', '');
    const tickIndicator = createArrowSpan('', '');
    const quoteText = document.createTextNode('');
    const cells = {
        no: createCell('td', 'stock-no'),
        name: createCell('td', 'stock-name'),
        quote: createCell('td', 'rt-quote'),
        change: createCell('td', ''),
        pct: createCell('td', ''),
        preClose: createCell('td', ''),
        open: createCell('td', ''),
        high: createCell('td', ''),
        low: createCell('td', ''),
        turnover: createCell('td', ''),
        action: createCell('td', ''),
        spacer: createCell('td', '')
    };

    cells.no.appendChild(noLink);
    cells.name.appendChild(nameLink);
    cells.quote.append(dayRangeIndicator.wrapper, tickIndicator.wrapper, quoteText);
    cells.action.appendChild(deleteButton);

    row.append(
        cells.no,
        cells.name,
        cells.quote,
        cells.change,
        cells.pct,
        cells.preClose,
        cells.open,
        cells.high,
        cells.low,
        cells.turnover,
        cells.action,
        cells.spacer
    );

    rowCache.set(code, {
        row,
        cells,
        noLink,
        nameLink,
        deleteButton,
        dayRangeIndicator,
        tickIndicator,
        quoteText
    });
    return rowCache.get(code);
}

async function fetchStockDataForVisibleList(codes) {
    // Only update what user is currently viewing (watchlist or HSI list).
    // In HSI mode, update in batches to avoid firing 70+ requests at once.
    if (!Array.isArray(codes) || codes.length === 0) return [];
    if (!isHsiMode() || codes.length <= CONFIG.HSI_BATCH_SIZE) {
        return Promise.all(codes.map(code => fetchStockData(code)));
    }

    const out = [];
    const batchSize = CONFIG.HSI_BATCH_SIZE;
    for (let i = 0; i < codes.length; i += batchSize) {
        const batch = codes.slice(i, i + batchSize);
        // Keep within-batch concurrency at 20, as requested.
        const batchRes = await Promise.all(batch.map(code => fetchStockData(code)));
        out.push(...batchRes);
    }
    return out;
}

async function updateStockTable() {
    if (isRefreshing) return;
    isRefreshing = true;
    currentFetchToken = Date.now();
    const startTime = performance.now(); // START TIMER
    try {
        const tbody = dom.tbody;
        if (stockCodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12">No stocks in list.</td></tr>';
            rowCache.clear();
            return;
        }
        if (tbody.children.length === 0) tbody.innerHTML = '<tr><td colspan="12">Loading data...</td></tr>';

        const codesToUpdate = [...stockCodes];
        const [stockSettled, hsiSettled, hsceiSettled] = await Promise.allSettled([
            fetchStockDataForVisibleList(codesToUpdate),
            fetchIndexData('HSI'),
            fetchIndexData('HSCEI')
        ]);

        const stockData = stockSettled.status === 'fulfilled'
            ? stockSettled.value
            : codesToUpdate.map(code => ({
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
            }));

        const hsiData = hsiSettled.status === 'fulfilled' ? hsiSettled.value : indexDataCache.hsi;
        const hsceiData = hsceiSettled.status === 'fulfilled' ? hsceiSettled.value : indexDataCache.china_index;

        const fragment = document.createDocumentFragment();
        const seenCodes = new Set();

        const displayData = getSortedStockData(stockData);

        displayData.forEach(stock => {
            seenCodes.add(stock.code);
            const {
                row,
                cells,
                noLink,
                nameLink,
                dayRangeIndicator,
                tickIndicator,
                quoteText,
                deleteButton
            } = getRowForStock(stock.code);
            const pctValue = parseFloat(stock.pctChange);
            const priceVal = parseFloat(stock.quote);
            const preCloseVal = parseFloat(stock.preClose);
            const highVal = parseFloat(stock.high);
            const lowVal = parseFloat(stock.low);

            row.className = (!isNaN(pctValue) && (pctValue > 10 || pctValue < -10)) ? 'highlight' : '';
            row.classList.remove('row-error');
            if (stock.error) row.classList.add('row-error');
            row.title = stock.error ? (stock.errorMessage || 'Data unavailable.') : '';

            // --- 2. Color Logic for Columns 1-5 ---
            let fontClass = '';
            if (!isNaN(priceVal) && !isNaN(preCloseVal)) {
                if (priceVal === preCloseVal) { fontClass = 'style-flat'; }
                else if (priceVal > preCloseVal) {
                    if (pctValue > 5) fontClass = 'style-rise-big'; else fontClass = 'style-rise-small';
                } else {
                    if (pctValue < -5) fontClass = 'style-fall-big'; else fontClass = 'style-fall-small';
                }
            }

            // --- 3. Price Change Highlight (Lighter Background) ---
            let bgTickClass = '';
            if (stockStates[stock.code] && !isNaN(priceVal)) {
                const lastPrice = stockStates[stock.code].lastPrice;
                if (priceVal > lastPrice) {
                    bgTickClass = 'bg-tick-up';
                } else if (priceVal < lastPrice) {
                    bgTickClass = 'bg-tick-down';
                }
            }

            // --- 4. Arrow Logic ---
            const arrowSymbol = getTickArrow(stock.code, stock.quote, stock.dayDirection);
            const arrowClass = arrowSymbol === '↑' ? 'arrow-up' : arrowSymbol === '↓' ? 'arrow-down' : 'arrow-none';

            // --- 5. Extra Day High/Low Arrow ---
            let dayRangeArrow = '';
            if (!isNaN(priceVal)) {
                if (!isNaN(highVal) && priceVal >= highVal && priceVal > 0) dayRangeArrow = '↑';
                else if (!isNaN(lowVal) && priceVal <= lowVal && priceVal > 0) dayRangeArrow = '↓';
            }

            const displayCode = stock.code.replace(/^0+(\d+)/, '$1');
            const linkUrlQuote = `https://www.aastocks.com/tc/stocks/quote/detail-quote.aspx?symbol=${stock.code}`;
            const linkUrlTransaction = `http://www.etnet.com.hk/www/tc/stocks/realtime/quote_transaction.php?code=${displayCode}`;

            // Disable delete button in HSI mode (view-only)
            if (deleteButton) {
                deleteButton.disabled = isHsiMode();
                deleteButton.style.visibility = isHsiMode() ? 'hidden' : 'visible';
            }

            cells.no.className = `stock-no ${fontClass}`.trim();
            noLink.href = linkUrlQuote;
            noLink.textContent = displayCode;

            cells.name.className = `stock-name ${fontClass}`.trim();
            nameLink.href = linkUrlTransaction;
            nameLink.textContent = stock.name;

            cells.quote.className = `rt-quote ${fontClass} ${bgTickClass}`.trim();
            if (dayRangeArrow) {
                dayRangeIndicator.arrowSpan.textContent = dayRangeArrow;
                dayRangeIndicator.arrowSpan.className = dayRangeArrow === '↑' ? 'arrow-up' : 'arrow-down';
                dayRangeIndicator.srText.textContent = dayRangeArrow === '↑' ? 'Day high' : 'Day low';
                dayRangeIndicator.wrapper.hidden = false;
            } else {
                dayRangeIndicator.wrapper.hidden = true;
            }
            if (arrowSymbol) {
                tickIndicator.arrowSpan.textContent = arrowSymbol;
                tickIndicator.arrowSpan.className = arrowClass;
                tickIndicator.srText.textContent = arrowSymbol === '↑' ? 'Tick up' : 'Tick down';
                tickIndicator.wrapper.hidden = false;
            } else {
                tickIndicator.wrapper.hidden = true;
            }
            const formattedQuote = formatNumber(stock.quote, numberFormatters.price);
            const hasIndicators = !dayRangeIndicator.wrapper.hidden || !tickIndicator.wrapper.hidden;
            quoteText.textContent = `${hasIndicators ? ' ' : ''}${formattedQuote}`;

            cells.change.className = fontClass;
            cells.change.textContent = formatNumber(stock.change, numberFormatters.price);

            cells.pct.className = fontClass;
            const pctText = stock.pctChange === 'N/A'
                ? 'N/A'
                : `${formatNumber(stock.pctChange, numberFormatters.percent)}%`;
            cells.pct.textContent = pctText;
            cells.preClose.textContent = formatNumber(stock.preClose, numberFormatters.price);
            cells.open.textContent = formatNumber(stock.open, numberFormatters.price);
            cells.high.textContent = formatNumber(stock.high, numberFormatters.price);
            cells.low.textContent = formatNumber(stock.low, numberFormatters.price);
            cells.turnover.textContent = formatNumber(stock.turnover, numberFormatters.turnover);

            fragment.appendChild(row);
        });

        rowCache.forEach((_value, code) => {
            if (!seenCodes.has(code)) rowCache.delete(code);
        });

        tbody.replaceChildren(fragment);

        // Top Right: Date/Time Only (Removed duration)
        dom.currentTime.textContent = `${new Date().toLocaleTimeString()}`;

	updateIndexDisplay('hsi', hsiData);
        updateIndexDisplay('china_index', hsceiData);
        indexDataCache = {
            hsi: hsiData,
            china_index: hsceiData
        };
    } finally {
        isRefreshing = false;
    }
}

// --- NEW: Dynamic Index Arrow Logic ---
function updateIndexDisplay(prefix, data) {
    const elements = indexElements[prefix];
    if (!elements) return;
    elements.valueEl.textContent = data.value;
    const diff = parseFloat(data.difference);
    elements.changeEl.textContent = (diff > 0 ? '+' : '') + data.difference;

    const arrowEl = elements.arrowEl;
    const wrapperEl = elements.wrapperEl;

    // 1. Color Logic (Daily)
    if (diff > 0) {
        if (wrapperEl) wrapperEl.style.color = 'blue';
    } else if (diff < 0) {
        if (wrapperEl) wrapperEl.style.color = 'red';
    } else {
        if (wrapperEl) wrapperEl.style.color = 'black';
    }

    // 2. Arrow Logic (Tick)
    const currentVal = parseFloat(data.value.replace(/,/g, '')); // Remove commas
    if (isNaN(currentVal)) return;

    let arrow = '';
    const stateKey = prefix; // 'hsi' or 'china_index'

    if (indexStates[stateKey]) {
        const lastPrice = indexStates[stateKey].lastPrice;
        const lastArrow = indexStates[stateKey].arrow;

        if (lastPrice !== null) {
            if (currentVal > lastPrice) arrow = '↑';
            else if (currentVal < lastPrice) arrow = '↓';
            else arrow = lastArrow; // Keep previous
        } else {
            // First load default (use daily trend)
            if (diff > 0) arrow = '↑';
            else if (diff < 0) arrow = '↓';
        }

        // Update State
        indexStates[stateKey].lastPrice = currentVal;
        indexStates[stateKey].arrow = arrow;
    }

    // Render
    if (!arrow) {
        arrowEl.textContent = '';
        arrowEl.removeAttribute('aria-label');
        return;
    }

    arrowEl.textContent = arrow;
    arrowEl.className = arrow === '↑' ? 'up' : arrow === '↓' ? 'down' : '';
    arrowEl.setAttribute('aria-label', arrow === '↑' ? 'Index tick up' : 'Index tick down');
}

function dayDirectionFromValues(priceVal, preCloseVal) {
    if (!isNaN(priceVal) && !isNaN(preCloseVal)) {
        if (priceVal > preCloseVal) return 'up';
        if (priceVal < preCloseVal) return 'down';
    }
    return 'none';
}

// --- Resizing & Persistence ---
function saveColumnSettings() {
    const headers = dom.stockTable.querySelectorAll('th');
    const widths = [];
    headers.forEach(th => widths.push(th.style.width));
    const tableWidth = dom.stockTable.style.width;
    localStorage.setItem(STORAGE_KEY_COLS, JSON.stringify({ colWidths: widths, tableWidth: tableWidth }));
}

function loadColumnSettings() {
    const stored = localStorage.getItem(STORAGE_KEY_COLS);
    if (stored) {
        try {
            const settings = JSON.parse(stored);
            const headers = dom.stockTable.querySelectorAll('th');
            const table = dom.stockTable;
            if (settings.colWidths && settings.colWidths.length === headers.length) {
                headers.forEach((th, i) => { if (settings.colWidths[i]) th.style.width = settings.colWidths[i]; });
            }
            if (settings.tableWidth) table.style.width = settings.tableWidth;
        } catch (e) { console.error('Load error', e); }
    }
}

function initResizableColumns() {
    loadColumnSettings();

    const table = dom.stockTable;
    const resizers = table.querySelectorAll('.resizer');
    const headers = table.querySelectorAll('th');

    let startX = 0;
    let startColWidth = 0;
    let startTableWidth = 0;
    let currentHeader = null;

    const MIN_COL_WIDTH = 30;
    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    function clientXFromEvent(e) {
        if (e.touches && e.touches[0]) return e.touches[0].clientX;
        if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
        return e.clientX;
    }

    function beginResize(e, index) {
        // Prevent page scroll/selection while resizing (important on iPhone)
        if (e.cancelable) e.preventDefault();

        currentHeader = headers[index];
        startX = clientXFromEvent(e);
        startColWidth = currentHeader.offsetWidth;
        startTableWidth = table.offsetWidth;

        // Freeze widths to px so resizing is stable
        headers.forEach(th => { th.style.width = th.offsetWidth + 'px'; });
        table.style.width = startTableWidth + 'px';

        resizers[index].classList.add('isResizing');
    }

    function doResize(e) {
        if (!currentHeader) return;
        const diffX = clientXFromEvent(e) - startX;
        currentHeader.style.width = Math.max(MIN_COL_WIDTH, startColWidth + diffX) + 'px';
        table.style.width = Math.max(startTableWidth + diffX, 100) + 'px';
    }

    function endResize() {
        const active = table.querySelector('.resizer.isResizing');
        if (active) active.classList.remove('isResizing');
        currentHeader = null;
        saveColumnSettings();
    }

    resizers.forEach((resizer, index) => {
        if (supportsPointer) {
            resizer.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;

                beginResize(e, index);
                try { resizer.setPointerCapture(e.pointerId); } catch (_) {}

                const onMove = (ev) => doResize(ev);
                const onUp = () => {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onUp);
                    document.removeEventListener('pointercancel', onUp);
                    endResize();
                };

                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
                document.addEventListener('pointercancel', onUp);
            });
        } else {
            // Fallback: mouse + touch
            resizer.addEventListener('mousedown', (e) => {
                beginResize(e, index);

                const onMove = (ev) => doResize(ev);
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    endResize();
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            resizer.addEventListener('touchstart', (e) => {
                beginResize(e, index);

                const onMove = (ev) => doResize(ev);
                const onUp = () => {
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('touchend', onUp);
                    document.removeEventListener('touchcancel', onUp);
                    endResize();
                };

                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onUp);
                document.addEventListener('touchcancel', onUp);
            }, { passive: false });
        }
    });
}


function initControls() {
    dom.addStockButton.addEventListener('click', addStock);
    if (dom.toggleListButton) dom.toggleListButton.addEventListener('click', toggleListMode);
    if (dom.sortModeButton) dom.sortModeButton.addEventListener('click', cycleSortMode);
    dom.setRefreshButton.addEventListener('click', setRefreshInterval);
    dom.resetButton.addEventListener('click', resetDefaults);
    dom.sortButton.addEventListener('click', cycleSortMode);

    dom.newStockInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') addStock();
    });

    dom.refreshInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') setRefreshInterval();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    dom.refreshInput = document.getElementById('refreshInput');
    dom.newStockInput = document.getElementById('newStockInput');
    dom.tbody = document.getElementById('stockData');
    dom.status = document.getElementById('status');
    dom.nextRefresh = document.getElementById('nextRefresh');
    dom.currentTime = document.getElementById('current_time');
    dom.stockTable = document.getElementById('stockTable');
    dom.addStockButton = document.getElementById('addStockButton');
    dom.setRefreshButton = document.getElementById('setRefreshButton');
    dom.resetButton = document.getElementById('resetButton');
    dom.sortButton = document.getElementById('sortButton');
    dom.addStockMessage = document.getElementById('addStockMessage');
    dom.refreshMessage = document.getElementById('refreshMessage');
    dom.bottomTime = document.getElementById('bottomTime');
    dom.toggleListButton = document.getElementById('toggleListButton');
    dom.sortModeButton = document.getElementById('sortModeButton');
    dom.toast = document.getElementById('toast');

    indexElements.hsi = {
        valueEl: document.getElementById('hsi_value'),
        changeEl: document.getElementById('hsi_change'),
        arrowEl: document.getElementById('hsi_arrow'),
        wrapperEl: document.getElementById('hsi-wrapper')
    };
    indexElements.china_index = {
        valueEl: document.getElementById('china_index_value'),
        changeEl: document.getElementById('china_index_change'),
        arrowEl: document.getElementById('china_index_arrow'),
        wrapperEl: document.getElementById('hscei-wrapper')
    };
    loadRefreshInterval();
    loadSortMode();
    loadStockList();
    await loadHolidayCalendar();
    await loadHsiConstituents();
    updateToggleButtonUI();
    setControlsEnabled(true);
    initResizableColumns();
    initControls();

    // Initial data load, then start smart schedule
    updateStockTable().then(() => {
        scheduleNextRefresh();
    });
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register('./sw.js')
        .then(() => { console.log('Service Worker Registered'); });
}