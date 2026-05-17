const loaded = new Map();

export function loadScriptOnce(url, { globalName } = {}) {
  if (loaded.has(url)) return loaded.get(url);

  const promise = new Promise((resolve, reject) => {
    if (globalName && typeof window[globalName] !== 'undefined') {
      resolve();
      return;
    }

    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.crossOrigin = 'anonymous';

    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load script: ${url}`));

    document.head.appendChild(el);
  });

  loaded.set(url, promise);
  return promise;
}

export async function ensureVega() {
  // Keep the same versions as the original visualization page.
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/vega@5', { globalName: 'vega' });
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/vega-lite@5', { globalName: 'vegaLite' });
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/vega-embed@6', { globalName: 'vegaEmbed' });

  if (typeof window.vegaEmbed !== 'function') {
    throw new Error('vegaEmbed was not loaded');
  }
}

export async function ensureD3() {
  await loadScriptOnce('https://d3js.org/d3.v7.min.js', { globalName: 'd3' });
  if (!window.d3) throw new Error('d3 was not loaded');
}

export async function ensureTopojson() {
  await ensureD3();
  await loadScriptOnce('https://d3js.org/topojson.v3.min.js', { globalName: 'topojson' });
  if (!window.topojson) throw new Error('topojson was not loaded');
}

export async function ensureD3Sankey() {
  await ensureD3();
  await loadScriptOnce('https://unpkg.com/d3-sankey@0.12.3/dist/d3-sankey.min.js');
  if (typeof window.d3?.sankey !== 'function') throw new Error('d3-sankey was not loaded');
}
