/**
 * Vercel Serverless Function — Polygon.io Proxy
 *
 * Accepts: GET /api/stock?ticker=AAPL&date=2025-01-15&timeframe=1D
 * Returns: JSON array of OHLCV bars ready for TradingView Lightweight Charts
 *
 * The Polygon.io API key is read from the POLYGON_API_KEY env variable
 * and is NEVER exposed to the frontend.
 */

const TIMEFRAME_MAP = {
  '1D':  { multiplier: 1,  timespan: 'day'    },
  '1W':  { multiplier: 1,  timespan: 'week'   },
  '1':   { multiplier: 1,  timespan: 'minute'  },
  '5':   { multiplier: 5,  timespan: 'minute'  },
  '15':  { multiplier: 15, timespan: 'minute'  },
  '1h':  { multiplier: 1,  timespan: 'hour'   },
};

/**
 * Compute a sensible "from" date given the timeframe and the user's chosen "to" date.
 * - Daily / Weekly: go back 5 years
 * - Intraday (1m, 5m, 15m, 1h): go back 30 calendar days (Polygon caps intraday history)
 */
function getFromDate(toDateStr, timespan) {
  const to = new Date(toDateStr + 'T00:00:00');
  if (timespan === 'minute' || timespan === 'hour') {
    to.setDate(to.getDate() - 30);
  } else {
    to.setFullYear(to.getFullYear() - 5);
  }
  return to.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  /* ── CORS (handy for local dev) ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  /* ── Validate query params ── */
  const { ticker, date, timeframe } = req.query;

  if (!ticker || !date || !timeframe) {
    return res.status(400).json({
      error: 'Missing required query parameters: ticker, date, timeframe',
    });
  }

  const tf = TIMEFRAME_MAP[timeframe];
  if (!tf) {
    return res.status(400).json({
      error: `Invalid timeframe "${timeframe}". Valid values: ${Object.keys(TIMEFRAME_MAP).join(', ')}`,
    });
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: POLYGON_API_KEY not set.' });
  }

  /* ── Build Polygon URL ── */
  const tickerUpper = ticker.toUpperCase().trim();
  const from = getFromDate(date, tf.timespan);
  const to = date; // already YYYY-MM-DD

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(tickerUpper)}` +
    `/range/${tf.multiplier}/${tf.timespan}/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    /* ── Handle Polygon errors ── */
    if (data.status === 'ERROR' || data.error) {
      const msg = data.error || data.message || 'Unknown Polygon.io error';
      return res.status(502).json({ error: msg });
    }

    if (!data.results || data.results.length === 0) {
      return res.status(404).json({
        error: `No data found for ticker "${tickerUpper}". Check the symbol and date.`,
      });
    }

    /* ── Transform to lightweight-charts format ── */
    const isIntraday = tf.timespan === 'minute' || tf.timespan === 'hour';

    const bars = data.results.map((bar) => {
      // Polygon timestamps are in milliseconds UTC
      const ts = bar.t / 1000; // -> seconds

      return {
        // For daily/weekly: use YYYY-MM-DD string (business days)
        // For intraday: use Unix timestamp in seconds
        time: isIntraday
          ? ts
          : new Date(bar.t).toISOString().slice(0, 10),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      };
    });

    return res.status(200).json({
      ticker: tickerUpper,
      timeframe,
      count: bars.length,
      bars,
    });
  } catch (err) {
    console.error('Polygon fetch error:', err);
    return res.status(502).json({
      error: 'Failed to fetch data from Polygon.io. Please try again later.',
    });
  }
};
