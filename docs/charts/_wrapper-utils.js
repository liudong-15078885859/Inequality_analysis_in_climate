// Minimal helper for chart wrapper pages.
// Keeps implementation simple (no build step needed).

/**
 * 嵌入 docs/index 的 `.chart-frame` 时使用：去掉内层 `.card` 的描边与圆角，
 * 避免与宿主外框 + iframe 圆角形成「双线框」；圆角仅由宿主 `.chart-frame` 承担。
 */
export const EMBED_SINGLE_FRAME_CSS = `
html, body { background: #ffffff !important; }
[data-charts-keep="1"] {
  padding: 16px 18px 18px !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  background: #ffffff !important;
  max-width: none !important;
}
[data-charts-keep="1"]::before { display: none !important; }
[data-charts-keep="1"]:hover {
  transform: none !important;
  box-shadow: none !important;
  border-color: transparent !important;
}
`.trim();

export function initIframeOnlyShow(frameEl, options) {
  const {
    targetSelector,
    keepClosestSelector,
    hideSelectors = [],
    clickSelector = null,
    waitMs = 350,
    extraCss = "",
  } = options;

  function run() {
    const doc = frameEl.contentDocument;
    if (!doc) return;

    const apply = () => {
      try {
        if (clickSelector) {
          const btn = doc.querySelector(clickSelector);
          if (btn) btn.click();
        }

        // Mark the element we want to keep (usually a card/panel).
        const target = doc.querySelector(targetSelector);
        const keepRoot =
          (target && keepClosestSelector ? target.closest(keepClosestSelector) : null) ||
          target;

        if (keepRoot) {
          keepRoot.setAttribute("data-charts-keep", "1");
        }

        // Hide unrelated parts via CSS, without deleting nodes (avoids breaking scripts).
        const style = doc.createElement("style");
        style.setAttribute("data-charts-wrapper", "1");

        // 禁止 document 级滚动 + 仅在保留区块内滚动，避免「body 一条 + 内部面板一条」双滚动条。
        const embedScrollCss = [
          "html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; overflow: hidden !important; }",
          "[data-charts-keep=\"1\"] {",
          "  box-sizing: border-box !important;",
          "  margin: 0 !important;",
          "  max-width: none !important;",
          "  width: 100% !important;",
          "  height: 100vh !important;",
          "  max-height: 100vh !important;",
          "  overflow-y: auto !important;",
          "  overflow-x: hidden !important;",
          "  -webkit-overflow-scrolling: touch;",
          "  padding: 8px 4px !important;",
          "}",
        ].join("\n");

        const hideCss = [
          // Hide explicitly listed selectors.
          ...hideSelectors.map((sel) => `${sel} { display: none !important; }`),
          // If we marked something to keep, hide siblings of the same type.
          keepClosestSelector
            ? `${keepClosestSelector}:not([data-charts-keep=\"1\"]) { display: none !important; }`
            : "",
          embedScrollCss,
          // Caller: 背景色、覆盖默认 padding（须写在 embedScrollCss 之后以便覆盖 12px）
          extraCss || "",
        ]
          .filter(Boolean)
          .join("\n");

        style.textContent = hideCss;
        doc.head.appendChild(style);
      } catch {
        // ignore
      }
    };

    // Some pages render charts asynchronously; apply after a short delay.
    setTimeout(apply, waitMs);
  }

  frameEl.addEventListener("load", run);
}

/**
 * 与 {@link initIframeOnlyShow} 相同，但保留多个目标（例如同一 `.dashboard` 内并列两张图），
 * 各自向上查找 `keepClosestSelector` 并打上 `data-charts-keep="1"`。
 */
export function initIframeKeepMultiple(frameEl, options) {
  const {
    targetSelectors = [],
    keepClosestSelector,
    hideSelectors = [],
    clickSelector = null,
    waitMs = 350,
    extraCss = "",
  } = options;

  function run() {
    const doc = frameEl.contentDocument;
    if (!doc) return;

    const apply = () => {
      try {
        if (clickSelector) {
          const btn = doc.querySelector(clickSelector);
          if (btn) btn.click();
        }

        for (const sel of targetSelectors) {
          const target = doc.querySelector(sel);
          const keepRoot =
            (target && keepClosestSelector ? target.closest(keepClosestSelector) : null) ||
            target;
          if (keepRoot) {
            keepRoot.setAttribute("data-charts-keep", "1");
          }
        }

        const style = doc.createElement("style");
        style.setAttribute("data-charts-wrapper", "1");

        const embedScrollCss = [
          "html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; overflow: hidden !important; }",
          "[data-charts-keep=\"1\"] {",
          "  box-sizing: border-box !important;",
          "  margin: 0 !important;",
          "  max-width: none !important;",
          "  width: 100% !important;",
          "  height: 100vh !important;",
          "  max-height: 100vh !important;",
          "  overflow-y: auto !important;",
          "  overflow-x: hidden !important;",
          "  -webkit-overflow-scrolling: touch;",
          "  padding: 8px 4px !important;",
          "}",
        ].join("\n");

        const hideCss = [
          ...hideSelectors.map((sel) => `${sel} { display: none !important; }`),
          keepClosestSelector
            ? `${keepClosestSelector}:not([data-charts-keep=\"1\"]) { display: none !important; }`
            : "",
          embedScrollCss,
          extraCss || "",
        ]
          .filter(Boolean)
          .join("\n");

        style.textContent = hideCss;
        doc.head.appendChild(style);
      } catch {
        // ignore
      }
    };

    setTimeout(apply, waitMs);
  }

  frameEl.addEventListener("load", run);
}

// Make an iframe feel like an inline "div chart" by auto-sizing its height
// to the embedded document content (same-origin only).
export function autoResizeIframe(frameEl, options = {}) {
  const {
    minHeight = 260,
    maxHeight = 1400,
    extraPadding = 0,
  } = options;

  const clamp = (n) => Math.max(minHeight, Math.min(maxHeight, n));

  function measureAndApply() {
    const doc = frameEl.contentDocument;
    if (!doc) return;

    const body = doc.body;
    const html = doc.documentElement;
    if (!body || !html) return;

    const height = Math.max(
      body.scrollHeight,
      html.scrollHeight,
      body.offsetHeight,
      html.offsetHeight
    );

    frameEl.style.height = `${clamp(height + extraPadding)}px`;
  }

  function attachObservers() {
    const doc = frameEl.contentDocument;
    if (!doc) return;

    // Initial sizing.
    measureAndApply();

    // Resize when DOM changes.
    try {
      const mo = new MutationObserver(() => measureAndApply());
      mo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
      frameEl.__chartsMo = mo;
    } catch {
      // ignore
    }

    // Resize when layout changes.
    try {
      const ro = new ResizeObserver(() => measureAndApply());
      ro.observe(doc.documentElement);
      frameEl.__chartsRo = ro;
    } catch {
      // ignore
    }
  }

  frameEl.addEventListener("load", () => {
    // Clean old observers if any.
    try { frameEl.__chartsMo?.disconnect?.(); } catch {}
    try { frameEl.__chartsRo?.disconnect?.(); } catch {}

    attachObservers();
  });

  // In case iframe is already loaded.
  if (frameEl.contentDocument?.readyState === "complete") {
    attachObservers();
  }

  return { measureAndApply };
}
