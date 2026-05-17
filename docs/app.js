(() => {
  const progressEl = document.querySelector('.scroll-progress');

  function updateScrollProgress() {
    if (!progressEl) return;
    const root = document.documentElement;
    const scrollable = root.scrollHeight - root.clientHeight;
    const ratio = scrollable > 0 ? root.scrollTop / scrollable : 0;
    progressEl.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  const navLinks = Array.from(document.querySelectorAll('.nav__link'));
  const sections = navLinks
    .map((a) => {
      const id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
      const el = id ? document.getElementById(id) : null;
      return el ? { id, el, link: a } : null;
    })
    .filter(Boolean);

  function setActive(id) {
    for (const item of sections) {
      const isActive = item.id === id;
      if (isActive) item.link.setAttribute('aria-current', 'true');
      else item.link.removeAttribute('aria-current');
    }
  }

  // 初始状态
  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    if (sections.some((s) => s.id === id)) setActive(id);
  } else if (sections.length) {
    setActive(sections[0].id);
  }

  // 根据滚动位置高亮当前章节（对超长 section 更稳健）
  function updateActiveByScroll() {
    if (!sections.length) return;

    const anchorY = window.innerHeight * 0.24;
    let current = sections[0];
    let bestPastTop = -Infinity;
    let nearestFuture = null;

    for (const item of sections) {
      const { top } = item.el.getBoundingClientRect();
      if (top <= anchorY && top > bestPastTop) {
        bestPastTop = top;
        current = item;
      } else if (top > anchorY && (!nearestFuture || top < nearestFuture.el.getBoundingClientRect().top)) {
        nearestFuture = item;
      }
    }

    // 页面回到顶部附近时，固定高亮第一个章节；否则优先使用锚点之上的最近章节
    if (window.scrollY < 8) current = sections[0];
    else if (bestPastTop === -Infinity && nearestFuture) current = nearestFuture;

    setActive(current.id);
  }

  let scrollRaf = 0;
  function onScrollOrResize() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateActiveByScroll();
      updateScrollProgress();
    });
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  updateActiveByScroll();
  updateScrollProgress();

  // 点击目录时保持 aria-current 立即更新
  for (const item of sections) {
    item.link.addEventListener('click', () => setActive(item.id), { passive: true });
  }
})();
