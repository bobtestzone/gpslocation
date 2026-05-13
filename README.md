# 離線 GPS PWA

這是一個可部署到 GitHub Pages 的 iPhone GPS PWA。第一次透過 HTTPS 開啟後，Service Worker 會快取 App 本體，加入主畫面後即使沒有網路也能開啟。

## 功能

- 顯示緯度、經度、精度、海拔、速度、航向
- 顯示目前網路狀態：有網路 / 離線
- 有網路時顯示 OpenStreetMap 底圖，並把 GPS 點與軌跡疊在地圖上
- 離線時仍可讀取 GPS、顯示座標與已記錄軌跡
- 軌跡儲存在瀏覽器本機，可匯出 GPX
- 複製 GPS、分享座標、清除軌跡

## iPhone 使用方式

1. 將這個資料夾部署到 GitHub Pages。
2. 確認 GitHub Pages 已啟用 HTTPS。
3. 用 iPhone Safari 開啟 GitHub Pages 網址。
4. 允許位置權限。
5. 使用 Safari 分享選單，選擇「加入主畫面」。

## 合法與免費原則

- 程式本體不使用付費 API。
- 地圖引擎是自行實作的輕量 web tile viewer，沒有依賴商業 SDK。
- 有網路時使用 OpenStreetMap 官方圖磚，並顯示 attribution。
- App 不會大量預抓或全區下載 OSM 圖磚。
- Service Worker 只快取本站 App 檔案，不攔截或永久保存 OSM 圖磚。

## 後續離線地圖方向

如果要做真正的登山離線地圖，建議使用政府開放圖資或其他明確允許離線使用的圖資，轉成小區域地圖包。不要直接大量下載 OSM 官方圖磚做離線使用。
