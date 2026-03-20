# Stock Historical Chart

A clean, dark-themed web app for viewing historical US stock candlestick charts. Built with **TradingView Lightweight Charts** (open-source) and **Polygon.io** for market data.

## Features

- Ticker search with validation
- Date picker — view the chart "as of" any past date
- Candlestick (OHLCV) chart with interactive zoom, scroll, and hover tooltip
- Volume bars displayed as an overlay at the bottom
- Timeframe switcher: 1m, 5m, 15m, 1h, 1D, 1W
- Loading indicator while data is being fetched
- API key secured server-side — never exposed in the browser

## Tech Stack

| Layer     | Tech                                      |
|-----------|-------------------------------------------|
| Frontend  | Plain HTML + CSS + Vanilla JavaScript     |
| Charting  | TradingView Lightweight Charts v5 (CDN)   |
| Backend   | Vercel Serverless Function (Node.js)      |
| Data API  | Polygon.io REST API                       |

## Project Structure

```
stock-chart-app/
├── api/
│   └── stock.js          # Vercel serverless function (backend proxy)
├── public/
│   ├── index.html         # Main HTML page
│   ├── style.css          # Dark-themed stylesheet
│   └── app.js             # Frontend chart logic
├── server.js              # Local dev server (Express)
├── vercel.json            # Vercel routing config
├── package.json
├── .env.example           # Template for your API key
├── .gitignore
└── README.md
```

## Setup & Local Development

### 1. Clone and install

```bash
git clone <your-repo-url>
cd stock-chart-app
npm install
```

### 2. Add your Polygon.io API key

Copy the example env file and paste your key:

```bash
cp .env.example .env
```

Edit `.env`:
```
POLYGON_API_KEY=your_actual_polygon_api_key
```

> Get your free API key at [polygon.io/dashboard/keys](https://polygon.io/dashboard/keys).
> The free tier supports daily/weekly aggregates. Intraday data (1m, 5m, 15m, 1h) requires a paid plan.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. **Framework Preset**: select "Other"
4. **Root Directory**: leave as-is (the repo root)
5. **Build Command**: leave blank (no build step needed)
6. **Output Directory**: `public`

### 3. Add your API key as an Environment Variable

1. In Vercel project settings → **Environment Variables**
2. Add:
   - **Name**: `POLYGON_API_KEY`
   - **Value**: your Polygon.io API key
3. Click **Save**

### 4. Deploy

Click **Deploy**. Your app is live.

## Notes

- **Timezone**: All date comparisons use America/New_York (US Eastern) to match market hours.
- **Intraday data**: The 1m, 5m, 15m, and 1h timeframes require a Polygon.io paid plan. Daily and weekly data work on the free tier.
- **No auto-refresh**: This is a historical chart tool. Data is fetched on demand only.
- **Rate limits**: If Polygon returns an error (e.g. rate limit), a user-friendly message is displayed.
- **Data gaps**: Weekends and market holidays have no candles — this is normal and expected. The chart handles sparse data natively.
