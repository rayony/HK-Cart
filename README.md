# 格價籃 HK-Cart

香港超市格價 web app：貼一張 shopping list（品牌型號或模糊關鍵字），用消費者委員會「[格價資訊通](https://online-price-watch.consumer.org.hk/opw/)」對價，再分組話你知邊度最平。

- 一間買晒 / 逐件最平 / 分兩間買
- 容量、買 2 件優惠、自己填價錢
- 消委會冇貨可以再搜 HKTVmall／惠康／Price.com.hk

## 本機

```bash
npm install
npm run dev
```

開 `http://localhost:8080`。第一次會下載消委會貨品庫，載入完先可以格價。

可選環境變數見 `.env.example`。`XAI_API_KEY` 只係自動配對唔到先會用。

HKTVmall 即時搜尋用嘅 Algolia 係網站公開嘅 search-only key，唔係我哋嘅帳號密鑰。

## 資料來源

價格同優惠來自消費者委員會開放數據，實際以店舖為準。
