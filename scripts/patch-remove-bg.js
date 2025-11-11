const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'remove-bg', 'index.html');
let html = fs.readFileSync(file, 'utf8');
let changed = false;
function ensurePickButton(){
  if(html.includes('id="pick"')) return;
  const needle = '<div class="drop" id="drop">???????????</div>';
  if(html.includes(needle)){
    html = html.replace(needle, needle + '\n        <button id="pick" class="btn" style="margin-top:8px">????</button>');
    changed = true;
  }
}
function ensureErrBox(){
  if(html.includes('id="err"')) return;
  html = html.replace('<h3>??</h3>', '<h3>??</h3>\n        <div id="err" class="small" style="color:#fca5a5;display:none"></div>');
  changed = true;
}
function appendHelperScript(){
  if(html.includes('// === Upload UX helper ===')) return;
  const helper = `\n<script>\n// === Upload UX helper ===\n(function(){\n  const pickBtn = document.querySelector('#pick');\n  const fileInput = document.querySelector('#file');\n  const errBox = document.querySelector('#err');\n  const drop = document.querySelector('#drop');\n  if(pickBtn && fileInput){ pickBtn.addEventListener('click', ()=> fileInput.click()); }\n  if(drop){\n    drop.addEventListener('drop', (e)=>{ if(!(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)){ alert('?????????????????'); } }, { capture:true });\n  }\n  // Soft validate by extension for rare mime cases\n  if(!window.isLikelyImageExt){ window.isLikelyImageExt = function(name){ return /\\.(png|jpe?g|webp|gif|bmp|tiff?|heic|heif)$/i.test(name||''); }; }\n})();\n// === Upload UX helper end ===\n</script>\n`;
  html = html.replace('</body>', helper + '</body>');
  changed = true;
}
ensurePickButton();
ensureErrBox();
appendHelperScript();
if(changed){ fs.writeFileSync(file, html, 'utf8'); console.log('PATCHED'); } else { console.log('NOCHANGE'); }
