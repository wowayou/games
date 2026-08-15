// ============================================================
//  game.js —— 引导层：动态载入主模块，CDN 失败时给出可读提示
// ============================================================

const loading = document.getElementById('loading');

try {
  const { boot } = await import('./main.js');
  await boot();
} catch (err) {
  console.error(err);
  if (loading) {
    loading.classList.remove('done');
    loading.innerHTML =
      '<div style="max-width:420px;text-align:center;line-height:2;letter-spacing:1px">' +
      '<div style="color:#ff2aa8;font-size:22px;margin-bottom:14px">连接失败</div>' +
      '无法从 CDN 加载 three.js。<br>' +
      '请检查网络后刷新页面。<br>' +
      '<span style="color:#4a5a6b;font-size:9px" id="dshErrDetail"></span>' +
      '</div>';
    var errEl = document.getElementById('dshErrDetail');
    if (errEl) errEl.textContent = String(err.message || err).slice(0, 160);
  }
}
