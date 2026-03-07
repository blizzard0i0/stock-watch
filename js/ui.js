// js/ui.js
// UI rendering and DOM operations

export function createCell(tag, className, text) {
    const cell = document.createElement(tag);
    if (className) cell.className = className;
    if (text !== undefined) cell.textContent = text;
    return cell;
}

export function createLink({ href, text, className }) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.className = className || '';
    link.textContent = text;
    return link;
}

export function createButton({ className, title, text, onClick }) {
    const button = document.createElement('button');
    button.className = className || '';
    button.title = title || '';
    button.textContent = text;
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

export function createArrowSpan(symbol, label) {
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

export function createTrendIndicator(direction) {
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

// DOM diff helpers
export function setTextIfChanged(node, text) {
    const next = text === undefined || text === null ? '' : String(text);
    if (node.textContent !== next) node.textContent = next;
}

export function setNodeValueIfChanged(textNode, text) {
    const next = text === undefined || text === null ? '' : String(text);
    if (textNode.nodeValue !== next) textNode.nodeValue = next;
}

export function setClassIfChanged(el, className) {
    const next = className || '';
    if (el.className !== next) el.className = next;
}

export function setHrefIfChanged(link, href) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

export function setTitleIfChanged(el, title) {
    const next = title || '';
    if ((el.getAttribute('title') || '') !== next) el.setAttribute('title', next);
}

export function setHiddenIfChanged(el, hidden) {
    const next = !!hidden;
    if (el.hidden !== next) el.hidden = next;
}

export function setDisabledIfChanged(el, disabled) {
    const next = !!disabled;
    if (el.disabled !== next) el.disabled = next;
}

export function setVisibilityIfChanged(el, visibility) {
    if ((el.style.visibility || '') !== visibility) el.style.visibility = visibility;
}

// Toast notifications
let toastTimer = null;
export function showToast(message, durationMs = 1200, dom = {}) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        dom.toast.classList.remove('show');
    }, durationMs);
}

// Input messages
export function showInputMessage(target, message, isSuccess = false) {
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

// Number formatters
export const numberFormatters = {
    price: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
    percent: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    turnover: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};

export function formatNumber(value, formatter) {
    if (value === 'N/A' || value === undefined || value === null) return 'N/A';
    const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (Number.isNaN(numeric)) return 'N/A';
    return formatter.format(numeric);
}
