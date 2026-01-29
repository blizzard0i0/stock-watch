const DEFAULT_CODES = ['00005', '00388', '00700', '01183', '01195', '01458', '02317', '02391', '02592', '9896', '9988', '9992', '55852'];
const STORAGE_KEY_COLS = 'hk_stock_cols_v6';
const STORAGE_KEY_LIST = 'hk_stock_list_v1';
const STORAGE_KEY_INTERVAL = 'hk_stock_interval_v1';
const STORAGE_KEY_SORT = 'hk_stock_sort_v1';

let stockCodes = [];
let stockStates = {};
const dom = {};
const indexElements = {};
const rowCache = new Map();
let isRefreshing = false;

// --- NEW: State for Index Arrows ---
let indexStates = {
    hsi: { lastPrice: null, arrow: '' },
    china_index: { lastPrice: null, arrow: '' }
};

let indexDataCache = {
    hsi: { value: 'N/A', difference: 'N/A' },
    china_index: { value: 'N/A', difference: 'N/A' }
};

let refreshTimer = null;
let refreshRateSec = 30; // Default 30s
let sortDirection = 'asc';

const TRADE_START_HOUR = 9;
const TRADE_START_MIN = 0;  // 9:00
const TRADE_MORNING_END_HOUR = 12;
const TRADE_MORNING_END_MIN = 0; // 12:00
const TRADE_AFTERNOON_START_HOUR = 13;
const TRADE_AFTERNOON_START_MIN = 0; // 13:00
const TRADE_END_HOUR = 16;
const TRADE_END_MIN = 10;   // 16:10

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
    stockCodes.sort((a, b) => {
        const diff = parseInt(a, 10) - parseInt(b, 10);
        return sortDirection === 'asc' ? diff : -diff;
    });
}

function loadStockList() {
    const stored = localStorage.getItem(STORAGE_KEY_LIST);
    if (stored) {
        try { stockCodes = JSON.parse(stored); } catch (e) { stockCodes = [...DEFAULT_CODES]; }
    } else { stockCodes = [...DEFAULT_CODES]; }
    sortStocks();
}

function saveStockList() { localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(stockCodes)); }

function loadRefreshInterval() {
    const stored = localStorage.getItem(STORAGE_KEY_INTERVAL);
    if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 3) refreshRateSec = val;
    }
    dom.refreshInput.value = refreshRateSec;
}

function loadSortDirection() {
    const stored = localStorage.getItem(STORAGE_KEY_SORT);
    if (stored === 'asc' || stored === 'desc') sortDirection = stored;
    updateSortButtonLabel();
}

function setSortDirection(nextDirection) {
    sortDirection = nextDirection;
    localStorage.setItem(STORAGE_KEY_SORT, sortDirection);
    updateSortButtonLabel();
    sortStocks();
    updateStockTable();
}

function updateSortButtonLabel() {
    if (dom.sortButton) {
        dom.sortButton.textContent = `Sort: ${sortDirection === 'asc' ? 'Asc' : 'Desc'}`;
    }
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
    const statusEl = dom.status;
    const nextRefreshEl = dom.nextRefresh;
    const now = new Date();
    const marketStatus = getMarketStatus(now);

    if (marketStatus.state === 'open') {
        if (holidayState.status === 'unavailable') {
            statusEl.textContent = 'Active (Holiday calendar unavailable)';
            statusEl.style.color = '#cc6600';
        } else {
            statusEl.textContent = 'Active (Mon-Fri 9:00-12:00, 13:00-16:10)';
            statusEl.style.color = '#006600';
        }
        const nextTime = new Date(now.getTime() + (refreshRateSec * 1000));
        nextRefreshEl.textContent = nextTime.toLocaleTimeString();
        refreshTimer = setTimeout(() => {
            updateStockTable().then(() => { scheduleNextRefresh(); });
        }, refreshRateSec * 1000);
        return;
    }

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
        refreshTimer = setTimeout(() => {
            updateStockTable().then(() => { scheduleNextRefresh(); });
        }, delay);
    } else {
        refreshTimer = setTimeout(scheduleNextRefresh, 1000);
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

function addStock() {
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
    stockCodes.push(code);
    sortStocks();
    saveStockList();
    input.value = '';
    showInputMessage(dom.addStockMessage, 'Stock added.', true);
    updateStockTable();
}

function removeStock(code) {
    stockCodes = stockCodes.filter(c => c !== code);
    saveStockList();
    updateStockTable();
}

function resetDefaults() {
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

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchStockData(code) {
    try {
        const response = await fetchWithTimeout(`https://realtime-money18-cdn.on.cc/securityQuote/genStockDetailHKJSON.php?stockcode=${code}`);
        const data = await response.json();
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
            name: data.daily.nameChi || 'N/A',
            quote: currentPrice !== 'N/A' ? currentPrice : 'N/A',
            change: change,
            pctChange: pctChange,
            preClose: data.daily.preCPrice || 'N/A',
            open: data.opening.openPrice || 'N/A',
            high: data.real.dyh || 'N/A',
            low: data.real.dyl || 'N/A',
            turnover: (parseInt(data.real.tvr, 10) / 1000000).toFixed(2) || 'N/A',
            dayDirection: dayDirection,
            error: false
        };
    } catch (error) {
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
}

async function fetchIndexData(indexCode) {
    try {
        const response = await fetchWithTimeout(`https://realtime-money18-cdn.on.cc/securityQuote/genIndexDetailHKJSON.php?code=${indexCode}`);
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

async function updateStockTable() {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
        const tbody = dom.tbody;
        if (stockCodes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12">No stocks in list.</td></tr>';
            rowCache.clear();
            return;
        }
        if (tbody.children.length === 0) tbody.innerHTML = '<tr><td colspan="12">Loading data...</td></tr>';

        const stockPromises = stockCodes.map(code => fetchStockData(code));
        const [stockSettled, hsiSettled, hsceiSettled] = await Promise.allSettled([
            Promise.all(stockPromises),
            fetchIndexData('HSI'),
            fetchIndexData('HSCEI')
        ]);

        const stockData = stockSettled.status === 'fulfilled'
            ? stockSettled.value
            : stockCodes.map(code => ({
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

        stockData.forEach(stock => {
            seenCodes.add(stock.code);
            const {
                row,
                cells,
                noLink,
                nameLink,
                dayRangeIndicator,
                tickIndicator,
                quoteText
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

        dom.currentTime.textContent = `Last updated: ${new Date().toLocaleString()}`;

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
    let startX, startColWidth, startTableWidth, currentHeader;
    resizers.forEach((resizer, index) => {
        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            currentHeader = headers[index];
            startX = e.clientX;
            startColWidth = currentHeader.offsetWidth;
            startTableWidth = table.offsetWidth;
            headers.forEach(th => { th.style.width = th.offsetWidth + 'px'; });
            table.style.width = startTableWidth + 'px';
            resizer.classList.add('isResizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
    function onMouseMove(e) {
        const diffX = e.clientX - startX;
        currentHeader.style.width = Math.max(30, startColWidth + diffX) + 'px';
        table.style.width = Math.max(startTableWidth + diffX, 100) + 'px';
    }
    function onMouseUp() {
        const activeResizer = table.querySelector('.resizer.isResizing');
        if (activeResizer) activeResizer.classList.remove('isResizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveColumnSettings();
    }
}

function initControls() {
    dom.addStockButton.addEventListener('click', addStock);
    dom.setRefreshButton.addEventListener('click', setRefreshInterval);
    dom.resetButton.addEventListener('click', resetDefaults);
    dom.sortButton.addEventListener('click', () => {
        const nextDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortDirection(nextDirection);
    });

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
    loadSortDirection();
    loadStockList();
    await loadHolidayCalendar();
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
