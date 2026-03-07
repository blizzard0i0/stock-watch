// js/app.js
// Main application logic

import { CONFIG, MS_PER_DAY, HK_TIMEZONE } from './config.js';
import * as storage from './storage.js';
import * as api from './api.js';
import * as ui from './ui.js';

// State
let stockCodes = [];
let hsiCodes = [...CONFIG.DEFAULT_HSI_CODES];
let stockStates = {};
let indexStates = { hsi: { lastPrice: null, arrow: '' }, china_index: { lastPrice: null, arrow: '' } };
let indexDataCache = { hsi: { value: 'N/A', difference: 'N/A' }, china_index: { value: 'N/A', difference: 'N/A' } };
let listMode = 'watch';
let dataSource = 'oncc';
let sortMode = 'code';
let refreshRateSec = 5;
let isRefreshing = false;
let pausedByVisibility = false;
let refreshTimer = null;
let schedulerToken = 0;
let lastScheduledTickMs = 0;
let holidayState = { status: 'loading', dates: new Set(), source: 'none' };

// DOM cache
const dom = {};
const indexElements = {};
const rowCache = new Map();
const healthHistory = [];
const HEALTH_WINDOW_MS = 1000 * 60 * 2;

// Initialize
export async function init() {
    cacheDOMElements();
    loadSettings();
    await loadHolidayCalendar();
    await loadHsiConstituents();
    setupEventListeners();
    initResizableColumns();
    initPullToRefresh();
    updateUI();
    
    // Initial data load
    await updateStockTable();
    scheduleNextRefresh();
}

function cacheDOMElements() {
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
    dom.sourceHealth = document.getElementById('sourceHealth');
    dom.sourceToggleButton = document.getElementById('sourceToggleButton');
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
}

function loadSettings() {
    stockCodes = storage.loadStockList();
    sortStocks();
    refreshRateSec = storage.loadRefreshInterval();
    if (dom.refreshInput) dom.refreshInput.value = refreshRateSec;
    sortMode = storage.loadSortMode();
    dataSource = storage.loadDataSource();
}

function sortStocks() {
    stockCodes.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function setupEventListeners() {
    dom.addStockButton?.addEventListener('click', addStock);
    dom.toggleListButton?.addEventListener('click', toggleListMode);
    dom.sortModeButton?.addEventListener('click', cycleSortMode);
    dom.sourceToggleButton?.addEventListener('click', toggleDataSource);
    dom.setRefreshButton?.addEventListener('click', setRefreshInterval);
    dom.resetButton?.addEventListener('click', resetDefaults);
    dom.sortButton?.addEventListener('click', cycleSortMode);

    dom.newStockInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addStock(); });
    dom.refreshInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') setRefreshInterval(); });

    // Visibility handling
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', () => { if (!document.hidden) onVisibilityChange(); });
}

async function loadHolidayCalendar() {
    const cache = storage.loadHolidayCache();
    if (cache) {
        setHolidayStateFromCache(cache, 'cache');
        return;
    }

    const now = new Date();
    const year = now.getFullYear();
    
    try {
        const [currentYearDates, nextYearDates] = await Promise.all([
            api.fetchHolidayCalendar(year),
            api.fetchHolidayCalendar(year + 1)
        ]);
        const payload = {
            updatedAt: Date.now(),
            data: { [year]: currentYearDates, [year + 1]: nextYearDates }
        };
        storage.saveHolidayCache(payload);
        setHolidayStateFromCache(payload, 'live');
    } catch (error) {
        const fallback = api.getFallbackHolidayPayload(year);
        if (fallback) {
            setHolidayStateFromCache(fallback, 'fallback');
        } else {
            holidayState = { status: 'unavailable', dates: new Set(), source: 'none' };
        }
    }
}

function setHolidayStateFromCache(cache, source) {
    const dates = [];
    Object.values(cache.data).forEach(list => { if (Array.isArray(list)) dates.push(...list); });
    holidayState = { status: 'ready', dates: new Set(dates), source };
}

async function loadHsiConstituents() {
    try {
        const response = await fetch(CONFIG.HSI_LIST_URL);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                hsiCodes = data.map(String).map(s => s.trim()).filter(Boolean).map(c => c.padStart(5, '0'));
                storage.saveHsiList(hsiCodes);
                return;
            }
        }
    } catch (_) {}

    const cached = storage.loadHsiList();
    if (cached) { hsiCodes = cached; return; }
    hsiCodes = [...CONFIG.DEFAULT_HSI_CODES];
}

// ... (continues with all other functions)
