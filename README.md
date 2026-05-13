# 離線 GPS PWA

這是一個可在 iPhone Safari 使用的離線 GPS Web App。第一次透過 HTTPS 開啟後，Service Worker 會快取 App Shell，加入主畫面後即使沒有網路也能開啟並讀取 GPS。

## 功能

- 顯示緯度、經度、精度、海拔、速度、航向
- 離線保存移動軌跡到瀏覽器本機儲存
- 顯示相對軌跡，不依賴線上地圖
- 複製座標、分享座標、匯出 GPX

## iPhone 使用方式

1. 將這個資料夾部署到 HTTPS 網址，例如 GitHub Pages、Cloudflare Pages、Netlify 或自己的 HTTPS 主機。
2. 用 iPhone Safari 開啟該網址。
3. 允許位置權限。
4. 使用 Safari 分享選單，選擇「加入主畫面」。
5. 之後從主畫面開啟，即使離線也能使用。

## 注意

- iOS 的 GPS 權限通常需要 HTTPS。直接用一般 HTTP 網址在 iPhone 上可能無法定位。
- GPS 訊號本身不需要網路，但定位速度與精度可能受環境影響。
- 這個版本不使用線上地圖底圖，所以離線時仍可看座標與相對軌跡；如果需要離線地圖，需要另外準備可離線授權與快取的圖資。
