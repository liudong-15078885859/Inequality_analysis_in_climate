import { ensureD3, ensureVega } from './lib-loader.js';

export async function initAnnualShareBar(container, {
  dataUrl = './climate-visualization/data.csv',
  height = 350,
  year = 2000,
  minYear = 1850,
  maxYear = 2023,
} = {}) {
  if (!container) throw new Error('initAnnualShareBar: container is required');

  await ensureVega();

  const params = [
    {
      name: 'yearSlider',
      value: year,
      bind: {
        input: 'range',
        min: minYear,
        max: maxYear,
        step: 1,
      },
    },
    {
      name: 'selectCountry',
      select: { type: 'point', fields: ['Entity'] },
    },
  ];

  const baseTransform = [
    {
      filter: {
        field: 'Entity',
        oneOf: [
          'United States', 'China', 'India', 'Russia',
          'Japan', 'Germany', 'United Kingdom',
          'Canada', 'Brazil', 'France',
        ],
      },
    },
  ];

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height,
    data: { url: dataUrl },
    params,
    transform: [
      ...baseTransform,
      { filter: 'datum.Year == yearSlider' },
      { joinaggregate: [{ op: 'sum', field: 'Annual CO2 emissions', as: 'total' }] },
      { calculate: "datum['Annual CO2 emissions'] / datum.total * 100", as: 'share' },
    ],
    mark: { type: 'bar', cornerRadiusTopLeft: 6, cornerRadiusTopRight: 6 },
    encoding: {
      x: {
        field: 'Entity',
        type: 'nominal',
        sort: '-y',
        axis: { labelAngle: -25 },
      },
      y: {
        field: 'share',
        type: 'quantitative',
        title: 'Share of Global Emissions (%)',
      },
      color: {
        condition: { param: 'selectCountry', field: 'Entity' },
        value: '#bbb',
      },
      tooltip: [
        { field: 'Entity', title: 'Entity' },
        { field: 'share', title: 'Share (%)', format: '.3f' },
      ],
    },
    config: {
      axis: { labelFontSize: 14, titleFontSize: 14 },
      legend: { labelFontSize: 12, titleFontSize: 12 },
    },
  };

  container.replaceChildren();

  // eslint-disable-next-line no-undef
  await window.vegaEmbed(container, spec, { actions: false });
}

const PROD_COL = 'CO₂ emissions per capita';
const CONS_COL = 'Per capita consumption-based CO₂ emissions';

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function mergeProductionConsumptionRows(productionUrl, consumptionUrl) {
  await ensureD3();
  const d3 = window.d3;
  const [prod, cons] = await Promise.all([
    d3.csv(productionUrl),
    d3.csv(consumptionUrl),
  ]);

  const consMap = new Map();
  for (const row of cons) {
    const code = row.Code;
    if (!code || code.startsWith('OWID_')) continue;
    const year = Number.parseInt(row.Year, 10);
    const v = Number.parseFloat(row[CONS_COL]);
    if (!Number.isFinite(year) || !Number.isFinite(v)) continue;
    consMap.set(`${code}|${year}`, v);
  }

  const merged = [];
  for (const row of prod) {
    const code = row.Code;
    if (!code || code.startsWith('OWID_')) continue;
    const year = Number.parseInt(row.Year, 10);
    const p = Number.parseFloat(row[PROD_COL]);
    const c = consMap.get(`${code}|${year}`);
    if (!Number.isFinite(year) || !Number.isFinite(p) || !Number.isFinite(c)) continue;
    const net = c - p;
    let tradeRole = '大致平衡';
    if (net > 0.12) tradeRole = '消费侧更高（净进口隐含）';
    else if (net < -0.12) tradeRole = '生产侧更高（净出口隐含）';
    merged.push({
      Entity: row.Entity,
      Code: code,
      Year: year,
      production: p,
      consumption: c,
      net_import: net,
      tradeRole,
    });
  }

  merged.sort((a, b) => b.Year - a.Year || a.Entity.localeCompare(b.Entity));
  return merged;
}

export async function initProductionConsumptionPerCapita(container, {
  productionUrl = './add-dataset/production-co2-per-capita/co2-emissions-per-capita.csv',
  consumptionUrl = './add-dataset/consumption-co2-per-capita/consumption-co2-per-capita.csv',
  defaultYear = 2023,
  defaultTopN = 80,
} = {}) {
  if (!container) throw new Error('initProductionConsumptionPerCapita: container is required');

  await ensureVega();
  const merged = await mergeProductionConsumptionRows(productionUrl, consumptionUrl);
  if (!merged.length) {
    container.textContent = '无法加载或合并人均 CO₂ 数据。';
    return;
  }

  const years = [...new Set(merged.map((r) => r.Year))].sort((a, b) => a - b);
  const yMin = years[0];
  const yMax = years[years.length - 1];
  const yearClamp = Math.min(Math.max(defaultYear, yMin), yMax);

  container.replaceChildren();

  const toolbar = document.createElement('div');
  toolbar.className = 'chart-frame__toolbar';
  toolbar.innerHTML = `
    <label>年份 <input type="range" class="js-pc-year" min="${yMin}" max="${yMax}" step="1" value="${yearClamp}" aria-label="选择年份" /></label>
    <span class="js-pc-year-label" aria-live="polite">${yearClamp}</span>
    <label>显示国家/地区数（按生产侧人均降序）
      <select class="js-pc-topn" aria-label="显示国家数量">
        <option value="40">40</option>
        <option value="80" selected>80</option>
        <option value="140">140</option>
        <option value="99999">全部</option>
      </select>
    </label>
    <button type="button" class="chart-frame__zoom-reset js-pc-reset-zoom" aria-label="重置缩放">重置缩放</button>
    <span class="chart-frame__toolbar-hint">虚线表示生产与消费相等。线上侧偏向消费、线下侧偏向生产；<strong>绘图区滚动滚轮：以原点为锚缩放</strong>（视域 [0,max]）；点击圆点高亮，双击画布空白取消。数据：Our&nbsp;World in Data / Global Carbon Budget。</span>
  `;

  const mount = document.createElement('div');
  mount.className = 'chart-frame__vega-mount';

  container.appendChild(toolbar);
  container.appendChild(mount);

  const yearRange = toolbar.querySelector('.js-pc-year');
  const yearLabel = toolbar.querySelector('.js-pc-year-label');
  const topNSelect = toolbar.querySelector('.js-pc-topn');

  const topAllowed = new Set(['40', '80', '140', '99999']);
  topNSelect.value = topAllowed.has(String(defaultTopN)) ? String(defaultTopN) : '80';

  const zoomState = {
    contextKey: '',
    /** 与用户滚轮缩放：null 表示随数据自适应；否则为当前视域上界 */
    userVisualMax: null,
    /** 当前数据算出的推荐上界（每次 render 更新） */
    baselineAxisMax: 1,
  };

  let view = null;
  let wheelRaf = 0;

  const render = () => {
    const yr = Number.parseInt(yearRange.value, 10);
    yearLabel.textContent = String(yr);
    const topN = Number.parseInt(topNSelect.value, 10);

    const ctxKey = `${yr}|${topN}`;
    if (zoomState.contextKey !== ctxKey) {
      zoomState.contextKey = ctxKey;
      zoomState.userVisualMax = null;
    }

    let rows = merged.filter((r) => r.Year === yr);
    rows = [...rows].sort((a, b) => b.production - a.production);
    const capped = topN < 9999 ? rows.slice(0, topN) : rows;

    const hi = capped.length
      ? Math.max(...capped.flatMap((r) => [r.production, r.consumption]), 1)
      : 1;
    const baselineAxisMax = Math.ceil(hi * 1.12 * 100) / 100;
    zoomState.baselineAxisMax = baselineAxisMax;

    const minView = 0.012;
    const maxView = Math.max(baselineAxisMax * 60, 4);
    const axisMax = zoomState.userVisualMax != null
      ? Math.min(Math.max(zoomState.userVisualMax, minView), maxView)
      : baselineAxisMax;

    const domainMax = Math.max(axisMax, 1e-9);
    /** 略扩展上界，避免最大处的圆点半径画出绘图区裁切线 */
    const viewMax = domainMax * 1.06;
    /** 视域以原点为锚；展示域略大于逻辑 max，仍读原始数值 */
    const sharedLinear = {
      domain: [0, viewMax],
      nice: false,
      zero: true,
      clamp: true,
    };

    const diag = [
      { production: 0, consumption: 0 },
      { production: viewMax, consumption: viewMax },
    ];

    const box = mount.getBoundingClientRect();
    const innerW = Math.max(200, mount.clientWidth || box.width || 320);
    const innerH = Math.max(280, mount.clientHeight || box.height || 360);
    /**
     * VL 的 width/height 仅为数据矩形；Y 轴、X 轴与底部横排图例由 Vega 画在矩形外。
     * 若把矩形撑满容器，轴与刻度会落在框外或被裁掉，故预留边距。
     */
    const pad = { left: 82, right: 22, top: 8, bottom: 132 };
    const availW = Math.max(200, Math.floor(innerW - pad.left - pad.right));
    const availH = Math.max(240, Math.floor(innerH - pad.top - pad.bottom));
    const PLOT_DIM_SCALE = 1.1;
    const wPx = Math.max(200, Math.round(availW * PLOT_DIM_SCALE));
    const chartH = Math.max(240, Math.round(availH * PLOT_DIM_SCALE));

    const tickFormat = viewMax < 0.35 ? '.2f' : viewMax < 4 ? '.1f' : '.0f';
    const tickStep = viewMax > 2 ? null : viewMax > 0.5 ? 0.05 : 0.01;
    const stepOpt = tickStep != null ? { tickMinStep: tickStep } : {};

    /** 坐标轴挂在散点层：后一层若对共享 scale 写 axis:null，合并时可能把整组轴隐藏 */
    const axisBottom = {
      orient: 'bottom',
      title: '生产侧人均 CO₂（吨/人）',
      format: tickFormat,
      labelOverlap: false,
      ...stepOpt,
    };
    const axisLeft = {
      orient: 'left',
      title: '消费侧人均 CO₂（吨/人）',
      format: tickFormat,
      labelOverlap: false,
      ...stepOpt,
    };

    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: wPx,
      height: chartH,
      autosize: { type: 'pad', contains: 'padding', resize: true },
      /** 必须共享 x/y 比例尺：否则「参考线层」与「散点层」会用不同像素 range，放大后点会挤到一侧 */
      resolve: {
        scale: {
          x: 'shared',
          y: 'shared',
        },
      },
      config: {
        axis: {
          grid: true,
          gridOpacity: 0.45,
          gridDash: [3, 3],
          domain: true,
          domainColor: '#222',
          domainWidth: 1.5,
          tickCount: 7,
          labelFontSize: 11,
          labelColor: '#1f2937',
          tickColor: '#4b5563',
          titleColor: '#111827',
          titleFontSize: 12,
          titleFontWeight: 600,
          labelPadding: 6,
          labelOverlap: false,
        },
        legend: {
          labelFontSize: 10,
          titleFontSize: 10,
          orient: 'bottom',
          direction: 'horizontal',
        },
        view: { stroke: '#d1d5db', strokeWidth: 1 },
      },
      layer: [
        {
          data: { values: diag },
          mark: {
            type: 'line',
            clip: false,
            stroke: '#888',
            strokeWidth: 1.25,
            strokeDash: [5, 4],
          },
          encoding: {
            x: {
              field: 'production',
              type: 'quantitative',
              scale: { ...sharedLinear },
              axis: null,
            },
            y: {
              field: 'consumption',
              type: 'quantitative',
              scale: { ...sharedLinear },
              axis: null,
            },
          },
        },
        {
          params: [
            {
              name: 'pick',
              select: {
                type: 'point',
                fields: ['Code'],
                toggle: false,
                on: 'click',
                clear: 'dblclick',
              },
            },
          ],
          data: { values: capped },
          mark: {
            type: 'point',
            filled: true,
            clip: true,
            stroke: '#fff',
            strokeWidth: 1,
          },
          encoding: {
            x: {
              field: 'production',
              type: 'quantitative',
              scale: { ...sharedLinear },
              axis: axisBottom,
            },
            y: {
              field: 'consumption',
              type: 'quantitative',
              scale: { ...sharedLinear },
              axis: axisLeft,
            },
            color: {
              field: 'tradeRole',
              title: '贸易隐含',
              legend: {
                orient: 'bottom',
                direction: 'horizontal',
              },
              scale: {
                domain: [
                  '消费侧更高（净进口隐含）',
                  '大致平衡',
                  '生产侧更高（净出口隐含）',
                ],
                range: ['#b91c1c', '#78716c', '#1d4ed8'],
              },
            },
            opacity: {
              condition: { param: 'pick', value: 1 },
              value: 0.78,
            },
            size: {
              condition: { param: 'pick', value: 180 },
              value: 78,
              legend: null,
            },
            tooltip: [
              { field: 'Entity', title: '国家/地区' },
              { field: 'Year', title: '年份' },
              { field: 'production', title: '生产侧', format: '.2f' },
              { field: 'consumption', title: '消费侧', format: '.2f' },
              {
                field: 'net_import',
                title: '消费 − 生产',
                format: '+.2f',
              },
              { field: 'tradeRole', title: '类型' },
            ],
          },
        },
      ],
    };

    try {
      view?.finalize?.();
    } catch {
      /* ignore */
    }
    view = null;
    mount.replaceChildren();
    // eslint-disable-next-line no-undef
    window.vegaEmbed(mount, spec, {
      actions: false,
      renderer: 'svg',
    }).then((r) => {
      view = r.view;
    }).catch((err) => {
      console.error(err);
      mount.textContent = '';
      const msg = document.createElement('div');
      msg.role = 'status';
      msg.style.cssText = 'padding:12px 14px;color:#b91c1c;font-size:13px;line-height:1.5;';
      msg.textContent = `图表未能渲染（${err?.message ?? String(err)}）。请打开开发者工具查看详细错误，或确认已通过 http(s) 方式访问本站。`;
      mount.appendChild(msg);
    });
  };

  const debouncedRender = debounce(render, 120);
  yearRange.addEventListener('input', debouncedRender);
  yearRange.addEventListener('change', render);
  topNSelect.addEventListener('change', render);
  window.addEventListener('resize', debouncedRender);

  const btnResetZoom = toolbar.querySelector('.js-pc-reset-zoom');
  if (btnResetZoom) {
    btnResetZoom.addEventListener('click', () => {
      zoomState.userVisualMax = null;
      render();
    });
  }

  const onWheelZoom = (ev) => {
    ev.preventDefault();
    const b = zoomState.baselineAxisMax;
    const minView = 0.012;
    const maxView = Math.max(b * 60, 4);

    let cur = zoomState.userVisualMax ?? b;
    const step = Math.exp(ev.deltaY * 0.0022);
    cur *= step;
    zoomState.userVisualMax = Math.min(Math.max(cur, minView), maxView);

    if (wheelRaf) cancelAnimationFrame(wheelRaf);
    wheelRaf = requestAnimationFrame(() => {
      wheelRaf = 0;
      render();
    });
  };
  mount.addEventListener('wheel', onWheelZoom, { passive: false, capture: true });

  requestAnimationFrame(() => render());
}
