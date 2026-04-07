// popup.js 完整替换版
// 行为：预览以 contain 完整显示图片；裁剪框可拖动/缩放；导出按裁剪框对应原图区域等比 cover 填充到目标像素

const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const imgPreview = document.getElementById('img-preview');
const opacityRange = document.getElementById('opacity-range');
const opacityVal = document.getElementById('opacity-val');
const blurRange = document.getElementById('blur-range');
const blurVal = document.getElementById('blur-val');
const resetBtn = document.getElementById('reset-btn');

let cropContainer = null;
let canvas = null;
let ctx = null;
let img = null; // 原始 Image
let imgLoaded = false;

// 图片在 canvas 上的显示参数（CSS 像素）
let imgDrawX = 0, imgDrawY = 0, imgDrawW = 0, imgDrawH = 0, imgDisplayScale = 1;

// 裁剪框（CSS 像素）
let crop = { x: 20, y: 20, w: 100, h: 100 };

// 交互状态
let dragging = false, resizing = false, activeHandle = null, dragStart = { x: 0, y: 0 };

// 平移图片模式（按空格或中键）
let panMode = false, panning = false, panStart = { x: 0, y: 0 };

// 目标真实像素（由 content 返回）
let targetW = 200, targetH = 800;

// 预览最大尺寸
const MAX_PREVIEW_W = 360;
const MAX_PREVIEW_H = 520;

// 初始化 UI 显示已有设置
chrome.storage.local.get(['biliSkinImgCropped', 'biliSkinImg', 'biliSkinOpacity', 'biliSkinBlur'], (res) => {
  if (res.biliSkinImgCropped) {
    imgPreview.style.backgroundImage = `url(${res.biliSkinImgCropped})`;
    imgPreview.textContent = '';
  } else if (res.biliSkinImg) {
    imgPreview.style.backgroundImage = `url(${res.biliSkinImg})`;
    imgPreview.textContent = '';
  }
  if (res.biliSkinOpacity) {
    opacityRange.value = res.biliSkinOpacity;
    opacityVal.innerText = res.biliSkinOpacity;
  }
  if (res.biliSkinBlur) {
    blurRange.value = res.biliSkinBlur;
    blurVal.innerText = res.biliSkinBlur;
  }
});

function sendMsgToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, () => {});
  });
}

// 创建裁剪 UI（canvas + 按钮 + 提示）
function ensureCropUI() {
  if (cropContainer) return;
  cropContainer = document.createElement('div');
  cropContainer.style.width = '100%';
  cropContainer.style.height = '260px';
  cropContainer.style.border = '1px solid #ddd';
  cropContainer.style.borderRadius = '4px';
  cropContainer.style.overflow = 'hidden';
  cropContainer.style.position = 'relative';
  cropContainer.style.marginBottom = '10px';
  cropContainer.style.background = '#111';

  const hint = document.createElement('div');
  hint.textContent = '提示：图片完整展示；拖动裁剪框选择区域；按空格或中键拖动图片以微调位置；滚轮缩放裁剪框';
  hint.style.fontSize = '12px';
  hint.style.color = '#fff';
  hint.style.padding = '6px';
  hint.style.background = 'rgba(0,0,0,0.4)';
  hint.style.position = 'absolute';
  hint.style.left = '8px';
  hint.style.top = '8px';
  hint.style.zIndex = '10';
  hint.style.borderRadius = '4px';
  cropContainer.appendChild(hint);

  canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  cropContainer.appendChild(canvas);

  const btnBar = document.createElement('div');
  btnBar.style.display = 'flex';
  btnBar.style.gap = '8px';
  btnBar.style.marginTop = '8px';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '确定并保存';
  saveBtn.style.flex = '1';
  saveBtn.style.padding = '8px';
  saveBtn.style.background = '#00A1D6';
  saveBtn.style.color = '#fff';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '4px';
  saveBtn.addEventListener('click', saveCropped);

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.flex = '1';
  cancelBtn.style.padding = '8px';
  cancelBtn.style.border = '1px solid #ddd';
  cancelBtn.style.borderRadius = '4px';
  cancelBtn.addEventListener('click', () => {
    cropContainer.remove();
    cropContainer = null;
  });

  document.body.insertBefore(cropContainer, resetBtn);
  document.body.insertBefore(btnBar, resetBtn);
  btnBar.appendChild(saveBtn);
  btnBar.appendChild(cancelBtn);

  // 事件绑定
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      panMode = true;
      canvas.style.cursor = 'grab';
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      panMode = false;
      canvas.style.cursor = 'default';
    }
  });
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTestHandles(px, py) {
  const size = 10;
  const handles = {
    tl: { x: crop.x, y: crop.y },
    tr: { x: crop.x + crop.w, y: crop.y },
    bl: { x: crop.x, y: crop.y + crop.h },
    br: { x: crop.x + crop.w, y: crop.y + crop.h },
    l: { x: crop.x, y: crop.y + crop.h / 2 },
    r: { x: crop.x + crop.w, y: crop.y + crop.h / 2 },
    t: { x: crop.x + crop.w / 2, y: crop.y },
    b: { x: crop.x + crop.w / 2, y: crop.y + crop.h }
  };
  for (const k in handles) {
    const h = handles[k];
    if (px >= h.x - size && px <= h.x + size && py >= h.y - size && py <= h.y + size) return k;
  }
  if (px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h) return 'move';
  return null;
}

function onPointerDown(e) {
  if (!imgLoaded) return;
  const p = getCanvasPos(e);
  if (panMode || e.button === 1) {
    panning = true;
    panStart.x = p.x;
    panStart.y = p.y;
    canvas.style.cursor = 'grabbing';
    return;
  }
  const hit = hitTestHandles(p.x, p.y);
  if (!hit) return;
  if (hit === 'move') {
    dragging = true;
    activeHandle = 'move';
    dragStart.x = p.x;
    dragStart.y = p.y;
  } else {
    resizing = true;
    activeHandle = hit;
    dragStart.x = p.x;
    dragStart.y = p.y;
  }
}

function onPointerMove(e) {
  if (!imgLoaded) return;
  const p = getCanvasPos(e);
  if (panning) {
    const dx = p.x - panStart.x;
    const dy = p.y - panStart.y;
    imgDrawX += dx;
    imgDrawY += dy;
    panStart.x = p.x;
    panStart.y = p.y;
    constrainImagePosition();
    render();
    return;
  }
  if (dragging && activeHandle === 'move') {
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    crop.x += dx;
    crop.y += dy;
    dragStart.x = p.x;
    dragStart.y = p.y;
    constrainCrop();
    render();
  } else if (resizing) {
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    switch (activeHandle) {
      case 'tl': crop.x += dx; crop.y += dy; crop.w -= dx; crop.h -= dy; break;
      case 'tr': crop.y += dy; crop.w += dx; crop.h -= dy; break;
      case 'bl': crop.x += dx; crop.w -= dx; crop.h += dy; break;
      case 'br': crop.w += dx; crop.h += dy; break;
      case 'l': crop.x += dx; crop.w -= dx; break;
      case 'r': crop.w += dx; break;
      case 't': crop.y += dy; crop.h -= dy; break;
      case 'b': crop.h += dy; break;
    }
    dragStart.x = p.x;
    dragStart.y = p.y;
    if (crop.w < 20) crop.w = 20;
    if (crop.h < 20) crop.h = 20;
    constrainCrop();
    render();
  } else {
    const hit = hitTestHandles(p.x, p.y);
    canvas.style.cursor = hit ? (hit === 'move' ? 'move' : 'nwse-resize') : (panMode ? 'grab' : 'default');
  }
}

function onPointerUp() {
  dragging = false;
  resizing = false;
  activeHandle = null;
  if (panning) {
    panning = false;
    canvas.style.cursor = panMode ? 'grab' : 'default';
  }
}

function onWheel(e) {
  if (!imgLoaded) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.05 : 0.95;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const newW = crop.w * delta;
  const newH = crop.h * delta;
  crop.x = cx - newW / 2;
  crop.y = cy - newH / 2;
  crop.w = newW;
  crop.h = newH;
  if (crop.w < 20) crop.w = 20;
  if (crop.h < 20) crop.h = 20;
  constrainCrop();
  render();
}

function constrainCrop() {
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  if (crop.w > cw) { crop.w = cw; crop.x = 0; }
  if (crop.h > ch) { crop.h = ch; crop.y = 0; }
  if (crop.x < 0) crop.x = 0;
  if (crop.y < 0) crop.y = 0;
  if (crop.x + crop.w > cw) crop.x = cw - crop.w;
  if (crop.y + crop.h > ch) crop.y = ch - crop.h;
}

// 允许图片在画布上完整平移：确保用户能把图片任意部分移入裁剪框
function constrainImagePosition() {
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;

  // 允许图片边缘超出画布，但保证至少裁剪框能覆盖图片任意区域
  // 计算允许的最小/最大 imgDrawX/Y，使图片不会完全移出画布
  const minX = Math.min(0, cw - imgDrawW); // 图片最左可到的位置
  const maxX = Math.max(0, cw - imgDrawW); // 图片最右可到的位置 (通常 <=0)
  const minY = Math.min(0, ch - imgDrawH);
  const maxY = Math.max(0, ch - imgDrawH);

  // 但为了让用户能把图片移到任意位置（包括把头部移入裁剪框），允许更宽松的边界：
  // 允许图片中心移出一定比例，但不让图片完全消失
  const extra = 0.9; // 允许超出比例（0.9 表示允许接近整张图片移出）
  const leftLimit = Math.min(minX, cw - imgDrawW * (1 + extra));
  const rightLimit = Math.max(maxX, imgDrawW * (1 + extra) - cw);
  const topLimit = Math.min(minY, ch - imgDrawH * (1 + extra));
  const bottomLimit = Math.max(maxY, imgDrawH * (1 + extra) - ch);

  // clamp imgDrawX/Y 到合理范围
  if (imgDrawX < leftLimit) imgDrawX = leftLimit;
  if (imgDrawX > rightLimit) imgDrawX = rightLimit;
  if (imgDrawY < topLimit) imgDrawY = topLimit;
  if (imgDrawY > bottomLimit) imgDrawY = bottomLimit;
}


function render() {
  if (!ctx || !imgLoaded) return;
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  ctx.clearRect(0, 0, cw, ch);

  // draw image using imgDrawX/Y/W/H (contain 初始化后这些已设置)
  ctx.drawImage(img, imgDrawX, imgDrawY, imgDrawW, imgDrawH);

  // dim outside crop
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.rect(crop.x, crop.y, crop.w, crop.h);
  ctx.fill('evenodd');

  // crop border and handles (same as before)
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);
  const hs = 8;
  const handles = [
    [crop.x, crop.y], [crop.x + crop.w, crop.y],
    [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h],
    [crop.x, crop.y + crop.h / 2], [crop.x + crop.w, crop.y + crop.h / 2],
    [crop.x + crop.w / 2, crop.y], [crop.x + crop.w / 2, crop.y + crop.h]
  ];
  ctx.fillStyle = '#fff';
  handles.forEach(h => ctx.fillRect(h[0] - hs/2, h[1] - hs/2, hs, hs));
}


function saveCropped() {
  if (!imgLoaded) return;
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;

  // map crop box (CSS pixels) to original image pixels
  const scaleToImg = img.width / imgDrawW;
  const sx = (crop.x - imgDrawX) * scaleToImg;
  const sy = (crop.y - imgDrawY) * scaleToImg;
  const sWidth = crop.w * scaleToImg;
  const sHeight = crop.h * scaleToImg;

  const sxClamped = Math.max(0, Math.min(img.width, sx));
  const syClamped = Math.max(0, Math.min(img.height, sy));
  const sWClamped = Math.max(1, Math.min(img.width - sxClamped, sWidth));
  const sHClamped = Math.max(1, Math.min(img.height - syClamped, sHeight));

  // target offscreen canvas
  const off = document.createElement('canvas');
  off.width = Math.max(1, targetW);
  off.height = Math.max(1, targetH);
  const offCtx = off.getContext('2d');

  // cover scale to fill target
  const scaleX = off.width / sWClamped;
  const scaleY = off.height / sHClamped;
  const scaleCover = Math.max(scaleX, scaleY);
  const drawW = sWClamped * scaleCover;
  const drawH = sHClamped * scaleCover;
  const dx = Math.round((off.width - drawW) / 2);
  const dy = Math.round((off.height - drawH) / 2);

  offCtx.drawImage(img, sxClamped, syClamped, sWClamped, sHClamped, dx, dy, drawW, drawH);
  const dataUrl = off.toDataURL('image/png');

  chrome.storage.local.set({ biliSkinImgCropped: dataUrl, biliSkinImg: dataUrl }, () => {
    sendMsgToActiveTab({ type: 'updateCroppedImg', dataUrl });
    sendMsgToActiveTab({ type: 'setImg', value: dataUrl });
    imgPreview.style.backgroundImage = `url(${dataUrl})`;
    imgPreview.textContent = '';
    if (cropContainer) {
      cropContainer.remove();
      cropContainer = null;
    }
  });
}

// upload flow: read file -> request side size -> setup preview canvas to preserve target ratio -> draw image using contain -> init crop box
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const base64 = ev.target.result;
    imgPreview.style.backgroundImage = `url(${base64})`;
    imgPreview.textContent = '';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'getSideSize' }, (res) => {
        targetW = (res && res.sideW) ? res.sideW : 200;
        targetH = (res && res.vh) ? res.vh : 800;

        ensureCropUI();

        // compute preview display size preserving target ratio
        const scale = Math.min(MAX_PREVIEW_W / targetW, MAX_PREVIEW_H / targetH, 1);
        const displayW = Math.max(120, Math.round(targetW * scale));
        const displayH = Math.max(80, Math.round(targetH * scale));

        // set CSS size and internal pixels for DPR
        canvas.style.width = displayW + 'px';
        canvas.style.height = displayH + 'px';
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(displayW * dpr);
        canvas.height = Math.round(displayH * dpr);
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // load image and draw using contain so whole image is visible
        img = new Image();
        img.onload = () => {
          imgLoaded = true;
                  // 1. 计算预览显示尺寸：按图片本身比例优先（完整展示整图）
          const imgRatio = img.width / img.height;
          // 限制预览最大尺寸（popup 内）
          const maxW = 360;
          const maxH = 520;
          let displayW = maxW;
          let displayH = Math.round(displayW / imgRatio);
          if (displayH > maxH) {
            displayH = maxH;
            displayW = Math.round(displayH * imgRatio);
          }
          // 最小限制
          displayW = Math.max(120, displayW);
          displayH = Math.max(80, displayH);

          // 2. 设置 canvas CSS 尺寸与内部像素（支持 DPR）
          canvas.style.width = displayW + 'px';
          canvas.style.height = displayH + 'px';
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.round(displayW * dpr);
          canvas.height = Math.round(displayH * dpr);
          ctx = canvas.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          // 3. 用 contain 策略把整张图片完整显示并居中（初始）
          // 计算 scale 使整图可见（contain）
          const scaleContain = Math.min(displayW / img.width,         displayH / img.height);
          imgDisplayScale = scaleContain;
          imgDrawW = img.width * imgDisplayScale;
          imgDrawH = img.height * imgDisplayScale;
          imgDrawX = (displayW - imgDrawW) / 2;
          imgDrawY = (displayH - imgDrawH) / 2;

          // 4. 初始化裁剪框为目标比例中心区域（保持 target 比例）
          const targetRatio = targetW / Math.max(1, targetH);
          let cw = displayW * 0.7;
          let ch = cw / targetRatio;
          if (ch > displayH * 0.9) {
            ch = displayH * 0.9;
            cw = ch * targetRatio;
          }
          crop.w = cw;
          crop.h = ch;
          crop.x = (displayW - crop.w) / 2;
          crop.y = (displayH - crop.h) / 2;

          render();
        };
        img.src = base64;
      });
    });
  };
  reader.readAsDataURL(file);
});

// opacity & blur handlers
opacityRange.addEventListener('input', (e) => {
  const val = e.target.value;
  opacityVal.innerText = val;
  chrome.storage.local.set({ biliSkinOpacity: val });
  sendMsgToActiveTab({ type: 'setOpacity', value: val });
});
blurRange.addEventListener('input', (e) => {
  const val = e.target.value;
  blurVal.innerText = val;
  chrome.storage.local.set({ biliSkinBlur: val });
  sendMsgToActiveTab({ type: 'setBlur', value: val });
});

// reset
resetBtn.addEventListener('click', () => {
  chrome.storage.local.remove(['biliSkinImgCropped', 'biliSkinImg', 'biliSkinOpacity', 'biliSkinBlur'], () => {
    sendMsgToActiveTab({ type: 'reset' });
    imgPreview.style.backgroundImage = 'none';
    imgPreview.textContent = '暂无预览';
    opacityRange.value = 0.9;
    opacityVal.innerText = 0.9;
    blurRange.value = 5;
    blurVal.innerText = 5;
    if (cropContainer) {
      cropContainer.remove();
      cropContainer = null;
    }
  });
});
