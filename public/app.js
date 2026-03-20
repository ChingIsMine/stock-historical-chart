(function () {
  'use strict';
  const LWC = window.LightweightCharts;
  const MAX_CHARTS = 6;

  /* ── Indicator config & defaults ── */
  const INDICATOR_DEFS = [
    { key: '9ema',   label: '9 EMA',   color: '#f5c842', lineWidth: 1, lineStyle: 0, visible: true, tfs: ['1W','1D','5','2','1'] },
    { key: '20ema',  label: '20 EMA',  color: '#42a5f5', lineWidth: 1, lineStyle: 0, visible: true, tfs: ['1W','1D','5','2','1'] },
    { key: '50sma',  label: '50 SMA',  color: '#ab47bc', lineWidth: 1, lineStyle: 0, visible: true, tfs: ['1W','1D'] },
    { key: '200sma', label: '200 SMA', color: '#ef5350', lineWidth: 1, lineStyle: 2, visible: true, tfs: ['1W','1D'] },
    { key: 'vwap',   label: 'VWAP',    color: '#ff9800', lineWidth: 1.5, lineStyle: 0, visible: true, tfs: ['5','2','1'] },
    { key: 'rsi',    label: 'RSI 14',  color: '#e0be36', lineWidth: 1.5, lineStyle: 0, visible: true, tfs: ['1W','1D','1h','15','5','2','1'] },
  ];
  let indicatorSettings = INDICATOR_DEFS.map(d => ({ ...d }));

  /* ── State ── */
  let panels = [], panelIdCounter = 0, currentLayout = 'column';
  let activeTool = 'pointer'; // pointer | trendline | long | short

  /* ── DOM ── */
  const chartsGrid = document.getElementById('charts-grid');
  const addChartBtn = document.getElementById('add-chart-btn');
  const layoutSwitcher = document.getElementById('layout-switcher');
  const toolBar = document.getElementById('tool-bar');
  const globalTicker = document.getElementById('global-ticker');
  const globalDate = document.getElementById('global-date');
  const globalSearch = document.getElementById('global-search');
  const indicatorModal = document.getElementById('indicator-modal');
  const indicatorRows = document.getElementById('indicator-rows');
  const indicatorBtn = document.getElementById('indicator-settings-btn');
  const modalClose = document.getElementById('modal-close');
  const modalApply = document.getElementById('modal-apply');
  const clearDrawingsBtn = document.getElementById('clear-drawings');

  /* ── Helpers ── */
  function getNYDate() {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`;
  }
  function fN(n, d) { return n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fV(n) { if (n==null) return '—'; if (n>=1e9) return (n/1e9).toFixed(2)+'B'; if (n>=1e6) return (n/1e6).toFixed(2)+'M'; if (n>=1e3) return (n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }

  (function initDate() {
    const d = getNYDate();
    globalDate.value = d;
    globalDate.max = d;
  })();

  /* ── Indicator calculations ── */
  function calcEMA(data, period) {
    const r = [], k = 2/(period+1); let ema = null;
    for (let i=0; i<data.length; i++) {
      if (i<period-1) continue;
      if (ema===null) { let s=0; for(let j=i-period+1;j<=i;j++) s+=data[j].close; ema=s/period; }
      else ema = data[i].close*k + ema*(1-k);
      r.push({ time: data[i].time, value: ema });
    }
    return r;
  }
  function calcSMA(data, period) {
    const r = [];
    for (let i=period-1; i<data.length; i++) { let s=0; for(let j=i-period+1;j<=i;j++) s+=data[j].close; r.push({ time:data[i].time, value:s/period }); }
    return r;
  }
  function calcRSI(data, period) {
    const r = []; if (data.length<period+1) return r;
    let ag=0, al=0;
    for(let i=1;i<=period;i++){const c=data[i].close-data[i-1].close; if(c>0)ag+=c; else al+=Math.abs(c);}
    ag/=period; al/=period;
    r.push({ time:data[period].time, value: al===0?100:100-100/(1+ag/al) });
    for(let i=period+1;i<data.length;i++){
      const c=data[i].close-data[i-1].close;
      ag=(ag*(period-1)+(c>0?c:0))/period;
      al=(al*(period-1)+(c<0?Math.abs(c):0))/period;
      r.push({ time:data[i].time, value: al===0?100:100-100/(1+ag/al) });
    }
    return r;
  }
  function calcVWAP(data) {
    const r = []; let cumVol=0, cumTP=0;
    for(const b of data){
      const tp=(b.high+b.low+b.close)/3;
      cumVol+=b.volume; cumTP+=tp*b.volume;
      r.push({ time:b.time, value: cumVol>0 ? cumTP/cumVol : tp });
    }
    return r;
  }

  /* ── RTH session markers (US Eastern) ── */
  // RTH: 9:30-16:00 ET. Returns unix timestamps (seconds) of session boundaries within the data range.
  function getRTHBoundaries(bars, timeframe) {
    if (timeframe === '1D' || timeframe === '1W') return []; // No ETH separation on daily/weekly
    const boundaries = [];
    const seen = new Set();
    for (const b of bars) {
      if (typeof b.time !== 'number') continue;
      const d = new Date(b.time * 1000);
      // Get NY date string for this bar
      const nyStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (seen.has(nyStr)) continue;
      seen.add(nyStr);
      // Compute 9:30 and 16:00 ET for this date
      // Create date in NY timezone
      const [y,m,day] = nyStr.split('-').map(Number);
      // Use a trick: create dates and find UTC offset
      const open930 = getETTimestamp(y, m, day, 9, 30);
      const close1600 = getETTimestamp(y, m, day, 16, 0);
      if (open930) boundaries.push({ time: open930, label: 'Open' });
      if (close1600) boundaries.push({ time: close1600, label: 'Close' });
    }
    return boundaries;
  }

  function getETTimestamp(y, m, d, h, min) {
    // Build an ISO string and parse as NY time
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
    // Determine UTC offset for this date/time in NY
    const utcDate = new Date(dateStr + 'Z');
    const nyFormatted = utcDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nyDate = new Date(nyFormatted);
    const diffMs = utcDate.getTime() - nyDate.getTime();
    // The actual UTC time for the given NY time
    const actualUTC = new Date(dateStr + 'Z').getTime() + diffMs;
    return Math.floor(actualUTC / 1000);
  }

  /* ── Vertical Line Plugin (vanilla JS) ── */
  class VertLineRenderer {
    constructor(x, opts) { this._x = x; this._opts = opts; }
    draw(target) {
      target.useBitmapCoordinateSpace(scope => {
        if (this._x === null) return;
        const ctx = scope.context;
        const x = Math.round(this._x * scope.horizontalPixelRatio);
        ctx.beginPath();
        ctx.setLineDash(this._opts.dash || [4, 3]);
        ctx.strokeStyle = this._opts.color || 'rgba(120,124,142,0.4)';
        ctx.lineWidth = (this._opts.width || 1) * scope.horizontalPixelRatio;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, scope.bitmapSize.height);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
  }
  class VertLinePaneView {
    constructor(src, opts) { this._src = src; this._opts = opts; this._x = null; }
    update() { this._x = this._src._chart.timeScale().timeToCoordinate(this._src._time); }
    renderer() { return new VertLineRenderer(this._x, this._opts); }
  }
  class VertLine {
    constructor(chart, series, time, opts) {
      this._chart = chart; this._series = series; this._time = time;
      this._paneViews = [new VertLinePaneView(this, opts || {})];
    }
    updateAllViews() { this._paneViews.forEach(v => v.update()); }
    paneViews() { return this._paneViews; }
  }

  /* ── R-Multiple Box Plugin ── */
  class RBoxRenderer {
    constructor(p1, p2, opts) { this._p1 = p1; this._p2 = p2; this._opts = opts; }
    draw(target) {
      target.useBitmapCoordinateSpace(scope => {
        if (!this._p1 || !this._p2) return;
        const ctx = scope.context;
        const hr = scope.horizontalPixelRatio, vr = scope.verticalPixelRatio;
        const x1 = this._p1.x * hr, x2 = this._p2.x * hr;
        const entryY = this._p1.entryY * vr, stopY = this._p1.stopY * vr, targetY = this._p1.targetY * vr;
        const left = Math.min(x1, x2), right = Math.max(x1, x2);
        const width = right - left;
        // Profit zone
        ctx.fillStyle = this._opts.isLong ? 'rgba(38,166,154,0.12)' : 'rgba(239,83,80,0.12)';
        const profitTop = Math.min(entryY, targetY), profitBot = Math.max(entryY, targetY);
        ctx.fillRect(left, profitTop, width, profitBot - profitTop);
        // Loss zone
        ctx.fillStyle = this._opts.isLong ? 'rgba(239,83,80,0.12)' : 'rgba(38,166,154,0.12)';
        const lossTop = Math.min(entryY, stopY), lossBot = Math.max(entryY, stopY);
        ctx.fillRect(left, lossTop, width, lossBot - lossTop);
        // Lines
        ctx.setLineDash([]);
        // Entry
        ctx.strokeStyle = '#e1e3ea'; ctx.lineWidth = 1.5 * hr;
        ctx.beginPath(); ctx.moveTo(left, entryY); ctx.lineTo(right, entryY); ctx.stroke();
        // Stop
        ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 1 * hr;
        ctx.setLineDash([4*hr, 3*hr]);
        ctx.beginPath(); ctx.moveTo(left, stopY); ctx.lineTo(right, stopY); ctx.stroke();
        // Target
        ctx.strokeStyle = '#26a69a'; ctx.lineWidth = 1 * hr;
        ctx.beginPath(); ctx.moveTo(left, targetY); ctx.lineTo(right, targetY); ctx.stroke();
        ctx.setLineDash([]);
        // R label
        const risk = Math.abs(entryY - stopY);
        const reward = Math.abs(targetY - entryY);
        const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';
        ctx.font = `${11 * vr}px Inter, sans-serif`;
        ctx.fillStyle = '#e1e3ea';
        ctx.fillText(`R:R ${rr}`, left + 4*hr, Math.min(entryY, targetY, stopY) - 4*vr);
      });
    }
  }
  class RBoxPaneView {
    constructor(src) { this._src = src; }
    update() {
      const ts = this._src._chart.timeScale();
      const ps = this._src._series.priceScale();
      const cs = this._src._series;
      this._p1 = null; this._p2 = null;
      const x1 = ts.timeToCoordinate(this._src._t1);
      const x2 = ts.timeToCoordinate(this._src._t2);
      if (x1 === null || x2 === null) return;
      const entryY = cs.priceToCoordinate(this._src._entry);
      const stopY = cs.priceToCoordinate(this._src._stop);
      const targetY = cs.priceToCoordinate(this._src._target);
      if (entryY === null || stopY === null || targetY === null) return;
      this._p1 = { x: x1, entryY, stopY, targetY };
      this._p2 = { x: x2 };
    }
    renderer() { return new RBoxRenderer(this._p1, this._p2, { isLong: this._src._isLong }); }
  }
  class RBox {
    constructor(chart, series, t1, t2, entry, stop, target, isLong) {
      this._chart = chart; this._series = series;
      this._t1 = t1; this._t2 = t2; this._entry = entry; this._stop = stop; this._target = target; this._isLong = isLong;
      this._paneViews = [new RBoxPaneView(this)];
    }
    updateAllViews() { this._paneViews.forEach(v => v.update()); }
    paneViews() { return this._paneViews; }
  }

  /* ── Drawing state per panel ── */
  function initDrawingState() {
    return { trendLines: [], rBoxes: [], vertLines: [], pendingClick: null };
  }

  /* ── Create Panel DOM ── */
  function createPanelDOM(id) {
    const el = document.createElement('div');
    el.className = 'chart-panel';
    el.dataset.panelId = id;
    el.innerHTML = `
      <div class="panel-toolbar">
        <div class="tf-bar">
          <button data-tf="1" type="button">1m</button>
          <button data-tf="2" type="button">2m</button>
          <button data-tf="5" type="button">5m</button>
          <button data-tf="15" type="button">15m</button>
          <button data-tf="1h" type="button">1h</button>
          <button data-tf="1D" type="button" class="active">1D</button>
          <button data-tf="1W" type="button">1W</button>
        </div>
        <button class="btn-close-panel" type="button" title="Remove">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="chart-body">
        <div class="chart-placeholder"><span>Load a ticker above</span></div>
        <div class="chart-container"></div>
        <div class="chart-tooltip"></div>
      </div>
      <div class="panel-status"></div>`;
    return el;
  }

  /* ── Panel object ── */
  function createPanel() {
    if (panels.length >= MAX_CHARTS) return;
    const id = ++panelIdCounter;
    const dom = createPanelDOM(id);
    chartsGrid.appendChild(dom);
    const p = {
      id, dom, timeframe: '1D',
      chart: null, candleSeries: null, volumeSeries: null,
      indSeries: {}, rsiSeries: null,
      resizeObserver: null, barsData: null,
      drawing: initDrawingState(),
    };
    panels.push(p);
    bindPanelEvents(p);
    updateAddBtn();
    return p;
  }

  function removePanel(p) {
    if (panels.length <= 1) return;
    if (p.chart) p.chart.remove();
    if (p.resizeObserver) p.resizeObserver.disconnect();
    p.dom.remove();
    panels = panels.filter(x => x.id !== p.id);
    updateAddBtn();
  }

  function updateAddBtn() {
    addChartBtn.disabled = panels.length >= MAX_CHARTS;
    addChartBtn.textContent = panels.length >= MAX_CHARTS ? `${MAX_CHARTS}/${MAX_CHARTS}` : `+ Add (${panels.length}/${MAX_CHARTS})`;
  }

  /* ── Panel events ── */
  function bindPanelEvents(p) {
    const tb = p.dom.querySelector('.panel-toolbar');
    const tfBar = tb.querySelector('.tf-bar');
    const closeBtn = tb.querySelector('.btn-close-panel');

    tfBar.addEventListener('click', e => {
      const btn = e.target.closest('button[data-tf]');
      if (!btn) return;
      tfBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      p.timeframe = btn.dataset.tf;
      const ticker = globalTicker.value.trim().toUpperCase();
      const date = globalDate.value;
      if (ticker && date) loadChart(p, ticker, date);
    });
    closeBtn.addEventListener('click', () => removePanel(p));
  }

  function panelStatus(p, type, msg) {
    const el = p.dom.querySelector('.panel-status');
    el.className = 'panel-status ' + type;
    el.innerHTML = type === 'loading' ? `<span class="spinner"></span> ${msg}` : msg;
  }

  /* ── Build chart ── */
  function buildChart(p) {
    if (p.chart) p.chart.remove();
    if (p.resizeObserver) p.resizeObserver.disconnect();
    p.indSeries = {}; p.rsiSeries = null;
    p.drawing = initDrawingState();

    const container = p.dom.querySelector('.chart-container');
    p.dom.querySelector('.chart-placeholder').classList.add('hidden');

    const tf = p.timeframe;
    const isIntraday = ['1','2','5','15','1h'].includes(tf);

    p.chart = LWC.createChart(container, {
      layout: { background: { type:'solid', color:'#16171e' }, textColor:'#787c8e', fontFamily:"'Inter',sans-serif", fontSize:11 },
      grid: { vertLines:{color:'#1e2030'}, horzLines:{color:'#1e2030'} },
      crosshair: { mode: LWC.CrosshairMode.Normal, vertLine:{labelBackgroundColor:'#5b8def'}, horzLine:{labelBackgroundColor:'#5b8def'} },
      rightPriceScale: { borderColor:'#24262f', scaleMargins:{top:0.05,bottom:0.25} },
      timeScale: { borderColor:'#24262f', timeVisible:true, secondsVisible:false, rightOffset:3, minBarSpacing:1.5 },
      localization: {
        timeFormatter: isIntraday ? (t) => {
          const d = new Date(t * 1000);
          return d.toLocaleString('en-US', { timeZone:'America/New_York', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
        } : undefined,
      },
    });

    // Candlestick
    p.candleSeries = p.chart.addSeries(LWC.CandlestickSeries, {
      upColor:'#26a69a', downColor:'#ef5350', borderVisible:false,
      wickUpColor:'#26a69a', wickDownColor:'#ef5350',
    });

    // Volume overlay
    p.volumeSeries = p.chart.addSeries(LWC.HistogramSeries, { priceFormat:{type:'volume'}, priceScaleId:'' });
    p.volumeSeries.priceScale().applyOptions({ scaleMargins:{top:0.82,bottom:0} });

    // Indicators
    for (const ind of indicatorSettings) {
      if (ind.key === 'rsi') continue; // handled separately
      if (!ind.visible || !ind.tfs.includes(tf)) continue;
      p.indSeries[ind.key] = p.chart.addSeries(LWC.LineSeries, {
        color: ind.color, lineWidth: ind.lineWidth,
        lineStyle: ind.lineStyle,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        title: ind.label,
      });
    }

    // RSI
    const rsiCfg = indicatorSettings.find(x => x.key === 'rsi');
    if (rsiCfg.visible && rsiCfg.tfs.includes(tf)) {
      p.rsiSeries = p.chart.addSeries(LWC.LineSeries, {
        color: rsiCfg.color, lineWidth: rsiCfg.lineWidth, lineStyle: rsiCfg.lineStyle,
        priceLineVisible: false, lastValueVisible: true,
        title: 'RSI 14', priceFormat: { type:'custom', formatter: v => v.toFixed(1) },
        priceScaleId: 'rsi',
      }, 1);
      p.chart.priceScale('rsi').applyOptions({ autoScale:true, scaleMargins:{top:0.05,bottom:0.05} });
      const panes = p.chart.panes();
      if (panes.length > 1) panes[1].setHeight(90);
    }

    // Tooltip
    const tip = p.dom.querySelector('.chart-tooltip');
    p.chart.subscribeCrosshairMove(param => {
      if (!param||!param.time||!param.point||param.point.x<0||param.point.y<0) { tip.style.display='none'; return; }
      const cd = param.seriesData.get(p.candleSeries);
      const vd = param.seriesData.get(p.volumeSeries);
      if (!cd) { tip.style.display='none'; return; }
      const { open:o, high:h, low:l, close:c } = cd;
      const v = vd ? vd.value : null;
      const cls = c >= o ? 'up' : 'dn';
      let ts = '';
      if (typeof param.time === 'string') ts = param.time;
      else if (typeof param.time === 'object') ts = `${param.time.year}-${String(param.time.month).padStart(2,'0')}-${String(param.time.day).padStart(2,'0')}`;
      else {
        const d = new Date(param.time * 1000);
        ts = d.toLocaleString('en-US', { timeZone:'America/New_York', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
      }
      tip.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${globalTicker.value.toUpperCase()} · ${ts}</div>`+
        `<span class="lbl">O</span><span class="${cls}">${fN(o,2)}</span> `+
        `<span class="lbl">H</span><span class="${cls}">${fN(h,2)}</span> `+
        `<span class="lbl">L</span><span class="${cls}">${fN(l,2)}</span> `+
        `<span class="lbl">C</span><span class="${cls}">${fN(c,2)}</span>`+
        (v!=null?` <span class="lbl">V</span><span style="color:var(--text-muted)">${fV(v)}</span>`:'');
      tip.style.display = 'block';
      let left = param.point.x + 12;
      if (left + tip.offsetWidth > p.dom.querySelector('.chart-body').offsetWidth - 8) left = param.point.x - tip.offsetWidth - 12;
      let top = param.point.y - 8; if (top < 4) top = 4;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    });

    // Drawing click handler
    setupDrawingHandler(p);

    // Resize
    p.resizeObserver = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) p.chart.applyOptions({ width: r.width, height: r.height });
    });
    p.resizeObserver.observe(container);
    const r = container.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) p.chart.applyOptions({ width: r.width, height: r.height });
  }

  /* ── Drawing handler ── */
  function setupDrawingHandler(p) {
    const container = p.dom.querySelector('.chart-container');
    container.addEventListener('click', (e) => {
      if (activeTool === 'pointer') return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = p.chart.timeScale().coordinateToTime(x);
      const price = p.candleSeries.coordinateToPrice(y);
      if (time == null || price == null) return;

      if (activeTool === 'trendline') {
        handleTrendlineClick(p, time, price);
      } else if (activeTool === 'long' || activeTool === 'short') {
        handleRBoxClick(p, time, price, activeTool === 'long');
      }
    });
  }

  function handleTrendlineClick(p, time, price) {
    if (!p.drawing.pendingClick) {
      p.drawing.pendingClick = { time, price, type: 'trendline' };
      panelStatus(p, 'loading', 'Click second point for trend line...');
    } else if (p.drawing.pendingClick.type === 'trendline') {
      const s = p.chart.addSeries(LWC.LineSeries, {
        color: '#e1e3ea', lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: p.drawing.pendingClick.time, value: p.drawing.pendingClick.price },
        { time: time, value: price },
      ]);
      p.drawing.trendLines.push(s);
      p.drawing.pendingClick = null;
      panelStatus(p, 'success', 'Trend line drawn');
    }
  }

  function handleRBoxClick(p, time, price, isLong) {
    const pc = p.drawing.pendingClick;
    if (!pc) {
      p.drawing.pendingClick = { time, price, type: 'rbox', step: 1, isLong };
      panelStatus(p, 'loading', 'Click stop loss level...');
    } else if (pc.type === 'rbox' && pc.step === 1) {
      pc.stop = price;
      pc.step = 2;
      panelStatus(p, 'loading', 'Click take profit level...');
    } else if (pc.type === 'rbox' && pc.step === 2) {
      const entry = pc.price;
      const stop = pc.stop;
      const target = price;
      const rbox = new RBox(p.chart, p.candleSeries, pc.time, time, entry, stop, target, pc.isLong);
      p.candleSeries.attachPrimitive(rbox);
      p.drawing.rBoxes.push(rbox);
      p.drawing.pendingClick = null;
      const risk = Math.abs(entry - stop);
      const reward = Math.abs(target - entry);
      const rr = risk > 0 ? (reward / risk).toFixed(2) : '—';
      panelStatus(p, 'success', `${pc.isLong ? 'Long' : 'Short'} R:R = ${rr}`);
    }
  }

  /* ── Fetch & render ── */
  async function loadChart(p, ticker, date) {
    if (!ticker || !date) return;
    panelStatus(p, 'loading', `${ticker} · ${p.timeframe}...`);
    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}&date=${date}&timeframe=${p.timeframe}`);
      const json = await res.json();
      if (!res.ok) { panelStatus(p, 'error', json.error || `Error ${res.status}`); return; }
      const bars = json.bars;
      if (!bars || !bars.length) { panelStatus(p, 'error', `No data for ${ticker}.`); return; }
      p.barsData = bars;
      buildChart(p);

      // Candles
      p.candleSeries.setData(bars.map(b => ({ time:b.time, open:b.open, high:b.high, low:b.low, close:b.close })));
      // Volume
      p.volumeSeries.setData(bars.map(b => ({ time:b.time, value:b.volume, color: b.close>=b.open?'rgba(38,166,154,0.25)':'rgba(239,83,80,0.25)' })));

      // Indicators
      const tf = p.timeframe;
      for (const ind of indicatorSettings) {
        if (ind.key === 'rsi' || !p.indSeries[ind.key]) continue;
        let d;
        if (ind.key === '9ema')   d = calcEMA(bars, 9);
        else if (ind.key === '20ema')  d = calcEMA(bars, 20);
        else if (ind.key === '50sma')  d = calcSMA(bars, 50);
        else if (ind.key === '200sma') d = calcSMA(bars, 200);
        else if (ind.key === 'vwap')   d = calcVWAP(bars);
        if (d) p.indSeries[ind.key].setData(d);
      }
      if (p.rsiSeries) p.rsiSeries.setData(calcRSI(bars, 14));

      // RTH vertical lines
      const boundaries = getRTHBoundaries(bars, tf);
      for (const b of boundaries) {
        const vl = new VertLine(p.chart, p.candleSeries, b.time, {
          color: 'rgba(120,124,142,0.4)', width: 1, dash: [4, 4],
        });
        p.candleSeries.attachPrimitive(vl);
        p.drawing.vertLines.push(vl);
      }

      // Visible range
      const candleData = bars.map(b => ({ time:b.time }));
      const last = candleData[candleData.length - 1];
      const from = candleData[Math.max(0, candleData.length - 100)].time;
      p.chart.timeScale().setVisibleRange({ from, to: last.time });

      panelStatus(p, 'success', `${ticker} · ${p.timeframe} — ${bars.length.toLocaleString()} bars (${date})`);
    } catch (err) {
      console.error(err);
      panelStatus(p, 'error', 'Network error.');
    }
  }

  /* ── Load all charts ── */
  function loadAll() {
    const ticker = globalTicker.value.trim().toUpperCase();
    const date = globalDate.value;
    if (!ticker) { globalTicker.focus(); return; }
    if (!date) { globalDate.focus(); return; }
    globalTicker.value = ticker;
    panels.forEach(p => loadChart(p, ticker, date));
  }

  /* ── Global events ── */
  globalSearch.addEventListener('click', loadAll);
  globalTicker.addEventListener('keydown', e => { if (e.key === 'Enter') loadAll(); });
  globalTicker.addEventListener('input', () => { globalTicker.value = globalTicker.value.toUpperCase(); });
  globalDate.addEventListener('change', () => {
    if (globalTicker.value.trim()) loadAll();
  });

  addChartBtn.addEventListener('click', () => {
    const p = createPanel();
    const ticker = globalTicker.value.trim().toUpperCase();
    const date = globalDate.value;
    if (ticker && date) loadChart(p, ticker, date);
  });

  /* Layout */
  layoutSwitcher.addEventListener('click', e => {
    const btn = e.target.closest('button[data-layout]');
    if (!btn) return;
    layoutSwitcher.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLayout = btn.dataset.layout;
    chartsGrid.className = 'charts-grid layout-' + currentLayout;
    setTimeout(() => panels.forEach(p => {
      if (!p.chart) return;
      const r = p.dom.querySelector('.chart-container').getBoundingClientRect();
      if (r.width > 0 && r.height > 0) p.chart.applyOptions({ width: r.width, height: r.height });
    }), 50);
  });

  /* Tool bar */
  toolBar.addEventListener('click', e => {
    const btn = e.target.closest('button[data-tool]');
    if (!btn) return;
    toolBar.querySelectorAll('button[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
    // Toggle crosshair cursor
    panels.forEach(p => {
      if (activeTool === 'pointer') p.dom.classList.remove('drawing-mode');
      else p.dom.classList.add('drawing-mode');
    });
    // Cancel pending clicks
    panels.forEach(p => { p.drawing.pendingClick = null; });
  });

  clearDrawingsBtn.addEventListener('click', () => {
    panels.forEach(p => {
      // Remove trend lines
      p.drawing.trendLines.forEach(s => { try { p.chart.removeSeries(s); } catch(e){} });
      // Remove rboxes (primitives on candleSeries)
      p.drawing.rBoxes.forEach(rb => { try { p.candleSeries.detachPrimitive(rb); } catch(e){} });
      p.drawing.trendLines = [];
      p.drawing.rBoxes = [];
    });
  });

  /* ── Indicator settings modal ── */
  function renderIndicatorModal() {
    indicatorRows.innerHTML = '';
    for (const ind of indicatorSettings) {
      const row = document.createElement('div');
      row.className = 'ind-row';
      row.innerHTML = `
        <input type="checkbox" data-key="${ind.key}" ${ind.visible ? 'checked' : ''} />
        <label>${ind.label}</label>
        <input type="color" data-key="${ind.key}" value="${ind.color}" title="Color" />
        <select data-key="${ind.key}" title="Style">
          <option value="0" ${ind.lineStyle===0?'selected':''}>Solid</option>
          <option value="1" ${ind.lineStyle===1?'selected':''}>Dotted</option>
          <option value="2" ${ind.lineStyle===2?'selected':''}>Dashed</option>
          <option value="3" ${ind.lineStyle===3?'selected':''}>Lg Dash</option>
        </select>
        <input type="number" data-key="${ind.key}" value="${ind.lineWidth}" min="0.5" max="5" step="0.5" title="Width" />
      `;
      indicatorRows.appendChild(row);
    }
  }

  indicatorBtn.addEventListener('click', () => {
    renderIndicatorModal();
    indicatorModal.classList.remove('hidden');
  });
  modalClose.addEventListener('click', () => indicatorModal.classList.add('hidden'));
  indicatorModal.addEventListener('click', e => { if (e.target === indicatorModal) indicatorModal.classList.add('hidden'); });

  modalApply.addEventListener('click', () => {
    // Read values from modal
    for (const ind of indicatorSettings) {
      const cb = indicatorRows.querySelector(`input[type="checkbox"][data-key="${ind.key}"]`);
      const color = indicatorRows.querySelector(`input[type="color"][data-key="${ind.key}"]`);
      const style = indicatorRows.querySelector(`select[data-key="${ind.key}"]`);
      const width = indicatorRows.querySelector(`input[type="number"][data-key="${ind.key}"]`);
      if (cb) ind.visible = cb.checked;
      if (color) ind.color = color.value;
      if (style) ind.lineStyle = parseInt(style.value, 10);
      if (width) ind.lineWidth = parseFloat(width.value);
    }
    indicatorModal.classList.add('hidden');
    // Reload all charts with new settings
    const ticker = globalTicker.value.trim().toUpperCase();
    const date = globalDate.value;
    if (ticker && date) panels.forEach(p => loadChart(p, ticker, date));
  });

  /* ── Init ── */
  createPanel();
})();
