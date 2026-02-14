# 港股自選監察（PWA）

一個輕量、可安裝嘅 **港股自選清單監察** Web App（支援 PWA）。主要功能包括：
- 自選股即時報價
- 恒指（HSI）+ 國指（HSCEI）概覽
- 只喺港股交易時段自動刷新（包含午市休市／公眾假期判斷）
- 本機儲存（自選清單、刷新秒數、排序、欄位寬度等設定）

**外部連結：** https://st.b0i0.xyz

---

## 功能特色

- **自選股清單**
  - 顯示：現價 / 升跌 / 升跌% / 昨收 / 今開 / 最高 / 最低 / 成交額
  - 一鍵跳轉：
    - 報價詳情（AASTOCKS）
    - 成交資料（etnet）
- **指數概覽**
  - 恒指（HSI）及國指（HSCEI）即時數值與日內變化（包含升跌箭咀）
- **智能刷新機制**
  - 只會喺港股交易時段刷新：
    - 星期一至五：09:00–12:00、13:00–16:10
  - 顯示狀態：開市 / 午市休市 / 收市 / 假期，並顯示下一次刷新時間
  - 公眾假期資料會抓取並快取（內建 fallback 清單）
- **使用者控制**
  - 新增／刪除股票代號
  - 設定刷新間隔（最少 3 秒）
  - 代號排序（升序／降序）
  - 一鍵重設預設清單
- **可調整欄位寬度**
  - 拖拉表頭 resizer 調整欄寬，並會儲存至 `localStorage`
- **PWA 支援**
  - Service Worker 預快取（offline shell）
  - 可安裝至手機／桌面（含 192/512 圖示與 standalone 模式）

---

## 技術架構

- 原生 **HTML + CSS + JavaScript**
- **PWA**：`manifest.json` + `sw.js`（預快取離線殼）
- 資料來源（第三方）：
  - 即時報價：**on.cc / money18**（JSON）
  - 香港公眾假期：**Nager.Date** Public Holidays API（HK）

---

## 專案結構
.
├── index.html
├── styles.css
├── main.js
├── sw.js
├── manifest.json
├── icon-192.png
├── icon-512.png
└── icon.png


---

## 本機快速啟動（Local）

### 方式 A：用簡單靜態伺服器（建議）
Service Worker 通常唔支援 `file://`，建議用 HTTP server：

```bash
# Python 3
python -m http.server 8080

打開：

http://localhost:8080/

方式 B：VSCode Live Server

安裝 “Live Server” 插件

右鍵 index.html → “Open with Live Server”

使用方法

打開網頁

新增股票代號（例如：700、388、9992）

需要時調整刷新秒數

用排序功能切換升序／降序

表頭可以拖拉調整欄寬

所有設定會儲存喺瀏覽器 localStorage，下次再開都會保留。

PWA 注意事項

manifest.json 同 sw.js 必須可以 直接存取（唔可以被任何登入／Access／Auth redirect 擋住），否則會導致：

manifest 401/302 → 安裝失敗

service worker 註冊失敗（redirect 會被瀏覽器拒絕）

為避免 stale data（尤其 iOS/Safari），一般只快取 app shell（HTML/CSS/JS/icons），跨域報價 API 不會被 SW 快取。

資料來源與免責聲明

本專案顯示之股價與指數數據來自第三方端點，可能存在延遲或短暫不可用情況。
本工具僅作個人／資訊用途，不構成任何投資建議。

License

This project is licensed under the MIT License - see the LICENSE file for details.
