import { initAnnualShareBar, initProductionConsumptionPerCapita } from './climate-visualization.js';
import { initIsolatedIframe } from './iframe-embed.js';
import { initPatentsSyncBridge } from './patents-sync.js';

function mustGet(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

async function main() {
  // 1) 年度占比柱状图
  await initAnnualShareBar(mustGet('#embed-cv-annual-share-bar'));

  // 2) CO₂ 年度 / 人均 / 累计（Plotly，见 docs/co2）
  initIsolatedIframe(mustGet('#embed-co2'), {
    src: './co2/index.html',
    title: 'CO₂ 排放：年度、人均与累计（多国家对比）',
    minHeight: 700,
  });

  // 3) 人均生产侧 vs 消费侧 CO₂（图2 与 环境脆弱度地球之间）
  await initProductionConsumptionPerCapita(mustGet('#embed-prod-cons-per-capita'));

  // 4+) 其余图表使用原图表页面，保证原有交互逻辑不变。
  initIsolatedIframe(mustGet('#embed-vulnerability-radar'), {
    src: './charts/climate-vulnerability-globe/radar.html',
    title: '全球环境脆弱度（3D地球与雷达联动）',
    minHeight: 720,
  });
  initIsolatedIframe(mustGet('#embed-forest-map'), {
    src: './charts/forest/map.html',
    title: '全球森林覆盖率/面积地图',
    minHeight: 500,
  });
  initIsolatedIframe(mustGet('#embed-forest-composition'), {
    src: './charts/forest/composition.html',
    title: '天然林 vs 人工林（对比）',
    minHeight: 800,
  });
  initIsolatedIframe(mustGet('#embed-forest-ranking'), {
    src: './charts/forest/ranking.html',
    title: '森林净变化排名（发散条形）',
    minHeight: 800,
  });
  initIsolatedIframe(mustGet('#embed-forest-matrix'), {
    src: './charts/forest/matrix.html',
    title: '森林碳汇潜力矩阵（气泡）',
    minHeight: 500,
  });
  initIsolatedIframe(mustGet('#embed-litigation-map'), {
    src: './charts/climate-litigation-visualization/map.html',
    title: '全球气候诉讼分布地图',
    iframeBorderRadius: '0',
  });
  initIsolatedIframe(mustGet('#embed-litigation-trend'), {
    src: './charts/climate-litigation-visualization/trend.html',
    title: '气候诉讼趋势图',
    iframeBorderRadius: '0',
  });
  initIsolatedIframe(mustGet('#embed-patents-map'), {
    src: './charts/green-low-carbon-patents/map.html',
    title: '绿色低碳专利分布地图',
    minHeight: 520,
    iframeBorderRadius: '0',
  });
  initIsolatedIframe(mustGet('#embed-patents-bar'), {
    src: './charts/green-low-carbon-patents/bar.html',
    title: '绿色低碳专利分组条形图',
    minHeight: 520,
    iframeBorderRadius: '0',
  });
  initPatentsSyncBridge(mustGet('#embed-patents-map'), mustGet('#embed-patents-bar'));
  initIsolatedIframe(mustGet('#embed-patents-sankey'), {
    src: './charts/green-low-carbon-patents/sankey.html',
    title: '国际技术转让流向桑基图',
    iframeBorderRadius: '0',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch(console.error);
  });
} else {
  main().catch(console.error);
}
