// js/config.js
// Configuration and constants

export const CONFIG = {
    DEFAULT_CODES: ['00388', '00700', '01183', '01195', '01458', '02317', '02391', '02592', '9896', '9988', '9992', '55852'],
    HSI_LIST_URL: './hsi_constituents.json',
    STORAGE_KEYS: {
        HSI_LIST: 'hk_hsi_list_v1',
        COLS: 'hk_stock_cols_v6',
        LIST: 'hk_stock_list_v1',
        INTERVAL: 'hk_stock_interval_v1',
        SORT_LEGACY: 'hk_stock_sort_v1',
        SORT_MODE: 'hk_stock_sort_mode_v1',
        SOURCE: 'hk_stock_source_v1'
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
        MAX_TIMEOUT_MS: 1000 * 60 * 60,
        CLOSED_TICK_MS: 1000 * 60
    },
    HSI_BATCH_SIZE: 20,
    TENCENT_BATCH_SIZE: 40
};

export const HK_TIMEZONE = 'Asia/Hong_Kong';
export const HK_UTC_OFFSET_MINUTES = 8 * 60;
export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_HSI_CODES = ["00001", "00002", "00003", "00005", "00006", "00011", "00012", "00016", "00017", "00019", "00020", "00027", "00066", "00101", "00135", "00144", "00151", "00175", "00267", "00288", "00291", "00386", "00388", "00390", "00493", "00669", "00688", "00700", "00762", "00823", "00836", "00857", "00883", "00939", "00941", "00960", "00981", "00992", "01024", "01038", "01088", "01093", "01109", "01113", "01114", "01177", "01211", "01299", "01398", "01516", "01618", "01810", "01833", "01928", "01972", "01988", "02007", "02269", "02313", "02318", "02319", "02328", "02382", "02628", "02828", "03328", "03690", "03888", "03968", "03988", "06098", "06618", "06862", "09618", "09868", "09988"];

export const HOLIDAY_CACHE_KEY = 'hk_holiday_calendar_v1';
export const HOLIDAY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const FALLBACK_HK_HOLIDAYS_BY_YEAR = {
    2026: [
        '2026-01-01', '2026-02-17', '2026-02-18', '2026-02-19', '2026-04-03',
        '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07', '2026-05-01',
        '2026-05-24', '2026-05-25', '2026-06-19', '2026-07-01', '2026-09-26',
        '2026-10-01', '2026-10-18', '2026-10-19', '2026-12-25', '2026-12-26'
    ]
};
