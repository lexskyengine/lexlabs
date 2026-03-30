// content.js 增强补丁（替换原有 getMainContentWidth、applyStoredSettings 初始化与 resize 监听部分）

// 扩展的主体选择器列表（包含视频播放器常见容器）
const MAIN_SELECTORS = [
  '.bili-wrapper', '.container', '#app', '.international-page-wrap',
  '.main-wrap', '.bili-page-container', '.main',
  '.player-wrap', '.bpx-player', '.video-wrap', '.player-container'
];

function getMainContentWidth() {
  for (const s of MAIN_SELECTORS) {
    const el = document.querySelector(s);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width && r.width > 200) return r.width;
    }
  }
  // 回退：尝试查找播放器宽度（视频页）
  const player = document.querySelector('.bpx-player') || document.querySelector('.player-wrap') || document.querySelector('.video-wrap');
  if (player) {
    const pr = player.getBoundingClientRect();
    if (pr.width && pr.width > 200) return pr.width;
  }
  return Math.min(document.documentElement.clientWidth, 1200);
}

// 在 SPA 路由或 DOM 变化时重新应用侧边（使用 MutationObserver）
let applyTimer = null;
function scheduleApply(img) {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    chrome.storage.local.get([STORAGE_KEYS.IMG], res => {
      applySides(img || res[STORAGE_KEYS.IMG]);
    });
  }, 120);
}

// 观察 body 的子树变化（路由切换、播放器加载等）
const mo = new MutationObserver((mutations) => {
  // 简单过滤：当 body 子节点或属性变化时重算
  scheduleApply();
});
mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });

// 初次应用与存储读取（保持原逻辑）
applyStoredSettings();

// 监听 resize（保留）
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    chrome.storage.local.get([STORAGE_KEYS.IMG], res => {
      applySides(res[STORAGE_KEYS.IMG]);
    });
  }, 150);
});
