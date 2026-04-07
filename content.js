// content.js
const STORAGE_KEYS = { IMG: 'biliSkinImgCropped', RAW: 'biliSkinImg', OPACITY: 'biliSkinOpacity', BLUR: 'biliSkinBlur' };

function getMainContentWidth() {
  const selectors = ['.bili-wrapper', '.container', '#app', '.international-page-wrap', '.main-wrap', '.bili-page-container', '.main'];
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width && r.width > 200) return r.width;
    }
  }
  return Math.min(document.documentElement.clientWidth, 1200);
}

function computeSideSize() {
  const vw = document.documentElement.clientWidth;
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight);
  const mainW = getMainContentWidth();
  const sideW = Math.max(0, Math.round((vw - mainW) / 2));
  return { sideW, vh, mainW, vw };
}

function removeOldSides() {
  document.querySelectorAll('.bili-skin-side').forEach(n => n.remove());
}

function applySides(imgDataUrl, color) {
  removeOldSides();
  const { sideW, vh } = computeSideSize();
  if (sideW <= 0) return;

  const left = document.createElement('div');
  const right = document.createElement('div');
  [left, right].forEach(el => {
    el.className = 'bili-skin-side';
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.height = vh + 'px';
    el.style.zIndex = '-1';
    el.style.pointerEvents = 'none';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center center';
    el.style.transition = 'background-image 0.2s ease';
  });

  left.style.left = '0';
  left.style.width = sideW + 'px';
  right.style.right = '0';
  right.style.width = sideW + 'px';

  if (imgDataUrl) {
    left.style.backgroundImage = `url(${imgDataUrl})`;
    right.style.backgroundImage = `url(${imgDataUrl})`;
    right.style.transform = 'scaleX(-1)';
  } else if (color) {
    left.style.background = color;
    right.style.background = color;
  } else {
    left.style.background = '#00a1d6';
    right.style.background = '#00a1d6';
  }

  document.body.appendChild(left);
  document.body.appendChild(right);
}

function applyStoredSettings() {
  chrome.storage.local.get([STORAGE_KEYS.IMG, STORAGE_KEYS.RAW, STORAGE_KEYS.OPACITY, STORAGE_KEYS.BLUR], res => {
    const img = res[STORAGE_KEYS.IMG] || res[STORAGE_KEYS.RAW] || null;
    const opacity = res[STORAGE_KEYS.OPACITY] || 0.9;
    const blur = (typeof res[STORAGE_KEYS.BLUR] !== 'undefined') ? res[STORAGE_KEYS.BLUR] : 5;
    if (img) {
      applySides(img);
    } else {
      applySides(null, null);
    }
    document.documentElement.style.setProperty('--bili-skin-opacity', opacity);
    document.documentElement.style.setProperty('--bili-skin-blur', `${blur}px`);
  });
}

applyStoredSettings();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'getSideSize') {
    sendResponse(computeSideSize());
    return true;
  }
  if (msg.type === 'updateCroppedImg') {
    applySides(msg.dataUrl);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'setImg') {
    applySides(msg.value);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'setOpacity') {
    document.documentElement.style.setProperty('--bili-skin-opacity', msg.value);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'setBlur') {
    document.documentElement.style.setProperty('--bili-skin-blur', `${msg.value}px`);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'reset') {
    chrome.storage.local.remove([STORAGE_KEYS.IMG, STORAGE_KEYS.RAW, STORAGE_KEYS.OPACITY, STORAGE_KEYS.BLUR], () => {
      removeOldSides();
      document.documentElement.style.setProperty('--bili-skin-opacity', 0.9);
      document.documentElement.style.setProperty('--bili-skin-blur', '5px');
      sendResponse({ ok: true });
    });
    return true;
  }
});

// 监听窗口变化，防抖重算
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    chrome.storage.local.get([STORAGE_KEYS.IMG], res => {
      applySides(res[STORAGE_KEYS.IMG]);
    });
  }, 150);
});
