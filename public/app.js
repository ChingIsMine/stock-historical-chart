/**
 * Stock Historical Chart — Multi-Chart with Indicators
 *
 * Features:
 *   - Up to 6 independent chart panels
 *   - Layout modes: column, row, grid
 *   - Timeframes: 1m, 2m, 5m, 15m, 1h, 1D, 1W
 *   - Indicators: 9 EMA, 20 EMA, 50 SMA, 200 SMA, RSI(14)
 *   - Per-chart ticker, date, and timeframe
 */

(function () {
  'use strict';

  const LWC = window.LightweightCharts;
  const MAX_CHARTS = 6;

  /* ── Indicator visibility rules ── */
  const INDICATOR_RULES = {
    '9ema':   ['1W', '1D', '5', '2', '1'],
    '20ema':  ['1W', '1D', '5', '2', '1'],
    '50sma':  ['1W', '1D'],
    '200sma': ['1W', '1D'],
    'rsi':    ['1W', '1D', '1h', '15', '5', '2', '1'],
  };

  /* ── State ── */
  let panels = [];      // Array of panel objects
  let panelIdCounter = 0;
  let currentLayout = 'column';

  /* ── DOM refs ── */
  const chartsGrid    = document.getElementById('charts-grid');
  const addChartBtn   = document.getElementById('add-chart-btn');
  const layoutSwitcher = document.getElementById('layout-switcher');

  /* ── Helpers ── */
  function getNYDateString() {
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

  function fmtNum(n, dec) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtVol(n) {
    if (n == null) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString('en-US');
  }

  /* ── Indicator Calculations ── */
  function calcEMA(data, period) {
    const result = [];
    const k = 2 / (period + 1);
    let ema = null;
    for (let i = 0; i < data.length; i++) {
      const c = data[i].close;
      if (i < period - 1) {
        result.push({ time: data[i].time, value: undefined });
      } else if (ema === null) {
        // Seed with SMA of first `period` values
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
        ema = sum / period;
        result.push({ time: data[i].time, value: ema });
      } else {
        ema = c * k + ema * (1 - k);
        result.push({ time: data[i].time, value: ema });
      }
    }
    return result.filter(d => d.value !== undefined);
  }

  function calcSMA(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
      result.push({ time: data[i].time, value: sum / period });
    }
    return result;
  }

  function calcRSI(data, period) {
    const result = [];
    if (data.length < period + 1) return result;

    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[period].time, value: rsi });

    for (let i = period + 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      result.push({ time: data[i].time, value: rsi });
    }
    return result;
  }

  /* ── Create Panel DOM ── */
  function createPanelDOM(id) {
    const nyToday = getNYDateString();
    const panel = document.createElement('div');
    panel.className = 'chart-panel';
    panel.dataset.panelId = id;
    panel.innerHTML = `
      <div class="panel-toolbar">
        <input type="text" class="panel-ticker" placeholder="AAPL" spellcheck="false" autocomplete="off" maxlength="10" />
        <input type="date" class="panel-date" value="${nyToday}" max="${nyToday}" />
        <button class="btn-search" type="button">Go</button>
        <div class="tf-bar">
          <button data-tf="1" type="button">1m</button>
          <button data-tf="2" type="button">2m</button>
          <button data-tf="5" type="button">5m</button>
          <button data-tf="15" type="button">15m</button>
          <button data-tf="1h" type="button">1h</button>
          <button data-tf="1D" type="button" class="active">1D</button>
          <button data-tf="1W" type="button">1W</button>
        </div>
        <button class="btn-close-panel" type="button" title="Remove chart">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="chart-body">
        <div class="chart-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style="opacity:0.2">
            <path d="M3 20L9 14L13 18L21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M17 6H21V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Enter a ticker and click Go</span>
        </div>
        <div class="chart-container"></div>
        <div class="chart-tooltip"></div>
      </div>
      <div class="panel-status"></div>
    `;
    return panel;
  }

  /* ── Panel Object ── */
  function createPanel() {
    if (panels.length >= MAX_CHARTS) return;

    const id = ++panelIdCounter;
    const dom = createPanelDOM(id);
    chartsGrid.appendChild(dom);

    const p = {
      id,
      dom,
      ticker: '',
      date: '',
      timeframe: '1D',
      chart: null,
      candleSeries: null,
      volumeSeries: null,
      ema9Series: null,
      ema20Series: null,
      sma50Series: null,
      sma200Series: null,
      rsiSeries: null,
      resizeObserver: null,
      barsData: null,
    };

    panels.push(p);
    bindPanelEvents(p);
    updateAddButton();
    return p;
  }

  function removePanel(p) {
    if (panels.length <= 1) return; // Keep at least 1
    if (p.chart) p.chart.remove();
    if (p.resizeObserver) p.resizeObserver.disconnect();
    p.dom.remove();
    panels = panels.filter(x => x.id !== p.id);
    updateAddButton();
  }

  function updateAddButton() {
    addChartBtn.disabled = panels.length >= MAX_CHARTS;
    addChartBtn.textContent = panels.length >= MAX_CHARTS
      ? `${MAX_CHARTS} / ${MAX_CHARTS}`
      : `+ Add Chart (${panels.length}/${MAX_CHARTS})`;
  }

  /* ── Bind events for a panel ── */
  function bindPanelEvents(p) {
    const toolbar = p.dom.querySelector('.panel-toolbar');
    const tickerInput = toolbar.querySelector('.panel-ticker');
    const dateInput   = toolbar.querySelector('.panel-date');
    const searchBtn   = toolbar.querySelector('.btn-search');
    const tfBar       = toolbar.querySelector('.tf-bar');
    const closeBtn    = toolbar.querySelector('.btn-close-panel');

    searchBtn.addEventListener('click', () => {
      p.ticker = tickerInput.value.trim().toUpperCase();
      p.date = dateInput.value;
      loadChart(p);
    });

    tickerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        p.ticker = tickerInput.value.trim().toUpperCase();
        p.date = dateInput.value;
        loadChart(p);
      }
    });

    tickerInput.addEventListener('input', () => {
      tickerInput.value = tickerInput.value.toUpperCase();
    });

    dateInput.addEventListener('change', () => {
      if (p.ticker) {
        p.date = dateInput.value;
        loadChart(p);
      }
    });

    tfBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tf]');
      if (!btn) return;
      tfBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      p.timeframe = btn.dataset.tf;
      if (p.ticker) {
        p.date = dateInput.value;
        loadChart(p);
      }
    });

    closeBtn.addEventListener('click', () => removePanel(p));
  }

  /* ── Status helpers per panel ── */
  function panelStatus(p, type, msg) {
    const el = p.dom.querySelector('.panel-status');
    el.className = 'panel-status ' + type;
    if (type === 'loading') {
      el.innerHTML = `<span class="spinner"></span> ${msg}`;
    } else {
      el.textContent = msg;
    }
  }

  /* ── Build chart for a panel ── */
  function buildChart(p) {
    if (p.chart) { p.chart.remove(); p.chart = null; }
    if (p.resizeObserver) { p.resizeObserver.disconnect(); p.resizeObserver = null; }

    const container = p.dom.querySelector('.chart-container');
    const placeholder = p.dom.querySelector('.chart-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    const showRSI = INDICATOR_RULES.rsi.includes(p.timeframe);

    const chartOpts = {
      layout: {
        background: { type: 'solid', color: '#16171e' },
        textColor: '#787c8e',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e2030' },
        horzLines: { color: '#1e2030' },
      },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: '#5b8def' },
        horzLine: { labelBackgroundColor: '#5b8def' },
      },
      rightPriceScale: {
        borderColor: '#24262f',
        scaleMargins: { top: 0.05, bottom: 0.28 },
      },
      timeScale: {
        borderColor: '#24262f',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        minBarSpacing: 1.5,
      },
      handleScroll: true,
      handleScale: true,
    };

    p.chart = LWC.createChart(container, chartOpts);

    /* Candlestick */
    p.candleSeries = p.chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    /* Volume overlay */
    p.volumeSeries = p.chart.addSeries(LWC.HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    p.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    /* Indicators — conditionally add */
    const tf = p.timeframe;

    // 9 EMA
    if (INDICATOR_RULES['9ema'].includes(tf)) {
      p.ema9Series = p.chart.addSeries(LWC.LineSeries, {
        color: '#f5c842',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: '9 EMA',
      });
    } else {
      p.ema9Series = null;
    }

    // 20 EMA
    if (INDICATOR_RULES['20ema'].includes(tf)) {
      p.ema20Series = p.chart.addSeries(LWC.LineSeries, {
        color: '#42a5f5',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: '20 EMA',
      });
    } else {
      p.ema20Series = null;
    }

    // 50 SMA
    if (INDICATOR_RULES['50sma'].includes(tf)) {
      p.sma50Series = p.chart.addSeries(LWC.LineSeries, {
        color: '#ab47bc',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: '50 SMA',
      });
    } else {
      p.sma50Series = null;
    }

    // 200 SMA
    if (INDICATOR_RULES['200sma'].includes(tf)) {
      p.sma200Series = p.chart.addSeries(LWC.LineSeries, {
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LWC.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: '200 SMA',
      });
    } else {
      p.sma200Series = null;
    }

    // RSI in separate pane (pane index 1)
    if (showRSI) {
      p.rsiSeries = p.chart.addSeries(LWC.LineSeries, {
        color: '#e0be36',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'RSI 14',
        priceFormat: { type: 'custom', formatter: (v) => v.toFixed(1) },
        priceScaleId: 'rsi',
      }, 1);

      p.chart.priceScale('rsi').applyOptions({
        autoScale: true,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      });

      // Set RSI pane height smaller
      const panes = p.chart.panes();
      if (panes.length > 1) {
        panes[1].setHeight(100);
      }
    } else {
      p.rsiSeries = null;
    }

    /* Tooltip */
    const tooltipEl = p.dom.querySelector('.chart-tooltip');
    p.chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltipEl.style.display = 'none';
        return;
      }
      const cd = param.seriesData.get(p.candleSeries);
      const vd = param.seriesData.get(p.volumeSeries);
      if (!cd) { tooltipEl.style.display = 'none'; return; }

      const o = cd.open, h = cd.high, l = cd.low, c = cd.close;
      const v = vd ? vd.value : null;
      const isUp = c >= o;
      const cls = isUp ? 'value-up' : 'value-down';

      let timeStr = '';
      if (typeof param.time === 'object') {
        timeStr = `${param.time.year}-${String(param.time.month).padStart(2,'0')}-${String(param.time.day).padStart(2,'0')}`;
      } else if (typeof param.time === 'string') {
        timeStr = param.time;
      } else {
        timeStr = new Date(param.time * 1000).toISOString().replace('T',' ').slice(0,16);
      }

      tooltipEl.innerHTML =
        `<div style="margin-bottom:3px;font-weight:600">${p.ticker} · ${timeStr}</div>` +
        `<span class="label">O</span><span class="${cls}">${fmtNum(o,2)}</span> ` +
        `<span class="label">H</span><span class="${cls}">${fmtNum(h,2)}</span> ` +
        `<span class="label">L</span><span class="${cls}">${fmtNum(l,2)}</span> ` +
        `<span class="label">C</span><span class="${cls}">${fmtNum(c,2)}</span>` +
        (v != null ? ` <span class="label">V</span><span style="color:var(--text-muted)">${fmtVol(v)}</span>` : '');

      tooltipEl.style.display = 'block';
      const bodyRect = p.dom.querySelector('.chart-body').getBoundingClientRect();
      let left = param.point.x + 14;
      if (left + tooltipEl.offsetWidth > bodyRect.width - 8) left = param.point.x - tooltipEl.offsetWidth - 14;
      let top = param.point.y - 10;
      if (top < 4) top = 4;
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
    });

    /* Resize observer */
    p.resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        p.chart.applyOptions({ width: rect.width, height: rect.height });
      }
    });
    p.resizeObserver.observe(container);

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      p.chart.applyOptions({ width: rect.width, height: rect.height });
    }
  }

  /* ── Fetch & render ── */
  async function loadChart(p) {
    if (!p.ticker) {
      panelStatus(p, 'error', 'Enter a ticker symbol.');
      return;
    }
    if (!p.date) {
      panelStatus(p, 'error', 'Select a date.');
      return;
    }

    panelStatus(p, 'loading', `${p.ticker} · ${p.timeframe}...`);

    try {
      const url = `/api/stock?ticker=${encodeURIComponent(p.ticker)}&date=${p.date}&timeframe=${p.timeframe}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        panelStatus(p, 'error', json.error || `Error ${res.status}`);
        return;
      }

      const bars = json.bars;
      if (!bars || bars.length === 0) {
        panelStatus(p, 'error', `No data for ${p.ticker}.`);
        return;
      }

      p.barsData = bars;

      /* Build fresh chart (includes indicator series based on timeframe) */
      buildChart(p);

      /* Set candle data */
      const candleData = bars.map(b => ({
        time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      }));
      p.candleSeries.setData(candleData);

      /* Set volume data */
      p.volumeSeries.setData(bars.map(b => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
      })));

      /* Calculate and set indicators */
      if (p.ema9Series)   p.ema9Series.setData(calcEMA(bars, 9));
      if (p.ema20Series)  p.ema20Series.setData(calcEMA(bars, 20));
      if (p.sma50Series)  p.sma50Series.setData(calcSMA(bars, 50));
      if (p.sma200Series) p.sma200Series.setData(calcSMA(bars, 200));
      if (p.rsiSeries)    p.rsiSeries.setData(calcRSI(bars, 14));

      /* Visible range */
      const last = candleData[candleData.length - 1];
      const from = candleData[Math.max(0, candleData.length - 120)].time;
      p.chart.timeScale().setVisibleRange({ from, to: last.time });

      panelStatus(p, 'success', `${p.ticker} · ${p.timeframe} — ${bars.length.toLocaleString()} bars (${p.date})`);

    } catch (err) {
      console.error(err);
      panelStatus(p, 'error', 'Network error. Try again.');
    }
  }

  /* ── Layout switching ── */
  layoutSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-layout]');
    if (!btn) return;
    layoutSwitcher.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLayout = btn.dataset.layout;
    chartsGrid.className = 'charts-grid layout-' + currentLayout;

    // Trigger resize on all charts
    setTimeout(() => {
      panels.forEach(p => {
        if (p.chart) {
          const rect = p.dom.querySelector('.chart-container').getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            p.chart.applyOptions({ width: rect.width, height: rect.height });
          }
        }
      });
    }, 50);
  });

  /* ── Add chart button ── */
  addChartBtn.addEventListener('click', () => createPanel());

  /* ── Init: create first panel ── */
  createPanel();

})();
