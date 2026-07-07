# 智慧排班與可用時段登記系統 (Scheduler-Tpro)

這是一個基於 React + TypeScript + Vite 開發的智慧排班與員工可用時間登記系統，專為門市店長與排班夥伴（正職及兼職）設計。系統透過 Firebase Firestore 實現即時的排班與登記同步，並提供自動法規防錯與直觀的 Excel 式介面。

---

## 核心功能特色

### 👤 夥伴登記端 (手機版友善)
*   **登入驗證**：輸入姓名與電話進行身分驗證，自動判別正職或兼職夥伴。
*   **不克排班登記（正職）**：於月曆上點選不克排班之休假日，系統自動限制以避免違反勞基法「連續工作 6 天」規定。
*   **可用時段登記（兼職）**：
    *   **智慧單點滑桿**：採用符合門市營運邏輯的單點時間切分器。夥伴只需調整單一時間點，即可快速選擇「工作至此時間」（早起配合自 06:30 開始）或「自此時間開始」（晚班配合至 20:00 結束）。
    *   **手機版友善卡片**：已提交的可用時段以簡潔的卡片列表呈現，在窄螢幕上會自動重排與折行，並提供一鍵「編輯」與「刪除」功能。
    *   **同仁時段檢視**：可在日曆上即時查閱同日其他同仁的可用時段，方便協調互換班。

### 🔑 主管管理端 (密碼保護)
*   **雙重排班介面**：
    *   **月曆視圖 (Calendar View)**：以月為單位直觀檢視每日排班狀況、登記請假人數及可用人數。
    *   **表格網格視圖 (Excel Grid View)**：以橫向試算表方式呈現所有人員與日期。支援 **滑鼠滾輪直接進行左右橫向滾動**，提升大表格操作體驗。點選空格即可直接進行快速排班。
*   **人力目標計算**：輸入各時段月營業額，系統自動計算日平均營業額，並依自訂規則產出建議配置人數，與目前預設排班人數比對以防缺人。
*   **即時備註與警示**：主管可在表格內直接新增日備註，若夥伴有效工時超過 8 小時，系統會跳出超時警示。
*   **一鍵匯出 Excel**：支援將整個月份的排班格線、ERP 標記、營業時間等完美格式化匯出為 `.xlsx` 檔案，供後續薪資計算或門市張貼使用。

---

## 技術棧 (Tech Stack)

*   **前端框架**：React 19 + TypeScript + Vite
*   **樣式處理**：Tailwind CSS v4 (配合毛玻璃玻璃擬態 glassmorphism 設計)
*   **資料庫**：Firebase Firestore (即時訂閱 `onSnapshot` 同步資料)
*   **試算表處裡**：`xlsx` & `xlsx-js-style` (控制匯出 Excel 的字型、儲存格底色與邊框)

---

## 本地開發與運行

### 1. 安裝依賴
```bash
npm install
```

### 2. 環境變數設定
在專案根目錄下建立 `.env.local` 檔案並填入您的 Firebase 設定資訊：
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. 啟動開發伺服器
```bash
npm run dev
```

### 4. 專案打包建置
```bash
npm run build
```
