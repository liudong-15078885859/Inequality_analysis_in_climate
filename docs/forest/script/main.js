document.addEventListener('DOMContentLoaded', ()=>{
  const loadMapBtn = document.getElementById('load-map');
  const mapYearRange = document.getElementById('map-year-range');
  const mapYearLabel = document.getElementById('map-year-label');
  const rankingYearRange = document.getElementById('ranking-year-range');
  const rankingYearLabel = document.getElementById('ranking-year-label');
  const chart4WindowRange = document.getElementById('chart4-window-range');
  const chart4WindowLabel = document.getElementById('chart4-window-label');
  const rankingWindowRange = document.getElementById('ranking-window-range');
  const rankingWindowLabel = document.getElementById('ranking-window-label');
  const mapEl = document.getElementById('map');
  const chartEl = document.getElementById('chart');
  const note = document.getElementById('insight');

  // --- Tabs: 仅切换面板，保持各面板各自控件独立 ---
  const tabMapBtn = document.getElementById('tab-map');
  const tabChart4Btn = document.getElementById('tab-chart4');
  const tabRankingBtn = document.getElementById('tab-ranking');
  const tabChart5Btn = document.getElementById('tab-chart5');

  function activateTab(name){
    ['map','chart4','ranking','chart5'].forEach(n=>{
      const btn = document.getElementById('tab-'+n);
      const panel = document.getElementById(n + '-panel');
      if(btn) btn.classList.toggle('active', n===name);
      if(btn) btn.setAttribute('aria-selected', n===name ? 'true' : 'false');
      if(panel) panel.classList.toggle('hidden', n!==name);
    });

    // 触发对应面板的渲染（有些图表在切换后需要重绘或调用 invalidateSize）
    setTimeout(()=>{
      if(name === 'map'){
        try{ renderChoropleth(selectedMapYear); }catch(e){}
        try{ if(leafletMap) leafletMap.invalidateSize(); }catch(e){}
      } else if(name === 'chart4'){
        try{ renderChartFour(); }catch(e){}
      } else if(name === 'ranking'){
        try{ if(selectedRankingMode === 'total') renderRankingTotal(); else renderRanking(selectedRankingYear); }catch(e){}
      } else if(name === 'chart5'){
        try{ renderChartFive(); }catch(e){}
      }
    }, 120);
  }

  [tabMapBtn, tabChart4Btn, tabRankingBtn, tabChart5Btn].forEach(btn=>{ if(btn) btn.addEventListener('click', ()=> activateTab(btn.id.replace('tab-',''))); });

  const forestCsvPath = '../dataset/forest-area-as-share-of-land-area/forest-area-as-share-of-land-area.csv';
  const areaCsvPath = '../dataset/forest-area-ha/forest-area-ha.csv';
  const changeCsvPath = '../dataset/annual-change-forest-area/annual-change-forest-area.csv';
  const primaryPlantedCsvPath = '../dataset/forest-area-primary-planted/forest-area-primary-planted.csv';
  const geojsonPath = '../data/countries.geojson';

  let rawData = null;
  let rawAreaData = null;
  let rawChangeData = null;
  let rawPrimaryPlanted = null;
  let worldGeo = null;
  let selectedMapYear = null;
  let selectedRankingYear = null;
  let selectedRankingMode = 'year'; // 'year' | 'total'
  let rankingMinYear = 1990;
  let rankingMaxYear = 2025;
  let rankingTotalSentinel = 2026; // maxYear+1 after data load
  let displayMode = 'percent'; // 'percent' or 'area'
  let leafletMap = null;
  let geojsonLayer = null;
  let legendControl = null;
  let didFitBounds = false;

  function setSlider(sliderEl, labelEl, minY, maxY, valueY, labelText = null){
    if(!sliderEl || !labelEl) return;
    sliderEl.min = minY;
    sliderEl.max = maxY;
    sliderEl.value = valueY;
    labelEl.textContent = (labelText==null ? valueY : labelText);
  }

  function updateRankingLabelAndMode(value){
    const v = +value;
    if(!isNaN(v) && v === rankingTotalSentinel){
      selectedRankingMode = 'total';
      selectedRankingYear = null;
      if(rankingYearLabel) rankingYearLabel.textContent = '总计';
      return;
    }
    selectedRankingMode = 'year';
    selectedRankingYear = Math.max(1990, v);
    if(rankingYearLabel) rankingYearLabel.textContent = selectedRankingYear;
  }

  async function initData(){
    note.textContent = '加载数据与本地 GeoJSON...';
    try{
      const [d,a,c,p,w] = await Promise.all([
        window.dataLoader.loadCSV(forestCsvPath),
        window.dataLoader.loadCSV(areaCsvPath),
        window.dataLoader.loadCSV(changeCsvPath),
        window.dataLoader.loadCSV(primaryPlantedCsvPath),
        d3.json(geojsonPath)
      ]);
      rawData = d;
      rawAreaData = a;
      rawChangeData = c;
      rawPrimaryPlanted = p;
      worldGeo = w;

      // map years (percent + area)
      const mapYearsSet = new Set();
      d.forEach(r=>mapYearsSet.add(+r.Year));
      a.forEach(r=>mapYearsSet.add(+r.Year));
      const mapYears = Array.from(mapYearsSet).filter(y=>!isNaN(y)).sort((m1,m2)=>m1-m2);
      const mapDataMin = mapYears.length ? mapYears[0] : 1990;
      const mapDataMax = mapYears.length ? mapYears[mapYears.length-1] : 2025;
      const mapMinY = Math.max(1990, mapDataMin);
      const mapMaxY = mapDataMax;
      selectedMapYear = +mapYearRange?.value || mapMaxY;
      if(isNaN(selectedMapYear) || selectedMapYear<mapMinY || selectedMapYear>mapMaxY) selectedMapYear = mapMaxY;
      setSlider(mapYearRange, mapYearLabel, mapMinY, mapMaxY, selectedMapYear);

      // ranking years (annual-change)
      const rankYearsSet = new Set();
      c.forEach(r=>rankYearsSet.add(+r.Year));
      const rankYears = Array.from(rankYearsSet).filter(y=>!isNaN(y)).sort((r1,r2)=>r1-r2);
      const rankDataMin = rankYears.length ? rankYears[0] : 1990;
      const rankDataMax = rankYears.length ? rankYears[rankYears.length-1] : 2025;
      const rankMinY = Math.max(1990, rankDataMin);
      const rankMaxY = rankDataMax;
      rankingMinYear = rankMinY;
      rankingMaxYear = rankMaxY;
      rankingTotalSentinel = rankMaxY + 1;

      // slider rightmost becomes "总计"
      const currentRankValue = +rankingYearRange?.value;
      const desired = (!isNaN(currentRankValue) ? currentRankValue : rankingTotalSentinel);
      const clamped = Math.min(Math.max(desired, rankMinY), rankingTotalSentinel);
      setSlider(
        rankingYearRange,
        rankingYearLabel,
        rankMinY,
        rankingTotalSentinel,
        clamped,
        (clamped === rankingTotalSentinel) ? '总计' : clamped
      );
      updateRankingLabelAndMode(clamped);

      // 初始化 Leaflet 地图（若尚未创建）
      if(!leafletMap){
        leafletMap = L.map('map', {
          zoomControl: true,
          minZoom: 1.5,
          maxZoom: 8,
          // increase wheelPxPerZoomLevel to reduce scroll-wheel sensitivity
          wheelPxPerZoomLevel: 240,
          // allow finer zoom steps
          zoomDelta: 0.5,
          zoomSnap: 0.5
        }).setView([20,0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(leafletMap);
        // ensure Leaflet recalculates size after CSS/layout changes
        setTimeout(()=>{ try{ leafletMap.invalidateSize(); }catch(e){} }, 150);
      }

      note.textContent = `数据已加载：${d.length} 行（%），${a.length} 行（ha），${c.length} 行（annual-change）`;
      renderChoropleth(selectedMapYear);
      // 初始化图表四年份滑块
      try{
        const yearsSet = new Set();
        (rawPrimaryPlanted||[]).forEach(r=>yearsSet.add(+r.Year));
        const years = Array.from(yearsSet).filter(y=>!isNaN(y)).sort((x,y)=>x-y);
        const minY = Math.max(1990, years[0]||1990);
        const maxY = years[years.length-1]||2025;
        const chart4YearRange = document.getElementById('chart4-year-range');
        const chart4YearLabel = document.getElementById('chart4-year-label');
        if(chart4YearRange && chart4YearLabel){
          chart4YearRange.min = minY; chart4YearRange.max = maxY; chart4YearRange.value = maxY; chart4YearLabel.textContent = maxY;
        }
      }catch(e){}
      renderChartFour();
      if(selectedRankingMode === 'total'){
        renderRankingTotal();
      } else {
        renderRanking(selectedRankingYear);
      }
      // 自动渲染图表五一次，页面打开时可看到矩阵视图
      try{ renderChartFive(); }catch(e){ /* ignore if not ready */ }
    }catch(e){
      console.error(e);
      note.textContent = '加载失败：请检查静态服务器与文件路径。';
    }
  }

  // 在页面加载时预读 CSV，只获取年份范围以设置滑块
  async function preloadYears(){
    try{
      const [d,a,c] = await Promise.all([
        window.dataLoader.loadCSV(forestCsvPath),
        window.dataLoader.loadCSV(areaCsvPath),
        window.dataLoader.loadCSV(changeCsvPath)
      ]);

      const mapYearsSet = new Set();
      d.forEach(r=>mapYearsSet.add(+r.Year));
      a.forEach(r=>mapYearsSet.add(+r.Year));
      const mapYears = Array.from(mapYearsSet).filter(y=>!isNaN(y)).sort((m1,m2)=>m1-m2);
      const mapMinY = Math.max(1990, mapYears[0] || +mapYearRange?.min || 1990);
      const mapMaxY = mapYears[mapYears.length-1] || +mapYearRange?.max || 2025;
      setSlider(mapYearRange, mapYearLabel, mapMinY, mapMaxY, mapMaxY);

      const rankYearsSet = new Set();
      c.forEach(r=>rankYearsSet.add(+r.Year));
      const rankYears = Array.from(rankYearsSet).filter(y=>!isNaN(y)).sort((r1,r2)=>r1-r2);
      const rankMinY = Math.max(1990, rankYears[0] || +rankingYearRange?.min || 1990);
      const rankMaxY = rankYears[rankYears.length-1] || +rankingYearRange?.max || 2025;
      rankingMinYear = rankMinY;
      rankingMaxYear = rankMaxY;
      rankingTotalSentinel = rankMaxY + 1;
      setSlider(rankingYearRange, rankingYearLabel, rankMinY, rankingTotalSentinel, rankingTotalSentinel, '总计');
    }catch(e){
      // 预读失败时保持原有默认值
      console.warn('预读年份失败：', e);
    }
  }

  loadMapBtn.addEventListener('click', ()=>{
    // allow manual refresh even after auto-load
    initData();
  });

  // 立即预读年份以便滑动条范围反映数据，并自动加载地图
  preloadYears().then(()=>{ initData(); }).catch(e=>{ console.warn('预读或自动加载出错：', e); initData(); });

  mapYearRange?.addEventListener('input', ()=>{
    selectedMapYear = Math.max(1990, +mapYearRange.value);
    if(mapYearLabel) mapYearLabel.textContent = selectedMapYear;
    if(rawData && worldGeo) renderChoropleth(selectedMapYear);
  });

  rankingYearRange?.addEventListener('input', ()=>{
    updateRankingLabelAndMode(rankingYearRange.value);
    if(!rawChangeData) return;
    if(selectedRankingMode === 'total'){
      renderRankingTotal();
    } else {
      renderRanking(selectedRankingYear);
    }
  });

  // 使用鼠标滚轮控制 chart4 和 ranking 的分页：chart4Offset、rankingStart 为内部状态
  let chart4Offset = 0; // 起始索引
  let rankingStartVal = 0;

  /** 图5 chart4 / 图6 ranking：每页固定显示的条目数（排名图为左右成对的一行） */
  const FIXED_ROWS_CHART4 = 14;
  const FIXED_ROWS_RANKING = 16;

  function updateWindowSlider(sliderEl, labelEl, totalLen, pageSize, startIdx){
    if(!sliderEl || !labelEl){
      return;
    }
    const total = Math.max(0, totalLen || 0);
    const page = Math.max(1, pageSize || 1);
    const maxStart = Math.max(0, total - page);
    const start = Math.max(0, Math.min(startIdx || 0, maxStart));

    sliderEl.min = 0;
    sliderEl.max = maxStart;
    sliderEl.step = 1;
    sliderEl.value = start;
    sliderEl.disabled = (maxStart <= 0);

    if(total <= 0){
      labelEl.textContent = '—';
      return;
    }
    const from = start + 1;
    const to = Math.min(total, start + page);
    labelEl.textContent = `${from}–${to} / ${total}`;
  }

  // wheel handler helper: 调整一个整数 state 并触发渲染
  function wheelAdjust(delta, step, current, min, max){
    const dir = delta > 0 ? 1 : -1;
    const next = Math.max(min, Math.min(max, current + dir * step));
    return next;
  }

  // display mode control
  const displaySelect = document.getElementById('display-mode');
  if(displaySelect){
    displaySelect.addEventListener('change', ()=>{
      displayMode = displaySelect.value || 'percent';
      // if raw data isn't loaded yet, initData will load both; otherwise just re-render
      if(!rawData || !rawAreaData || !worldGeo) {
        initData();
      } else {
        renderChoropleth(selectedMapYear);
      }
    });
  }

  // --- Chart 4 controls and render ---
  const chart4YearRange = document.getElementById('chart4-year-range');
  const chart4YearLabel = document.getElementById('chart4-year-label');
  const chart4TopN = document.getElementById('chart4-topn');
  const chart4Mode = document.getElementById('chart4-mode');
  const chart4Sort = document.getElementById('chart4-sort');
  const chart4Search = document.getElementById('chart4-search');
  const chart4Export = document.getElementById('chart4-export');

  if(chart4YearRange){
    chart4YearRange.addEventListener('input', ()=>{
      const y = +chart4YearRange.value;
      if(chart4YearLabel) chart4YearLabel.textContent = y;
      renderChartFour();
    });
  }
  [chart4TopN, chart4Mode, chart4Sort].forEach(el=>{ if(el) el.addEventListener('change', ()=> renderChartFour()); });
  if(chart4Search) chart4Search.addEventListener('input', ()=> renderChartFour());
  if(chart4Export) chart4Export.addEventListener('click', ()=> exportChart4CSV());

  // prepare container for chart4 tooltip
  function chart4Tooltip(){ d3.selectAll('.chart4-tooltip').remove(); return d3.select('body').append('div').attr('class','chart4-tooltip'); }

  function renderChartFour(){
    const container = d3.select('#chart4');
    container.html('');
    if(!rawPrimaryPlanted || !rawPrimaryPlanted.length) {
      container.append('div').text('数据未就绪或无数据'); return;
    }
    const year = chart4YearRange ? +chart4YearRange.value : (new Date()).getFullYear();
    const topN = chart4TopN ? +chart4TopN.value : 15;
    const mode = chart4Mode ? chart4Mode.value : 'stacked';
    const sortBy = chart4Sort ? chart4Sort.value : 'total';
    const searchTerm = chart4Search ? (chart4Search.value||'').trim().toLowerCase() : '';

    // aggregate per country for selected year
    const rows = (rawPrimaryPlanted||[])
      .filter(r=>+r.Year === year && r.Code && r.Code.length===3)
      .map(r=>({code:r.Code, name:r.Entity, planted:+r['Planted forest']||0, natural:+r['Naturally regenerating and primary forest']||0}));
    if(!rows.length){ container.append('div').text('该年份无国家层面数据'); return; }

    // compute totals
    rows.forEach(d=> d.total = (d.planted||0)+(d.natural||0));
    // filter by search
    let filtered = rows.filter(d=>{
      if(!searchTerm) return true;
      return (d.code && d.code.toLowerCase().includes(searchTerm)) || (d.name && d.name.toLowerCase().includes(searchTerm));
    });
    // sort
    filtered.sort((a,b)=>{
      if(sortBy==='natural') return b.natural - a.natural;
      if(sortBy==='planted') return b.planted - a.planted;
      return b.total - a.total;
    });
    // expose filtered length for wheel handler and clamp offsets
    try{ window.__chart4_filtered_length__ = filtered.length; }catch(e){}
    // 分页：每页固定 FIXED_ROWS_CHART4 行（数据不足时略少）
    const margin = {top:28,right:20,bottom:48,left:152};
    const cw = document.querySelector('#chart4')?.clientWidth || 900;
    const width = Math.max(80, cw - margin.left - margin.right);
    const rowH = 28;
    const perRowSpace = rowH + 8;
    const perPage = Math.min(FIXED_ROWS_CHART4, filtered.length);

    // 使用全局 chart4Offset 进行分页
    chart4Offset = Math.max(0, Math.min(chart4Offset || 0, Math.max(0, filtered.length - perPage)));
    const page = filtered.slice(chart4Offset, chart4Offset + perPage);

    // 更新“窗口位置”滑动条（指示当前窗口在全部数据中的位置）
    updateWindowSlider(chart4WindowRange, chart4WindowLabel, filtered.length, perPage, chart4Offset);

    // build scales and svg（高度按实际行数 × 行距）
    const height = Math.max(perRowSpace * page.length, page.length ? perRowSpace : 0);
    const svg = container.append('svg').attr('width','100%').attr('height', Math.max(320, height + margin.top + margin.bottom));
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xMax = d3.max(page, d=> (mode==='percent' ? 1 : d.total));
    const x = d3.scaleLinear().domain([0, xMax]).range([0, width]);
    const y = d3.scaleBand().domain(page.map(d=>d.code)).range([0, height]).padding(0.18);

    // axes
    const xAxis = d3.axisBottom(x).ticks(6).tickFormat(mode==='percent'? d3.format('.0%') : d3.format('~s'));
    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis).attr('class','axis');

    // left labels
    const labels = svg.append('g').attr('transform', `translate(${margin.left-12},${margin.top})`);
    labels.selectAll('text').data(page).join('text').attr('x',0).attr('y', (d,i)=> y(d.code)+y.bandwidth()/2 ).attr('dy','0.35em').attr('text-anchor','end').attr('class','label').text(d=>d.name+' ('+d.code+')').style('font-size','13px');

    // bars
    const row = g.selectAll('.r').data(page, d=>d.code).join('g').attr('class','r').attr('transform', d=>`translate(0,${y(d.code)})`);

    // compute segments
    row.each(function(d){
      const segs = [ {key:'natural', v:(mode==='percent' ? (d.total? d.natural/d.total : 0) : d.natural)}, {key:'planted', v:(mode==='percent' ? (d.total? d.planted/d.total : 0) : d.planted)} ];
      let acc = 0;
      const that = d3.select(this);
      segs.forEach(s=>{
        const w = Math.max(1, x(acc + s.v) - x(acc));
        that.append('rect').attr('x', x(acc)).attr('y', 0).attr('width', w).attr('height', y.bandwidth()).attr('fill', s.key==='natural' ? '#145214' : '#7fc97f').attr('data-key', s.key);
        acc += s.v;
      });
      // make entire row focusable for keyboard
      that.attr('tabindex',0).on('keydown', (event)=>{
        if(event.key === 'Enter' || event.key === ' '){ showChart4Detail(d); event.preventDefault(); }
      }).on('click', ()=> showChart4Detail(d)).on('mouseenter', (ev)=>{
        const tt = chart4Tooltip();
        tt.style('left', (ev.pageX+12)+'px').style('top', (ev.pageY+12)+'px');
        tt.html(`<div style="font-weight:700">${d.name} (${d.code})</div><div>天然林：${d3.format(',')(d.natural)} ha</div><div>人工林：${d3.format(',')(d.planted)} ha</div><div style="color:#666;margin-top:6px">总计：${d3.format(',')(d.total)} ha</div>`);
      }).on('mousemove', (ev)=> d3.selectAll('.chart4-tooltip').style('left', (ev.pageX+12)+'px').style('top', (ev.pageY+12)+'px')).on('mouseleave', ()=> d3.selectAll('.chart4-tooltip').remove());
    });

    // legend
    const legend = container.append('div').attr('class','legend').style('margin-top','8px');
    const legItems = [{k:'natural',label:'天然再生/原生林',color:'#145214'},{k:'planted',label:'人工再生林',color:'#7fc97f'}];
    const leg = legend.selectAll('.item').data(legItems).join('div').attr('class','item').style('display','inline-flex').style('align-items','center').style('gap','8px');
    leg.append('div').attr('class','sw').style('background',d=>d.color).style('width','18px').style('height','12px').style('border-radius','3px');
    leg.append('div').text(d=>d.label).style('font-size','13px');

    // small helper: clicking a label could toggle highlighting (placeholder)
    leg.on('click', (event,d)=>{
      // toggle state stored on legend item; visual toggling can be implemented later
      d.active = !d.active;
    });

    function showChart4Detail(d){
      // on click: open a small modal-like tooltip with sparkline of historical series
      d3.selectAll('.chart4-tooltip').remove();
      const tt = chart4Tooltip();
      tt.style('left', '60px').style('top', (margin.top+40)+'px');
      const rows = (rawPrimaryPlanted||[]).filter(r=>r.Code===d.code).map(r=>({y:+r.Year, planted:+r['Planted forest']||0, natural:+r['Naturally regenerating and primary forest']||0})).sort((a,b)=>a.y-b.y);
      const totalSer = rows.map(r=>({y:r.y, v:r.planted + r.natural}));
      tt.html(`<div style="font-weight:700;margin-bottom:6px">${d.name} (${d.code}) — 历史（最近 ${Math.min(40, rows.length)} 年）</div><div id="chart4-spark"></div>`);
      if(rows.length){
        const w=420,h=140,pad=28;
        const xS = d3.scaleLinear().domain(d3.extent(rows,d=>d.y)).range([pad,w-pad]);
        const yS = d3.scaleLinear().domain([d3.min(totalSer,d=>d.v), d3.max(totalSer,d=>d.v)]).range([h-pad,pad]);
        const line = d3.line().x(d=>xS(d.y)).y(d=>yS(d.v));
        const svgS = d3.select('#chart4-spark').append('svg').attr('width',w).attr('height',h);
        svgS.append('path').datum(totalSer).attr('d', line).attr('fill','none').attr('stroke','#2b8c2b').attr('stroke-width',2);
      }
    }

    // export helper closure: store lastTop for CSV export
    renderChartFour._lastTop = page;

    // 确保容器可滚动：保留原生滚动条，同时在渲染后把容器滚回顶部
    try{ const area = document.getElementById('chart4-area'); if(area) area.scrollTop = 0; }catch(e){}
  }

  if(chart4WindowRange){
    chart4WindowRange.addEventListener('input', ()=>{
      chart4Offset = Math.max(0, +chart4WindowRange.value || 0);
      renderChartFour();
    });
  }

  function exportChart4CSV(){
    const rows = (renderChartFour._lastTop || []).map(d=>({Entity:d.name, Code:d.code, Year:(document.getElementById('chart4-year-range')?.value||''), Planted:d.planted, Natural:d.natural, Total:d.total}));
    if(!rows.length) return alert('无可导出数据');
    const csv = d3.csvFormat(rows);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `chart4_forest_${(document.getElementById('chart4-year-range')?.value||'')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // --- Chart 5: bubble matrix (forest coverage vs change rate) ---
  const chart5YearRange = document.getElementById('chart5-year-range');
  const chart5YearLabel = document.getElementById('chart5-year-label');
  const chart5SizeMode = document.getElementById('chart5-size-mode');
  const chart5Scale = document.getElementById('chart5-scale');
  const chart5ScaleLabel = document.getElementById('chart5-scale-label');
  const chart5Reset = document.getElementById('chart5-reset');
  const chart5ZoomIn = document.getElementById('chart5-zoom-in');
  const chart5ZoomOut = document.getElementById('chart5-zoom-out');
  const chart5ZoomLevel = document.getElementById('chart5-zoom-level');

  // hold references to current svg + zoom behavior so external controls can act on them
  let _chart5Svg = null;
  let _chart5Zoom = null;

  if(chart5YearRange){
    chart5YearRange.addEventListener('input', ()=>{
      const y = +chart5YearRange.value;
      if(chart5YearLabel) chart5YearLabel.textContent = y;
      renderChartFive();
    });
  }
  if(chart5SizeMode) chart5SizeMode.addEventListener('change', ()=> renderChartFive());
  if(chart5Scale) chart5Scale.addEventListener('input', ()=>{ chart5ScaleLabel.textContent = (+chart5Scale.value).toFixed(1)+'x'; renderChartFive(); });
  if(chart5Reset) chart5Reset.addEventListener('click', ()=>{ if(leafletMap && geojsonLayer) { leafletMap.setView([20,0],2); } renderChartFive(); });

  if(chart5ZoomIn) chart5ZoomIn.addEventListener('click', ()=>{
    if(_chart5Svg && _chart5Zoom){ _chart5Svg.transition().call(_chart5Zoom.scaleBy, 1.2); }
  });
  if(chart5ZoomOut) chart5ZoomOut.addEventListener('click', ()=>{
    if(_chart5Svg && _chart5Zoom){ _chart5Svg.transition().call(_chart5Zoom.scaleBy, 1/1.2); }
  });

  function getFeatureCentroids(){
    const map = new Map();
    try{
      (worldGeo.features||[]).forEach(f=>{
        const iso = getFeatureISO3(f);
        if(!iso) return;
        try{
          const c = d3.geoCentroid(f);
          map.set(iso, c);
        }catch(e){}
      });
    }catch(e){}
    return map;
  }

  function renderChartFive(){
    const container = d3.select('#chart5');
    container.html('');
    if(!rawData || !rawAreaData || !rawChangeData || !worldGeo) { container.append('div').text('等待数据加载...'); return; }
    const year = chart5YearRange ? +chart5YearRange.value : selectedMapYear || 2020;
    const sizeMode = chart5SizeMode ? chart5SizeMode.value : 'area';
    const scale = chart5Scale ? +chart5Scale.value : 1;

    // join datasets by Code for the chosen year
    const shareRows = (rawData||[]).filter(r=>+r.Year===year && r.Code && r.Code.length===3).map(r=>({code:r.Code, name: r.Entity, share:+r['Share of land covered by forest']}));
    const areaRows = (rawAreaData||[]).filter(r=>+r.Year===year && r.Code && r.Code.length===3).map(r=>({code:r.Code, name: r.Entity, area:+r['Forest area']||0}));
    const changeRows = (rawChangeData||[]).filter(r=>+r.Year===year && r.Code && r.Code.length===3).map(r=>({code:r.Code, name: r.Entity, change:+r['Annual change in forest area']||0}));

    const byCode = new Map();
    shareRows.forEach(r=> byCode.set(r.code, Object.assign(byCode.get(r.code)||{}, {code:r.code, share:r.share, name: r.name || byCode.get(r.code)?.name}))); 
    areaRows.forEach(r=> byCode.set(r.code, Object.assign(byCode.get(r.code)||{}, {code:r.code, area:r.area, name: r.name || byCode.get(r.code)?.name}))); 
    changeRows.forEach(r=> byCode.set(r.code, Object.assign(byCode.get(r.code)||{}, {code:r.code, change:r.change, name: r.name || byCode.get(r.code)?.name}))); 

    const centroidMap = getFeatureCentroids();

    const rows = Array.from(byCode.values()).map(d=>{
      const area = d.area || 0;
      const change = d.change || 0;
      const share = (typeof d.share === 'number') ? d.share : null;
      const rate = (area>0) ? (change / area) : null; // proportion per year
      const centroid = centroidMap.get(d.code) || null;
      const lat = centroid ? centroid[1] : null;
      const region = (lat==null) ? 'Other' : (Math.abs(lat) <= 23.5 ? 'Tropical' : (lat>23.5 ? 'Northern' : 'Southern'));
      return { code: d.code, name: d.name || d.code, share, area, change, rate, region };
    }).filter(d=> d.share!=null && d.rate!=null && !isNaN(d.rate) && d.area>0);

    if(!rows.length){ container.append('div').text('该年份无足够数据用于矩阵'); return; }

    function paddedDomain(vals, padRatio, padFloor, clampLo, clampHi){
      let lo = d3.min(vals);
      let hi = d3.max(vals);
      if(!isFinite(lo) || !isFinite(hi)) return [0, 1];
      if(lo === hi){
        const eps = (Math.abs(lo) || 1) * 1e-6;
        lo -= eps;
        hi += eps;
      }
      const span = hi - lo;
      const pad = Math.max(span * padRatio, padFloor || span * 0.05);
      lo -= pad;
      hi += pad;
      if(clampLo != null) lo = Math.max(clampLo, lo);
      if(clampHi != null) hi = Math.min(clampHi, hi);
      if(hi <= lo){
        const m = (lo + hi) / 2;
        lo = m - 1;
        hi = m + 1;
      }
      return [lo, hi];
    }

    // scales & layout：按面板剩余高度计算绘图区，保证 SVG+轴+图例行落在 #chart5-area / iframe 内
    const margin = {top:30,right:14,bottom:62,left:52};
    const LEGEND_BELOW_SVG = 38;
    const chart5Root = document.querySelector('#chart5');
    const chart5AreaEl = document.getElementById('chart5-area');
    const chart5Panel = document.getElementById('chart5-panel');
    const chart5Ctrl = document.getElementById('chart5-controls');
    const w = Math.max(240, chart5Root?.clientWidth || 900);
    const width = w - margin.left - margin.right;

    const xs = rows.map(d=>d.share);
    const ys = rows.map(d=>d.rate);
    let [x0, x1] = paddedDomain(xs, 0.07, 2.5, 0, 100);
    let [y0, y1] = paddedDomain(ys, 0.1, 0.004, null, null);

    const axisFrame = margin.top + margin.bottom;
    let height;
    if(chart5AreaEl && chart5AreaEl.clientHeight > axisFrame + LEGEND_BELOW_SVG + 80){
      height = chart5AreaEl.clientHeight - axisFrame - LEGEND_BELOW_SVG;
    } else if(chart5Panel && chart5Panel.offsetParent && chart5Panel.clientHeight > 100){
      const areaTop = chart5AreaEl ? chart5AreaEl.offsetTop - chart5Panel.offsetTop : 0;
      const slot = chart5Panel.clientHeight - (chart5Ctrl?.offsetHeight || 52) - 12 - areaTop;
      height = slot - axisFrame - LEGEND_BELOW_SVG;
    } else {
      height = Math.min(340, Math.max(200, Math.round(width * 0.46)));
    }
    height = Math.max(160, Math.min(height, 440));

    const svgTotalH = margin.top + height + margin.bottom;
    const svg = container.append('svg').attr('width','100%').attr('height', svgTotalH);
    // outer with margin transform, and inner zoomable group
    const outer = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    /** clip 必须包在「无 zoom 变换」的父组上，否则裁剪框会跟内容一起平移，拖拽时会在轴框边露出虚线端点 */
    const plotClipId = 'chart5-plot-clip';
    outer.append('defs').append('clipPath').attr('id', plotClipId).append('rect')
      .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height);
    const plotClipWrap = outer.append('g').attr('class', 'chart5-plot-clip-wrap')
      .attr('clip-path', `url(#${plotClipId})`);
    const zoomLayer = plotClipWrap.append('g').attr('class', 'zoomLayer');
    const g = zoomLayer; // use g as drawing group

    // create axis groups outside the zoom layer so axes stay fixed at edges
    const xAxisG = outer.append('g').attr('class','x axis').attr('transform', `translate(0,${height})`);
    const yAxisG = outer.append('g').attr('class','y axis');

    const x = d3.scaleLinear().domain([x0, x1]).range([0, width]).nice();
    // 纵轴不要用 .nice()：会把上限从约 4% 抬到 5% 等“整齐刻度”，造成顶部无数据的空白带
    const y = d3.scaleLinear().domain([y0, y1]).range([height, 0]);
    /** 竖线：森林覆盖率 50%；横线：年变化率 0（与轴刻度一致，均在 zoomLayer 内用基准 x/y） */
    const xGuideData = 50;
    const yGuideData = 0;

    // setup zoom behavior and expose to outer controls; axes will be updated via rescaled scales
    const zoom = d3.zoom().scaleExtent([0.3, 8]).translateExtent([[-1000,-1000],[width+1000,height+1000]]).on('zoom', (event)=>{
      zoomLayer.attr('transform', event.transform);
      if(chart5ZoomLevel) chart5ZoomLevel.textContent = (event.transform.k).toFixed(2) + 'x';
      // rescale axes to reflect current transform while keeping axes at fixed positions
      try{
        const newX = event.transform.rescaleX(x);
        const newY = event.transform.rescaleY(y);
        // helper: generate unique tick values with sensible precision to avoid duplicate labels
        function uniqueTicksAndFormat(scale, tickCount=6){
          const dom = scale.domain();
          const span = Math.abs(dom[1] - dom[0]) || 1;
          let precision = 0;
          if(span < 0.01) precision = 4;
          else if(span < 0.1) precision = 3;
          else if(span < 1) precision = 2;
          else if(span < 10) precision = 1;
          else precision = 0;
          const fmt = d3.format(`.${precision}f`);
          const ticks = (scale.ticks ? scale.ticks(tickCount) : []);
          const seen = new Set();
          const uniq = [];
          ticks.forEach(t=>{
            const s = fmt(t);
            if(!seen.has(s)){ seen.add(s); uniq.push(+s); }
          });
          return { ticks: uniq, precision };
        }

        // X axis: numeric, use decimal formatting
        const xInfo = uniqueTicksAndFormat(newX, 6);
        const xFmt = d3.format(`.${xInfo.precision}f`);
        const xTicks = (xInfo.ticks || []).filter(t=> typeof t === 'number' && isFinite(t));
        xAxisG.call(d3.axisBottom(newX).tickValues(xTicks).tickFormat(xFmt));

        // Y axis: proportion domain → 百分号（过滤无效刻度避免 NaN%）
        const yInfo = uniqueTicksAndFormat(newY, 6);
        const yTicks = (yInfo.ticks || []).filter(t=> typeof t === 'number' && isFinite(t));
        const yFmt = v => (isFinite(v) ? d3.format(`.${Math.max(0,yInfo.precision)}f`)(v * 100) + '%' : '');
        yAxisG.call(d3.axisLeft(newY).tickValues(yTicks).tickFormat(yFmt));

        // 参考线在 zoomLayer 内：仅用基准 x/y；勿用 newX/newY 更新线位置（坐标系不一致）。
      }catch(e){ /* ignore rescale errors */ }
    });
    svg.call(zoom).on('dblclick.zoom', null);
    _chart5Svg = svg;
    _chart5Zoom = zoom;

    // initial axes (axes groups are outside zoomLayer)
    xAxisG.call(d3.axisBottom(x).ticks(6));
    yAxisG.call(d3.axisLeft(y).tickFormat(d3.format('.0%')));

    const maxArea = d3.max(rows, d=>d.area) || 1;
    const rMax = Math.max(12, 36 * scale); // cap maximum radius
    const rScale = sizeMode==='sqrt' ? d3.scaleSqrt().domain([0,maxArea]).range([3,rMax]) : d3.scaleLinear().domain([0,maxArea]).range([3,rMax]);

    // axes are rendered in outer fixed groups (xAxisG / yAxisG) to avoid duplication
    // axis labels
    svg.append('text').attr('x', margin.left + width/2).attr('y', margin.top + height + 36).attr('text-anchor','middle').text('森林覆盖率 (%)');
    svg.append('text').attr('transform', `translate(14,${margin.top + height/2}) rotate(-90)`).attr('text-anchor','middle').text('年变化率（%）');

    // 线段在 zoom 局部坐标中尽量加长，由外层 plotClipWrap 裁到固定绘图矩形（与坐标轴围成的区域一致）
    const guideStroke = '#5a6169';
    const spanX = width * 200;
    const spanY = height * 200;
    const xv = x(xGuideData);
    const yh = y(yGuideData);
    const guidesG = g.append('g').attr('class', 'chart5-guides').style('pointer-events', 'none');
    guidesG.append('line')
      .attr('x1', xv).attr('x2', xv)
      .attr('y1', -spanY).attr('y2', spanY)
      .attr('stroke', guideStroke).attr('stroke-width', 1.25).attr('stroke-dasharray', '5,4')
      .attr('stroke-linecap', 'butt');
    guidesG.append('line')
      .attr('x1', -spanX).attr('x2', spanX)
      .attr('y1', yh).attr('y2', yh)
      .attr('stroke', guideStroke).attr('stroke-width', 1.25).attr('stroke-dasharray', '5,4')
      .attr('stroke-linecap', 'butt');

    // color by region
    const regionColors = { 'Tropical':'#2b8c2b', 'Northern':'#1f77b4', 'Southern':'#ff7f0e', 'Other':'#6a6a6a' };

    // prepare nodes and run a force simulation constrained to x/y anchors to reduce overlap
    const nodes = rows.map(d=> Object.assign({}, d));
    const simulation = d3.forceSimulation(nodes)
      .stop()
      .force('x', d3.forceX(d=> x(d.share)).strength(0.9))
      .force('y', d3.forceY(d=> y(d.rate)).strength(0.9))
      .force('collide', d3.forceCollide(d=> (rScale(d.area) || 3) + 4 ).iterations(2));

    // run simulation for a fixed number of iterations to stabilize positions
    for(let i=0;i<160;i++) simulation.tick();

    // draw bubbles using simulated positions
    const bubbles = g.selectAll('circle').data(nodes, d=>d.code).join('circle')
      .attr('cx', d=> d.x)
      .attr('cy', d=> d.y)
      .attr('r', d=> Math.max(2, rScale(d.area)))
      .attr('fill', d=> regionColors[d.region]||regionColors['Other'])
      .attr('fill-opacity',0.75)
      .attr('stroke','#222').attr('stroke-opacity',0.08).attr('class','bubble');

    // labels for top bubbles by area (placed with simulated coords)
    const topBubbles = nodes.sort((a,b)=>b.area - a.area).slice(0,12);
    // only render labels if bubble is large enough or current zoom is high enough
    const currentTransform = (typeof d3.zoomTransform === 'function' && _chart5Svg && _chart5Svg.node()) ? d3.zoomTransform(_chart5Svg.node()) : {k:1};
    const currentK = currentTransform.k || 1;
    const labelSizeThreshold = 12; // min radius to show label by default
    const labelVisible = topBubbles.filter(d=> (rScale(d.area) >= labelSizeThreshold) || currentK >= 1.6 );
    g.selectAll('.btext').data(labelVisible).join('text').attr('class','btext').attr('x',d=>d.x).attr('y',d=>d.y).attr('dx',d=> (rScale(d.area)+6) ).attr('dy','0.35em').text(d=>d.name ? d.name : d.code).style('font-size','11px').style('pointer-events','none');
    // (临时悬浮标签已移除以避免遮挡小点)

    svg.style('cursor', 'default');

    // tooltip on hover and bring to front; enlarge hovered bubble slightly
    bubbles.on('mouseenter', function(event,d){
      d3.selectAll('.chart5-tooltip').remove();
      d3.select(this).raise().transition().duration(120).attr('r', Math.max(6, rScale(d.area)*1.25));
      const tt = d3.select('body').append('div').attr('class','chart5-tooltip');
      const changePct = (d.rate*100).toFixed(3) + '%';
      tt.html(`<div style="font-weight:700">${d.name} (${d.code})</div><div>覆盖率：${d.share}%</div><div>年变化：${d.change ? d3.format(',')(d.change)+' ha' : '无'} （${changePct}）</div><div>总面积：${d3.format(',')(Math.round(d.area))} ha</div>`).style('left',(event.pageX+12)+'px').style('top',(event.pageY+12)+'px');
    }).on('mousemove', (ev)=> d3.selectAll('.chart5-tooltip').style('left',(ev.pageX+12)+'px').style('top',(ev.pageY+12)+'px')).on('mouseleave', function(){ d3.selectAll('.chart5-tooltip').remove(); d3.select(this).transition().duration(120).attr('r', d=> Math.max(2, rScale(d.area))); })
    .on('click', (event,d)=>{
      if(leafletMap && geojsonLayer){
        let targetLayer = null;
        geojsonLayer.eachLayer(l=>{ const iso = getFeatureISO3(l.feature); if(iso === d.code) targetLayer = l; });
        if(targetLayer){ try{ leafletMap.fitBounds(targetLayer.getBounds(), { maxZoom:5 }); targetLayer.openTooltip(); }catch(e){} }
      }
    });

    // legend
    const legend = container.append('div').attr('class','legend').style('margin-top','8px');
    Object.keys(regionColors).forEach(k=>{ const item = legend.append('div').attr('class','item').style('display','inline-flex').style('align-items','center').style('gap','8px'); item.append('div').style('width','18px').style('height','12px').style('background',regionColors[k]).style('border-radius','3px'); item.append('div').text(k).style('font-size','13px'); });

    if(chart5ZoomLevel) chart5ZoomLevel.textContent = '1.00x';
  }


  function getFeatureISO3(feat){
    if(!feat) return null;
    if(feat.id) return feat.id;
    const p = feat.properties || {};
    return p.iso_a3 || p.ISO_A3 || p.iso3 || p.ISO_A3_EH || p['ISO3166-1-Alpha-3'] || p['ADM0_A3'] || p['adm0_a3'] || null;
  }

  function getColor(value, vmin, vmax){
    if(value==null || isNaN(value)) return '#f0f0f0';
    const t = (value - vmin) / ( (vmax - vmin) || 1 );
    return d3.interpolateGreens(Math.max(0, Math.min(1, t)));
  }

  function renderChoropleth(year){
    const y = Math.max(1990, +year);
    // choose dataset based on displayMode
    let rows, valueKey, unitLabel, colorInterp;
    if(displayMode === 'area'){
      rows = (rawAreaData || []).filter(r=>+r.Year === y && r.Code && r.Code.length===3);
      valueKey = 'Forest area';
      unitLabel = 'ha';
      colorInterp = d3.interpolateYlGn;
    } else {
      rows = (rawData || []).filter(r=>+r.Year === y && r.Code && r.Code.length===3);
      valueKey = 'Share of land covered by forest';
      unitLabel = '%';
      colorInterp = d3.interpolateGreens;
    }
    const valueMap = new Map(rows.map(r=>[r.Code, +r[valueKey]]));
    const vals = Array.from(valueMap.values()).filter(v=>!isNaN(v));
    const vmin = d3.min(vals);
    const vmax = d3.max(vals);
    const safeVmin = (vmin==null || isNaN(vmin)) ? 0 : vmin;
    const safeVmax = (vmax==null || isNaN(vmax)) ? (displayMode==='area'? 1 : 50) : vmax;

    // 如果已有 geojsonLayer，则更新样式与 tooltip
    if(geojsonLayer){
      geojsonLayer.eachLayer(layer => {
        const feat = layer.feature;
        const iso = getFeatureISO3(feat);
        const v = iso && valueMap.has(iso) ? valueMap.get(iso) : null;
        layer.setStyle({ fillColor: (v==null? '#f0f0f0' : colorInterp( Math.max(0, Math.min(1, (v - safeVmin)/((safeVmax-safeVmin)||1))) )), weight: 0.6, color: '#999', fillOpacity: v==null?0.5:1 });
        layer.bindTooltip(`<strong>${feat.properties.name || feat.properties.NAME || 'Unknown'}</strong><br/>${v==null? '无数据' : formatValue(v, displayMode)}`);
      });
    }else{
      geojsonLayer = L.geoJSON(worldGeo, {
        style: feature => {
          const iso = getFeatureISO3(feature);
          const v = iso && valueMap.has(iso) ? valueMap.get(iso) : null;
          const fill = (v==null? '#f0f0f0' : colorInterp( Math.max(0, Math.min(1, (v - safeVmin)/((safeVmax-safeVmin)||1))) ));
          return { fillColor: fill, weight: 0.6, color: '#999', fillOpacity: v==null?0.5:1 };
        },
        onEachFeature: function(feature, layer){
          const iso = getFeatureISO3(feature);
          const v = iso && valueMap.has(iso) ? valueMap.get(iso) : null;
          layer.bindTooltip(`<strong>${feature.properties.name || feature.properties.NAME || 'Unknown'}</strong><br/>${v==null? '无数据' : formatValue(v, displayMode)}`);
          // 点击时只打开 tooltip，不改变样式（避免显示黑色边框）
          layer.on('click', ()=>{ layer.openTooltip(); });
        }
      }).addTo(leafletMap);
    }

    // 初次加载时缩放到图层范围；之后滑块变化不改变当前视图/缩放
    if(!didFitBounds && geojsonLayer){
      try{
        const bounds = geojsonLayer.getBounds();
        if(bounds && bounds.isValid && bounds.isValid()){
          leafletMap.fitBounds(bounds, { maxZoom: 5 });
          didFitBounds = true;
        }
      }catch(e){/* ignore */}
    }
    // ensure size & tile positioning correct after styling/layout changes
    setTimeout(()=>{ try{ leafletMap.invalidateSize(); }catch(e){} }, 120);

    // 更新图例
    updateLegend(safeVmin, safeVmax, displayMode);
  }

  function updateLegend(vmin, vmax, mode){
    if(legendControl){ legendControl.remove(); }
    legendControl = L.control({ position: 'bottomleft' });
    legendControl.onAdd = function(map){
      const div = L.DomUtil.create('div', 'info legend');
      let title = '';
      let grad = '';
      if(mode === 'area'){
        title = '森林面积 (ha)';
        grad = `background:linear-gradient(to right, ${d3.interpolateYlGn(0)}, ${d3.interpolateYlGn(1)});`;
      } else {
        title = '森林覆盖率 (%)';
        grad = `background:linear-gradient(to right, ${d3.interpolateGreens(0)}, ${d3.interpolateGreens(1)});`;
      }
      const left = formatValue(vmin, mode);
      const right = formatValue(vmax, mode);
      div.innerHTML = `<div style="background:#fff;padding:6px;border:1px solid #ddd;font-size:12px"><div>${title}</div><div style="height:10px;width:180px;${grad}margin:6px 0;border:1px solid #ccc"></div><div style="display:flex;justify-content:space-between"><span>${left}</span><span>${right}</span></div></div>`;
      return div;
    };
    legendControl.addTo(leafletMap);
  }

  function formatValue(v, mode){
    if(v==null || isNaN(v)) return '无数据';
    if(mode === 'area'){
      return d3.format(',')(Math.round(v)) + ' ha';
    }
    // percent
    return (Math.round(v*100)/100).toFixed(2) + ' %';
  }

  // Ranking: horizontal diverging bars with ISO at center. Shows top N by absolute annual change for selected year.
  function renderRankingAxisRow(container, sideW, negMin, posMax){
    if(!container) return;
    const axisH = 30;
    const row = container.append('div').attr('class','row axisRow');

    const leftBar = row.append('div').attr('class','leftBar');
    const leftSvg = leftBar.append('svg').attr('width', sideW).attr('height', axisH);
    leftBar.append('div').attr('class','code').text('');

    row.append('div').attr('class','divider').text('|');

    const rightBar = row.append('div').attr('class','rightBar');
    rightBar.append('div').attr('class','code').text('');
    const rightSvg = rightBar.append('svg').attr('width', sideW).attr('height', axisH);

    const fmt = d3.format('~s');
    const negScale = d3.scaleLinear().domain([negMin, 0]).range([0, sideW]);
    const posScale = d3.scaleLinear().domain([0, posMax]).range([0, sideW]);

    leftSvg.append('g')
      .attr('class','axis')
      .attr('transform', `translate(0,${axisH-6})`)
      .call(d3.axisTop(negScale).ticks(4).tickFormat(fmt));

    rightSvg.append('g')
      .attr('class','axis')
      .attr('transform', `translate(0,${axisH-6})`)
      .call(d3.axisTop(posScale).ticks(4).tickFormat(fmt));
  }

  function renderRanking(year){
    const container = d3.select('#ranking');
    container.html('');
    if(!rawChangeData) return;
    const y = Math.max(1990, +year);
    const rows = rawChangeData
      .filter(r=>+r.Year===y && r.Code && r.Code.length===3)
      .map(r=>({code:r.Code, name:r.Entity, v:+r['Annual change in forest area'], year: y}));
    if(!rows.length){ container.append('div').text('该年份无年变化数据'); return; }

    // split negatives and positives and sort separately
    const negatives = rows.filter(d=>d.v<0).sort((a,b)=>a.v - b.v); // most negative first
    const positives = rows.filter(d=>d.v>0).sort((a,b)=>b.v - a.v); // largest positive first
    const maxLen = Math.max(negatives.length, positives.length);
    // 分页：每页固定 FIXED_ROWS_RANKING 对（左右各一条为一行）
    const rankingPageSize = Math.min(FIXED_ROWS_RANKING, maxLen);
    try{ window.__ranking_max_len__ = maxLen; }catch(e){}
    try{ window.__ranking_page_size__ = rankingPageSize; }catch(e){}
    rankingStartVal = Math.max(0, Math.min(rankingStartVal || 0, Math.max(0, maxLen - rankingPageSize)));
    const negTop = negatives.slice(rankingStartVal, rankingStartVal + rankingPageSize);
    const posTop = positives.slice(rankingStartVal, rankingStartVal + rankingPageSize);
    const rowsCount = Math.max(negTop.length, posTop.length);

    const negMin = d3.min(negTop, d=>d.v) || -1;
    const posMax = d3.max(posTop, d=>d.v) || 1;

    const wContainer = Math.max(280, document.querySelector('#ranking')?.clientWidth || 900);
    const totalInner = Math.max(280, wContainer - 100);
    const centerW = 140;
    const sideW = (totalInner - centerW) / 2; // width for each side svg
    const h = 32;

    // 顶部坐标轴（与当前窗口的缩放一致）
    renderRankingAxisRow(container, sideW, negMin, posMax);

    // 更新“窗口位置”滑动条
    updateWindowSlider(rankingWindowRange, rankingWindowLabel, maxLen, rankingPageSize, rankingStartVal);

    // create rows pairing negTop[i] with posTop[i]
    for(let i=0;i<rowsCount;i++){
      const neg = negTop[i] || null;
      const pos = posTop[i] || null;
      const row = container.append('div').attr('class','row');

      // DOM structure per row: (barA)(codeA) | (codeB)(barB)
      const leftBar = row.append('div').attr('class','leftBar');
      const leftSvg = leftBar.append('svg').attr('width', sideW).attr('height', h);
      leftBar.append('div').attr('class','code').text(neg ? neg.code : '');

      row.append('div').attr('class','divider').text('|');

      const rightBar = row.append('div').attr('class','rightBar');
      rightBar.append('div').attr('class','code').text(pos ? pos.code : '');
      const rightSvg = rightBar.append('svg').attr('width', sideW).attr('height', h);

      // draw left bar (negative) right-aligned
      if(neg){
        const negMaxAbs = Math.abs(negMin) || 1;
        const negScale = d3.scaleLinear().domain([0, negMaxAbs]).range([0, sideW]);
        const width = Math.max(1, negScale(Math.abs(neg.v)));
        const x = sideW - width;
        leftSvg.append('rect').attr('x', x).attr('y',(h-14)/2).attr('width', width).attr('height',14).attr('class','bar negative')
          .attr('fill', '#d9534f')
          .attr('rx', 3).attr('ry', 3);

        // hover hitbox (helps when the visible bar is very small)
        const hitW = Math.max(width, 22);
        const hitX = sideW - hitW;
        leftSvg.append('rect')
          .attr('x', hitX)
          .attr('y', (h-22)/2)
          .attr('width', hitW)
          .attr('height', 22)
          .attr('fill', 'transparent')
          .on('mouseenter', (event)=> showTrendTooltip(neg, event))
          .on('mouseleave', ()=> d3.selectAll('.tooltipTrend').remove());
      }

      // draw right bar (positive) left-aligned
      if(pos){
        const posMaxVal = posMax || 1;
        const posScale = d3.scaleLinear().domain([0, posMaxVal]).range([0, sideW]);
        const width = Math.max(1, posScale(pos.v));
        const x = 0;
        rightSvg.append('rect').attr('x', x).attr('y',(h-14)/2).attr('width', width).attr('height',14).attr('class','bar positive')
          .attr('fill', '#2b8c2b')
          .attr('rx', 3).attr('ry', 3);

        // hover hitbox
        const hitW = Math.max(width, 40);
        const hitX = 0;
        rightSvg.append('rect')
          .attr('x', hitX)
          .attr('y', (h-22)/2)
          .attr('width', hitW)
          .attr('height', 23)
          .attr('fill', 'transparent')
          .on('mouseenter', (event)=> showTrendTooltip(pos, event))
          .on('mouseleave', ()=> d3.selectAll('.tooltipTrend').remove());
      }
    }
    // 渲染完成后把排名容器滚回顶部，用户可用鼠标滚轮向下查看更多
    try{ const area = document.getElementById('ranking-area'); if(area) area.scrollTop = 0; }catch(e){}
  }

  // 总计模式：汇总 rankingMinYear—rankingMaxYear 的年变化之和
  function renderRankingTotal(){
    const container = d3.select('#ranking');
    container.html('');
    if(!rawChangeData) return;

    const sums = new Map();
    const nameByCode = new Map();
    rawChangeData.forEach(r=>{
      const code = r.Code;
      const yr = +r.Year;
      if(!code || code.length !== 3) return;
      if(isNaN(yr) || yr < rankingMinYear) return;
      if(typeof rankingMaxYear === 'number' && !isNaN(rankingMaxYear) && yr > rankingMaxYear) return;
      const v = +r['Annual change in forest area'];
      if(isNaN(v)) return;
      sums.set(code, (sums.get(code) || 0) + v);
      if(!nameByCode.has(code) && r.Entity) nameByCode.set(code, r.Entity);
    });

    const rows = Array.from(sums.entries()).map(([code, v])=>({
      code,
      name: nameByCode.get(code) || code,
      v,
      year: '总计'
    }));

    if(!rows.length){ container.append('div').text('无总计数据'); return; }

    const negatives = rows.filter(d=>d.v<0).sort((a,b)=>a.v - b.v);
    const positives = rows.filter(d=>d.v>0).sort((a,b)=>b.v - a.v);
    const maxLen = Math.max(negatives.length, positives.length);
    const rankingPageSize = Math.min(FIXED_ROWS_RANKING, maxLen);
    try{ window.__ranking_max_len__ = maxLen; }catch(e){}
    try{ window.__ranking_page_size__ = rankingPageSize; }catch(e){}
    rankingStartVal = Math.max(0, Math.min(rankingStartVal || 0, Math.max(0, maxLen - rankingPageSize)));
    const negTop = negatives.slice(rankingStartVal, rankingStartVal + rankingPageSize);
    const posTop = positives.slice(rankingStartVal, rankingStartVal + rankingPageSize);
    const rowsCount = Math.max(negTop.length, posTop.length);

    const negMin = d3.min(negTop, d=>d.v) || -1;
    const posMax = d3.max(posTop, d=>d.v) || 1;

    const wContainer = Math.max(280, document.querySelector('#ranking')?.clientWidth || 900);
    const totalInner = Math.max(280, wContainer - 100);
    const centerW = 140;
    const sideW = (totalInner - centerW) / 2;
    const h = 32;

    // 顶部坐标轴（与当前窗口的缩放一致）
    renderRankingAxisRow(container, sideW, negMin, posMax);

    // 更新“窗口位置”滑动条
    updateWindowSlider(rankingWindowRange, rankingWindowLabel, maxLen, rankingPageSize, rankingStartVal);

    for(let i=0;i<rowsCount;i++){
      const neg = negTop[i] || null;
      const pos = posTop[i] || null;
      const row = container.append('div').attr('class','row');

      const leftBar = row.append('div').attr('class','leftBar');
      const leftSvg = leftBar.append('svg').attr('width', sideW).attr('height', h);
      leftBar.append('div').attr('class','code').text(neg ? neg.code : '');

      row.append('div').attr('class','divider').text('|');

      const rightBar = row.append('div').attr('class','rightBar');
      rightBar.append('div').attr('class','code').text(pos ? pos.code : '');
      const rightSvg = rightBar.append('svg').attr('width', sideW).attr('height', h);

      if(neg){
        const negMaxAbs = Math.abs(negMin) || 1;
        const negScale = d3.scaleLinear().domain([0, negMaxAbs]).range([0, sideW]);
        const width = Math.max(1, negScale(Math.abs(neg.v)));
        const x = sideW - width;
        leftSvg.append('rect')
          .attr('x', x).attr('y',(h-14)/2).attr('width', width).attr('height',14)
          .attr('class','bar negative')
          .attr('fill', '#d9534f')
          .attr('rx', 3).attr('ry', 3);

        const hitW = Math.max(width, 22);
        const hitX = sideW - hitW;
        leftSvg.append('rect')
          .attr('x', hitX)
          .attr('y', (h-22)/2)
          .attr('width', hitW)
          .attr('height', 22)
          .attr('fill', 'transparent')
          .on('mouseenter', (event)=> showTrendTooltip(neg, event))
          .on('mouseleave', ()=> d3.selectAll('.tooltipTrend').remove());
      }

      if(pos){
        const posMaxVal = posMax || 1;
        const posScale = d3.scaleLinear().domain([0, posMaxVal]).range([0, sideW]);
        const width = Math.max(1, posScale(pos.v));
        rightSvg.append('rect')
          .attr('x', 0).attr('y',(h-14)/2).attr('width', width).attr('height',14)
          .attr('class','bar positive')
          .attr('fill', '#2b8c2b')
          .attr('rx', 3).attr('ry', 3);

        const hitW = Math.max(width, 40);
        rightSvg.append('rect')
          .attr('x', 0)
          .attr('y', (h-22)/2)
          .attr('width', hitW)
          .attr('height', 23)
          .attr('fill', 'transparent')
          .on('mouseenter', (event)=> showTrendTooltip(pos, event))
          .on('mouseleave', ()=> d3.selectAll('.tooltipTrend').remove());
      }
    }
    // 同上：滚回顶部
    try{ const area = document.getElementById('ranking-area'); if(area) area.scrollTop = 0; }catch(e){}
  }

  if(rankingWindowRange){
    rankingWindowRange.addEventListener('input', ()=>{
      rankingStartVal = Math.max(0, +rankingWindowRange.value || 0);
      if(selectedRankingMode === 'total') renderRankingTotal(); else renderRanking(selectedRankingYear);
    });
  }

  // 添加 mousewheel 事件：对 chart4-area 与 ranking-area 进行分页控制
  (function attachWheelControls(){
    const chart4Area = document.getElementById('chart4-area');
    const rankingArea = document.getElementById('ranking-area');
    if(chart4Area){
      chart4Area.addEventListener('wheel', (ev)=>{
        ev.preventDefault();
        const len = window.__chart4_filtered_length__ || 0;
        const perPage = len ? Math.min(FIXED_ROWS_CHART4, len) : 0;
        const maxOffset = Math.max(0, len - perPage);
        if(ev.deltaY > 0){ chart4Offset = Math.min(maxOffset, (chart4Offset || 0) + 1); } else { chart4Offset = Math.max(0, (chart4Offset || 0) - 1); }
        renderChartFour();
      }, { passive: false });
    }
    if(rankingArea){
      rankingArea.addEventListener('wheel', (ev)=>{
        ev.preventDefault();
        const maxLen = window.__ranking_max_len__ || 0;
        const pageSize = maxLen ? Math.min(FIXED_ROWS_RANKING, maxLen) : 0;
        const maxStart = Math.max(0, maxLen - pageSize);
        if(ev.deltaY > 0){ rankingStartVal = Math.min(maxStart, (rankingStartVal || 0) + 1); } else { rankingStartVal = Math.max(0, (rankingStartVal || 0) - 1); }
        if(selectedRankingMode === 'total') renderRankingTotal(); else renderRanking(selectedRankingYear);
      }, { passive: false });
    }
  })();

  function showTrendTooltip(item, event){
    d3.selectAll('.tooltipTrend').remove();
    const tooltip = d3.select('body').append('div').attr('class','tooltipTrend');

    const displayYear = (item && (typeof item.year === 'number' || typeof item.year === 'string') && String(item.year).length)
      ? item.year
      : (selectedRankingMode === 'total' ? '总计' : ((typeof selectedRankingYear === 'number' && !isNaN(selectedRankingYear)) ? selectedRankingYear : ''));
    const valueFmt = d3.format('+.2~s');
    const valueText = (item && typeof item.v === 'number' && !isNaN(item.v)) ? valueFmt(item.v) : '无数据';

    const unitText = 'ha'; // hectares (from dataset readme)
    const yearSuffix = (String(displayYear) === '总计') ? `总计 ${rankingMinYear}–${rankingMaxYear}` : String(displayYear);

    let series = rawChangeData
      .filter(r=>r.Code===item.code)
      .map(r=>({y:+r.Year, v:+r['Annual change in forest area']}))
      .filter(d=>!isNaN(d.y) && !isNaN(d.v))
      .sort((a,b)=>a.y-b.y);

    // show only recent years (up to the currently selected ranking year)
    const cutoffYear = (selectedRankingMode === 'year' && typeof selectedRankingYear === 'number' && !isNaN(selectedRankingYear)) ? selectedRankingYear : null;
    if(cutoffYear!=null){
      series = series.filter(d=>d.y <= cutoffYear);
    }
    const recentN = 35;
    if(series.length > recentN){
      series = series.slice(series.length - recentN);
    }
    tooltip.style('left', (event.pageX+12)+'px').style('top', (event.pageY+12)+'px');
    tooltip.html(
      `<div style="font-weight:700;margin-bottom:4px">${item.name} (${item.code})</div>`+
      `<div style="margin-bottom:6px;color:${item.v>=0?'#2b8c2b':'#d9534f'}">${valueText} ${unitText}（${yearSuffix}）</div>`+
      `<div id="spark-${item.code}"></div>`
    );
    // draw sparkline
    if(series.length){
      const w=180,h=48, pad=6;
      const x = d3.scaleLinear().domain(d3.extent(series,d=>d.y)).range([pad,w-pad]);
      const y = d3.scaleLinear().domain(d3.extent(series,d=>d.v)).range([h-pad,pad]);
      const linePos = d3.line().defined(d=>d.v>=0).x(d=>x(d.y)).y(d=>y(d.v));
      const lineNeg = d3.line().defined(d=>d.v<=0).x(d=>x(d.y)).y(d=>y(d.v));
      const svg = d3.select(`#spark-${item.code}`).append('svg').attr('class','spark').attr('width',w).attr('height',h);
      svg.append('path').datum(series).attr('d',linePos).attr('fill','none').attr('stroke','#2b8c2b').attr('stroke-width',2);
      svg.append('path').datum(series).attr('d',lineNeg).attr('fill','none').attr('stroke','#d9534f').attr('stroke-width',2);
      // zero line
      const zero = 0;
      if(series.some(d=>d.v<0) && series.some(d=>d.v>0)){
        const zy = y(0);
        svg.append('line').attr('x1',pad).attr('x2',w-pad).attr('y1',zy).attr('y2',zy).attr('stroke','#ccc').attr('stroke-dasharray','2,2');
      }
    }
  }
});
