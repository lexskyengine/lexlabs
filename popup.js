<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>B站皮肤</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 280px; padding: 15px; font-size: 14px; color: #333; }
    .title { font-weight: bold; margin-bottom: 10px; text-align: center; }
    .btn-upload { display: block; width: 100%; padding: 8px; background: #00A1D6; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 15px; }
    .btn-upload:hover { background: #00B8FF; }
    .item { margin-bottom: 10px; }
    .item label { display: block; margin-bottom: 5px; }
    input[type="range"] { width: 100%; cursor: pointer; }
    .btn-reset { width: 100%; padding: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; margin-top: 10px; }
    .btn-reset:hover { background: #eee; }
    #img-preview { width: 100%; height: 120px; border: 1px dashed #ddd; border-radius: 4px; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; color: #999; background-size: cover; background-position: center; }
  </style>
</head>
<body>
  <div class="title">B站皮肤助手</div>
  <div id="img-preview">暂无预览</div>
  <input type="file" id="file-input" accept="image/*" style="display: none;">
  <button class="btn-upload" id="upload-btn">选择本地背景图</button>
  <div class="item">
    <label>内容透明度：<span id="opacity-val">0.9</span></label>
    <input type="range" id="opacity-range" min="0" max="1" step="0.05" value="0.9">
  </div>
  <div class="item">
    <label>背景模糊度：<span id="blur-val">5</span>px</label>
    <input type="range" id="blur-range" min="0" max="20" step="1" value="5">
  </div>
  <button class="btn-reset" id="reset-btn">恢复默认皮肤</button>

  <script src="popup.js"></script>
</body>
</html>
