# HK Stock Watch (PWA)

一個輕量、可離線使用嘅香港股票 Watchlist／恒生指數成份股監控頁（PWA）。支援自訂股票清單、即時報價、智能刷新（配合港股交易時段）、多種排序模式、欄位拖拉縮放並自動保存。

🔗 Demo：st.b0i0.xyz

---

## ✨ 功能特色

- **Watchlist + HSI 成份股一鍵切換**
  - 右上角按鈕切換：`WL`（自訂清單）↔ `HSI`（恒指成份股）
  - HSI 模式為「唯讀」：會停用新增/刪除/重設清單（避免誤改）
  - HSI 成份股清單支援本地檔案 `hsi_constituents.json` 覆寫

- **排序模式（即時切換）**
  - `123`：按股票代號（小→大）
  - `%↓`：按升跌幅（大→小）
  - `%↑`：按升跌幅（小→大）
  - 排序模式會記住（localStorage）

- **智能刷新（配合港股交易時間）**
  - 交易時段（Mon–Fri）：09:00–12:00、13:00–16:10 內按你設定秒數刷新
  - 午市/收市/週末/假期會自動計算下次開市時間（避免無效狂刷）
  - 刷新間隔可自訂，最少 3 秒

- **港股假期日曆（含離線備援）**
  - 優先拉取公開假期 API（線上）
  - 失敗時使用 cache；再失敗就用內建 fallback（已預置 2026 年）以保持離線可用

- **表格操作友善**
  - 欄位可拖拉縮放（iPhone / Desktop 均可用）
  - 欄寬與表格總寬會自動保存（localStorage）
  - 價格/升跌幅顏色標示 + 即時跳動背景（tick up/down）
  - 顯示「日內高/低」觸碰提示箭咀（到頂/到底）

- **PWA / 離線快取**
  - 具備 `manifest.json`、Service Worker 預快取核心檔案
  - iOS/Safari 針對跨域 API **不做快取**，降低「舊數據」風險

---

## 📦 專案檔案結構

```
.
├── index.html
├── styles.css
├── main.js
├── sw.js
├── manifest.json
├── hsi_constituents.json
├── icon-192.png
└── icon-512.png
```

---

## 🧠 資料來源（API）

> 本專案屬於前端頁面，直接向第三方公開端點拉取資料。

- 個股報價：`https://realtime-money18-cdn.on.cc/securityQuote/genStockDetailHKJSON.php?stockcode=XXXXX`
- 指數資料（HSI / HSCEI）：`https://realtime-money18-cdn.on.cc/securityQuote/genIndexDetailHKJSON.php?code=HSI|HSCEI`
- 香港公眾假期（線上）：`https://date.nager.at/api/v3/PublicHolidays/{year}/HK`

⚠️ 免責聲明：以上來源可能隨時更改或限制；本專案只作資訊展示用途，不構成投資建議。  
（跨域 API 在 Service Worker 內已設定不作快取，以避免 iOS 返舊數據問題。）

---

## 🚀 使用方式

### 1) 本機直接開（最簡單）
你可以直接用瀏覽器打開 `index.html`（部分瀏覽器對 SW/manifest 可能有限制）。

### 2) 建議：用本地靜態伺服器（支援 PWA / SW）
例如用 Python：

```bash
python3 -m http.server 8080
```

然後打開：

- `http://localhost:8080/`

---

## 🌍 部署（GitHub Pages）

1. 將此 repo push 到 GitHub
2. 到 **Settings → Pages**
3. Source 選擇 `Deploy from a branch`
4. Branch 選 `main`，folder 選 `/ (root)`
5. 儲存後等 GitHub Pages 提供網址

---

## 🔧 設定 & 自訂

### ✅ 預設 Watchlist
在 `main.js` 內可改：

```js
const DEFAULT_CODES = ['00388', '00700', '9992'];
```

### ✅ HSI 成份股清單更新
專案會優先讀取同目錄的 `hsi_constituents.json`。你只要更新此檔案內容，例如：

```json
["00001","00002","00003","..."]
```

---

## 🧹 快取版本更新（重要）

當你修改核心檔案後，建議同步更新 `sw.js` 內的 cache name（例如 `v19 → v20`）以確保用戶取得新版本：

```js
const CACHE_NAME = 'hk-stock-store-v19';
```

---

## 🔐 私隱與安全

- 本專案不需要登入、無後端、無收集個人資料
- 使用 localStorage 只保存：自訂清單、欄寬、刷新秒數、排序模式、假期 cache

---

## 📄 License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
