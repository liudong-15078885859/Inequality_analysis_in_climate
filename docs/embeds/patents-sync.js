/**
 * 主站第六部分：地图与分组条形图分属两个 iframe，通过 window.postMessage 同步选中国家。
 * DOM: .chart-frame > iframe(map|bar.html) > iframe(test.html)
 */

const PATENTS_CHANNEL = 'green-patents';
const PATENTS_ACTION = 'select-country';

export function getPatentsInnerChartWindow(chartFrame) {
  if (!chartFrame) return null;
  const outer = chartFrame.querySelector('iframe');
  if (!outer?.contentWindow) return null;
  try {
    const doc = outer.contentDocument;
    if (!doc) return null;
    const inner = doc.querySelector('iframe');
    return inner?.contentWindow ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {HTMLElement} mapFrameEl - #embed-patents-map
 * @param {HTMLElement} barFrameEl - #embed-patents-bar
 */
export function initPatentsSyncBridge(mapFrameEl, barFrameEl) {
  if (!mapFrameEl || !barFrameEl) return;

  function forwardToBoth(country) {
    const payload = { channel: PATENTS_CHANNEL, action: PATENTS_ACTION, country };
    const wMap = getPatentsInnerChartWindow(mapFrameEl);
    const wBar = getPatentsInnerChartWindow(barFrameEl);
    if (wMap) wMap.postMessage(payload, '*');
    if (wBar) wBar.postMessage(payload, '*');
  }

  function onMessage(e) {
    if (!e.data || e.data.channel !== PATENTS_CHANNEL || e.data.action !== PATENTS_ACTION) return;
    const wMap = getPatentsInnerChartWindow(mapFrameEl);
    const wBar = getPatentsInnerChartWindow(barFrameEl);
    const fromInner =
      (wMap && e.source === wMap) || (wBar && e.source === wBar);
    if (!fromInner) return;
    forwardToBoth(e.data.country);
  }

  window.addEventListener('message', onMessage);
}
