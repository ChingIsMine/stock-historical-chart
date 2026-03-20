/**
 * Stock Historical Chart — Frontend
 *
 * Dependencies (loaded via CDN in index.html):
 *   - lightweight-charts v5.x (standalone build → window.LightweightCharts)
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────
   *  DOM References
   * ────────────────────────────────────────────── */
  const tickerInput    = document.getElementById('ticker-input');
  const dateInput      = document.getElementById('date-input');
  const searchBtn      = document.getElementById('search-btn');
  const tfButtonsWrap  = document.getElementById('tf-buttons');
  const statusEl       = document.getElementById('status');
  const chartContainer = document.getElementById('chart-container');
  const tooltipEl      = document.getElementById('tooltip');
  const placeholderEl   = document.getElementById('chart-placeholder');

  /* ──────────────────────────────────────────────
   *  State
   * ────────────────────────────────────────────── */
  let currentTicker    = '';
  let currentDate      = '';
  let currentTimeframe = '1D';
  let chart            = null;
  let candleSeries     = null;
  let volumeSeries     = null;

  /* ──────────────────────────────────────────────
   *  Helpers — New York (UTC-4 / UTC-5) date
   * ────────────────────────────────────────────── */
  function getNYDateString() {
    // Returns YYYY-MM-DD in America/New_York timezone (handles EDT/EST automatically)
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
  }

  /* ──────────────────────────────────────────────
   *  Initialise default date to "today" in NY
   * ────────────────────────────────────────────── */
  (function initDate() {
    const nyToday = getNYDateString();
    dateInput.value = nyToday;
    dateInput.max   = nyToday; // can't pick a future date
  })();

  /* ──────────────────────────────────────────────
   *  Status helpers
   * ────────────────────────────────────────────── */
  function showLoading(msg) {
    statusEl.className = 'status loading';
    statusEl.innerHTML = `<span class="spinner"></span> ${msg || 'Loading...'}`;
  }

  function showError(msg) {
    statusEl.className = 'status error';
    statusEl.textContent = msg;
  }

  function showSuccess(msg) {
    statusEl.className = 'status success';
    statusEl.textContent = msg;
  }

  function clearStatus() {
    statusEl.className = 'status';
    statusEl.innerHTML = '';
  }

  /* ──────────────────────────────────────────────
   *  Format large numbers for tooltip
   * ────────────────────────────────────────────── */
  function fmtNum(n, decimals) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtVol(n) {
    if (n == null) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString('en-US');
  }

  /* ──────────────────────────────────────────────
   *  Create / reset chart
   * ────────────────────────────────────────────── */
  function createChart() {
    // Destroy previous chart
    if (chart) {
      chart.remove();
      chart = null;
      candleSeries = null;
      volumeSeries = null;
    }

    const LWC = window.LightweightCharts;

    chart = LWC.createChart(chartContainer, {
      layout: {
        background: { type: 'solid', color: '#16171e' },
        textColor: '#787c8e',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines:  { color: '#1e2030' },
        horzLines:  { color: '#1e2030' },
      },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: '#5b8def' },
        horzLine: { labelBackgroundColor: '#5b8def' },
      },
      rightPriceScale: {
        borderColor: '#24262f',
        scaleMargins: { top: 0.08, bottom: 0.32 },
      },
      timeScale: {
        borderColor: '#24262f',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        minBarSpacing: 2,
      },
      handleScroll: true,
      handleScale: true,
    });

    /* Candlestick series */
    candleSeries = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    /* Volume histogram as overlay at the bottom */
    volumeSeries = chart.addSeries(LWC.HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',            // overlay
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    /* Tooltip on crosshair move */
    chart.subscribeCrosshairMove(onCrosshairMove);

    /* Resize observer */
    if (window._chartResizeObserver) window._chartResizeObserver.disconnect();
    const ro = new ResizeObserver(() => {
      const rect = chartContainer.getBoundingClientRect();
      chart.applyOptions({ width: rect.width, height: rect.height });
    });
    ro.observe(chartContainer);
    window._chartResizeObserver = ro;

    // Initial size
    const rect = chartContainer.getBoundingClientRect();
    chart.applyOptions({ width: rect.width, height: rect.height });
  }

  /* ──────────────────────────────────────────────
   *  Crosshair tooltip
   * ────────────────────────────────────────────── */
  function onCrosshairMove(param) {
    if (!param || !param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
      tooltipEl.style.display = 'none';
      return;
    }

    const candleData = param.seriesData.get(candleSeries);
    const volData    = param.seriesData.get(volumeSeries);

    if (!candleData) {
      tooltipEl.style.display = 'none';
      return;
    }

    const o = candleData.open;
    const h = candleData.high;
    const l = candleData.low;
    const c = candleData.close;
    const v = volData ? volData.value : null;
    const isUp = c >= o;
    const cls  = isUp ? 'value-up' : 'value-down';

    let timeStr = '';
    if (typeof param.time === 'object') {
      // Business day format {year, month, day}
      timeStr = `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}`;
    } else if (typeof param.time === 'string') {
      timeStr = param.time;
    } else {
      // Unix timestamp
      const d = new Date(param.time * 1000);
      timeStr = d.toISOString().replace('T', ' ').slice(0, 16);
    }

    tooltipEl.innerHTML =
      `<div style="margin-bottom:4px;font-weight:600;">${currentTicker} · ${timeStr}</div>` +
      `<span class="label">O</span><span class="${cls}">${fmtNum(o, 2)}</span>  ` +
      `<span class="label">H</span><span class="${cls}">${fmtNum(h, 2)}</span>  ` +
      `<span class="label">L</span><span class="${cls}">${fmtNum(l, 2)}</span>  ` +
      `<span class="label">C</span><span class="${cls}">${fmtNum(c, 2)}</span>` +
      (v != null ? `  <span class="label">V</span><span style="color:var(--text-muted)">${fmtVol(v)}</span>` : '');

    tooltipEl.style.display = 'block';

    // Position tooltip near cursor but inside chart wrapper
    const wrapper = document.getElementById('chart-wrapper');
    const wrapRect = wrapper.getBoundingClientRect();
    const tipWidth = tooltipEl.offsetWidth;

    let left = param.point.x + 16;
    if (left + tipWidth > wrapRect.width - 8) {
      left = param.point.x - tipWidth - 16;
    }
    let top = param.point.y - 12;
    if (top < 4) top = 4;

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top + 'px';
  }

  /* ──────────────────────────────────────────────
   *  Fetch data & render
   * ────────────────────────────────────────────── */
  async function loadChart() {
    const ticker = tickerInput.value.trim().toUpperCase();
    const date   = dateInput.value;
    const tf     = currentTimeframe;

    if (!ticker) {
      showError('Enter a ticker symbol.');
      tickerInput.focus();
      return;
    }
    if (!date) {
      showError('Select a date.');
      dateInput.focus();
      return;
    }

    currentTicker = ticker;
    currentDate   = date;

    showLoading(`Fetching ${ticker} · ${tf} data...`);

    try {
      const url = `/api/stock?ticker=${encodeURIComponent(ticker)}&date=${date}&timeframe=${tf}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        showError(json.error || `Error ${res.status}`);
        return;
      }

      const bars = json.bars;
      if (!bars || bars.length === 0) {
        showError(`No data returned for ${ticker}.`);
        return;
      }

      /* Hide placeholder, create a fresh chart */
      if (placeholderEl) placeholderEl.classList.add('hidden');
      createChart();

      /* Prepare candle data */
      const candleData = bars.map(b => ({
        time:  b.time,
        open:  b.open,
        high:  b.high,
        low:   b.low,
        close: b.close,
      }));

      /* Prepare volume data with colour */
      const volData = bars.map(b => ({
        time:  b.time,
        value: b.volume,
        color: b.close >= b.open
          ? 'rgba(38, 166, 154, 0.35)'
          : 'rgba(239, 83, 80, 0.35)',
      }));

      candleSeries.setData(candleData);
      volumeSeries.setData(volData);

      /* Set visible range to end at the selected date */
      const lastBar = candleData[candleData.length - 1];
      chart.timeScale().scrollToPosition(5, false);
      /* Also make sure the last bar is visible */
      chart.timeScale().setVisibleRange({
        from: candleData[Math.max(0, candleData.length - 120)].time,
        to:   lastBar.time,
      });

      showSuccess(`${ticker} · ${tf} — ${bars.length.toLocaleString()} bars loaded (up to ${date})`);
    } catch (err) {
      console.error(err);
      showError('Network error. Check your connection and try again.');
    }
  }

  /* ──────────────────────────────────────────────
   *  Event listeners
   * ────────────────────────────────────────────── */

  /* Search button */
  searchBtn.addEventListener('click', loadChart);

  /* Enter key in ticker input */
  tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadChart();
  });

  /* Date change */
  dateInput.addEventListener('change', () => {
    if (currentTicker) loadChart();
  });

  /* Timeframe buttons */
  tfButtonsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tf]');
    if (!btn) return;

    // Highlight
    tfButtonsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentTimeframe = btn.dataset.tf;

    if (currentTicker) loadChart();
  });

  /* Force uppercase as user types */
  tickerInput.addEventListener('input', () => {
    tickerInput.value = tickerInput.value.toUpperCase();
  });

})();
