'use strict';
const $=id=>document.getElementById(id);
const settingsMenu=$('settingsMenu');
function closeSettings(){settingsMenu.open=false;settingsMenu.querySelector('summary').focus()}
$('closeSettings').addEventListener('click',closeSettings);
document.addEventListener('click',e=>{if(settingsMenu.open&&!settingsMenu.contains(e.target))settingsMenu.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsMenu.open)closeSettings()});
const records=[];
let selectedId=null;
let serial=0;
const MAX=300;
// 只保留真正的接口请求（Fetch/XHR）。部分框架将请求标注为 other，
// 因此同时参考 MIME / Accept；明确排除静态资源和文档加载。
const STATIC_EXT = /\.(?:js|mjs|css|map|html?|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf|avif|mp4|webm|mp3|wasm)(?:$|[?#])/i;
function isApi(entry) {
  if (!entry?.request?.url) return false;
  const url = entry.request.url;
  if (/^(?:data:|blob:|chrome:|devtools:)/i.test(url) || STATIC_EXT.test(url)) return false;
  const type = String(entry._resourceType || entry._type || '').toLowerCase();
  if (['script','stylesheet','image','font','document','media','manifest'].includes(type)) return false;
  if (type === 'xhr' || type === 'fetch') return true;
  const mime = String(entry.response?.content?.mimeType || '').toLowerCase();
  const accept = (entry.request.headers || []).find(h => h.name?.toLowerCase()==='accept')?.value?.toLowerCase() || '';
  const reqMime = String(entry.request?.postData?.mimeType || '').toLowerCase();
  return /(json|graphql|xml|event-stream)/.test(mime) || /(json|graphql)/.test(accept) || /(json|x-www-form-urlencoded|multipart\/form-data)/.test(reqMime);
}
function signature(e) { return [e.startedDateTime || '',e.request?.method || '',e.request?.url || '',e.response?.status ?? ''].join('\u001f'); }
const suppressed=new Set();
let reconcileRunning=false;
let initialized=false;
function makeRecord(har) {
 const text=har.response?.content?.text;
 return {id:++serial,har,responseText:typeof text==='string'?text:'',responseLoaded:typeof text==='string',contentType:har.response?.content?.mimeType||'',missing:0,source:har,responseError:'',loading:false};
}

function hasActiveSelection() {
 const sel = window.getSelection();
 return Boolean(sel && !sel.isCollapsed && sel.toString().trim().length > 0);
}

// 提取接口尾部核心路径（默认取最后 2 级，方便一眼区分接口），同时保留完整路径供选中复制
function parseDisplayPath(rawUrl) {
 let pathname = rawUrl;
 try {
  const u = new URL(rawUrl);
  pathname = u.pathname;
 } catch {}
 const segments = pathname.split('/').filter(Boolean);
 if (segments.length > 2) {
  return {
   tail: '/' + segments.slice(-2).join('/'),
   full: pathname
  };
 }
 return {
  tail: pathname,
  full: ''
 };
}

function reconcile() {
 if(reconcileRunning) return;
 // 如果用户正在用鼠标划选左侧或右侧的文本，暂缓本次 DOM 重绘，防止选中高亮丢失
 if(hasActiveSelection() && initialized) return;
 reconcileRunning=true;
 chrome.devtools.network.getHAR(log=>{
  reconcileRunning=false;
  if(chrome.runtime.lastError || !log?.entries) return;
  const entries=log.entries.filter(isApi);
  for(const r of records){if(!r.responseLoaded && !r.loading){const matched=entries.find(e=>signature(e)===signature(r.har)&&typeof e.getContent==='function');if(matched)loadResponse(r,matched);}}
  const live=new Map();
  for(const e of entries) live.set(signature(e),(live.get(signature(e))||0)+1);
  for(const sig of [...suppressed]) if(!live.has(sig)) suppressed.delete(sig);
  // 从 HAR 中恢复当前请求，不依赖面板是否在请求开始时打开。
  const represented=new Map();
  for(const r of records) represented.set(signature(r.har),(represented.get(signature(r.har))||0)+1);
  let changed=false;
  for(const e of entries){
   const key=signature(e);const n=represented.get(key)||0;
   const total=live.get(key)||0;
   if(n>=total || suppressed.has(key)) continue;
   const r=makeRecord(e);records.push(r);if(typeof e.getContent==='function')loadResponse(r,e);represented.set(key,n+1);changed=true;
  }
  for(let i=records.length-1;i>=0;i--){
   const r=records[i],sig=signature(r.har);
   const count=live.get(sig)||0;
   const seen=records.slice(0,i+1).filter(x=>signature(x.har)===sig).length;
   if(seen<=count){r.missing=0;continue;}
   r.missing=(r.missing||0)+1;
   if(r.missing>=2){records.splice(i,1);changed=true;}
  }
  if(records.length>MAX){records.splice(0,records.length-MAX);changed=true;}
  if(selectedId!==null&&!records.some(r=>r.id===selectedId)){selectedId=null;changed=true;}
  if((changed && !hasActiveSelection()) || !initialized)render();
  initialized=true;
 });
}

function getRecord(){return records.find(r=>r.id===selectedId)}
function formatInput(r){return APIFormat.input(r.har)}
function formatOutput(r){return APIFormat.response(r)}
function formatAll(r){return APIFormat.full(r)}
let feedbackTimer;
function showFeedback(message,error=false){
 clearTimeout(feedbackTimer);$('feedback').textContent=message;$('feedback').className=error?'error':'';
 feedbackTimer=setTimeout(()=>{$('feedback').textContent=''},3000);
}
async function copyText(value){try{await navigator.clipboard.writeText(value);showFeedback('✓ 已复制到剪贴板')}catch(e){showFeedback(`复制失败：${e.message}`,true)}}
function render(){const filter=$('filter').value.toLowerCase().trim(),bad=$('failedOnly').checked;const match=records.filter(r=>(!bad||APIFormat.anomalous(r))&&(!filter||`${r.har.request.method} ${r.har.request.url} ${r.har.response.status}`.toLowerCase().includes(filter)));$('count').textContent=`已捕获 ${records.length} 条 · 显示 ${match.length} 条`;
 const frag=document.createDocumentFragment();
 for(const r of [...match].reverse()){
  const row=document.createElement('div');row.className='request-row'+(r.id===selectedId?' active':'');
  // 使用 div 替代 button，彻底放开浏览器原生鼠标划选复制文本能力
  const item=document.createElement('div');item.className='request';item.tabIndex=0;item.title=APIFormat.url(r.har.request.url);
  const line=document.createElement('div');line.className='line';
  const m=document.createElement('span');m.className='code';m.textContent=r.har.request.method;

  const pathBox=document.createElement('div');pathBox.className='path-box';
  const {tail, full}=parseDisplayPath(r.har.request.url);
  const pTail=document.createElement('div');pTail.className='path-tail';pTail.textContent=tail;
  pathBox.append(pTail);
  if(full){
   const pFull=document.createElement('div');pFull.className='path-full';pFull.textContent=full;
   pathBox.append(pFull);
  }

  const st=document.createElement('span');st.className='code '+(APIFormat.anomalous(r)?'error':'ok');st.textContent=String(r.har.response.status||'ERR')+(APIFormat.businessError(r)?' !':'');
  line.append(m,pathBox,st);item.append(line);
  item.addEventListener('click',()=>{
   // 如果用户是在划选复制 URL 文字，松开鼠标时不触发列表重绘，避免选中态丢失
   if(hasActiveSelection()) return;
   selectedId=r.id;render();
  });
  item.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedId=r.id;render();}
  });
  const copy=document.createElement('button');copy.type='button';copy.className='request-copy';copy.title='一键复制完整信息（URL、入参、返回值）';copy.setAttribute('aria-label','复制该请求完整信息');copy.textContent='复制';
  copy.addEventListener('click',async()=>{await copyText(formatAll(r));});
  row.append(item,copy);frag.append(row);
 }
 $('requests').replaceChildren(frag);
 const r=getRecord();$('placeholder').hidden=Boolean(r);$('selected').hidden=!r;if(!r)return;
 $('method').textContent=r.har.request.method;$('url').textContent=APIFormat.url(r.har.request.url);
 $('status').textContent=r.har.response.status||'ERR';$('status').className='status-pill '+(APIFormat.anomalous(r)?'error':'ok');
 $('timing').textContent=Math.round(r.har.time||0)+' ms';
 $('input').textContent=formatInput(r);$('output').textContent=formatOutput(r);renderTree(r);}
function loadResponse(r,req){
 if(!req || typeof req.getContent!=='function'||r.loading)return;
 r.loading=true;r.responseError='';
 try{req.getContent((body,encoding)=>{
  r.loading=false;
  if(typeof body==='string'){
   if(encoding==='base64'){
    try{const binary=atob(body);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      if(/json|text|xml|javascript/i.test(r.contentType||''))r.responseText=new TextDecoder('utf-8').decode(bytes);
      else r.responseText='(二进制内容，无法用文本展示)';
    }catch{r.responseText='(Base64 响应解码失败)'}
   }else r.responseText=body;
   r.responseLoaded=true;
  }else r.responseError='Chrome 未返回响应正文（可能已被清理或请求未完成）';
  if(selectedId===r.id&&!hasActiveSelection())render();
 })}catch(e){r.loading=false;r.responseError=String(e.message||e);}
}
function renderTree(r){
 const tree=$('outputTree'),out=$('output');tree.replaceChildren();
 if(!r.responseLoaded){tree.hidden=true;out.hidden=false;out.textContent=r.responseError||'（响应暂不可读，可点击「重试读取响应」）';return;}
 let obj;try{obj=JSON.parse(r.responseText)}catch{tree.hidden=true;out.hidden=false;return;}
 if(!obj || typeof obj!=='object'){tree.hidden=true;out.hidden=false;return;}
 tree.hidden=false;out.hidden=true;
 function add(parent,value,key,depth){
  if(depth>20){const node=document.createElement('div');node.textContent=key+': [深层数据省略]';parent.append(node);return;}
  const name=key===null?'':key+': ';
  if(value&&typeof value==='object'){
   const details=document.createElement('details');details.open=depth<2;
   const summary=document.createElement('summary');summary.textContent=name+(Array.isArray(value)?`Array(${value.length})`:`Object(${Object.keys(value).length})`);
   details.append(summary);parent.append(details);
   const entries=Object.entries(value);for(const [k,v] of entries) add(details,v,k,depth+1);
  }else{const leaf=document.createElement('div');leaf.className='json-leaf';
   leaf.textContent=name+JSON.stringify(value);parent.append(leaf);}
 }
 add(tree,APIFormat.clean(obj),null,0);
}
$('expandJson').addEventListener('click',()=>document.querySelectorAll('#outputTree details').forEach(el=>el.open=true));
$('collapseJson').addEventListener('click',()=>document.querySelectorAll('#outputTree details').forEach(el=>el.open=false));
$('retryResponse').addEventListener('click',()=>{const r=getRecord();if(r){r.responseError='';loadResponse(r,r.source);}});
const maskDefaults={prefix:4,suffix:4,mask:8,maskedHeaders:''};let savedMask=maskDefaults;
try{savedMask={...maskDefaults,...JSON.parse(localStorage.getItem('api-copy-mask-config')||'{}')}}catch{}
function updateMaskPreview(){$('maskPreview').textContent='crypto '+APIFormat.maskToken('UYx/abcdefghijklmnopqrstuvrGA==')}
function saveMask(){
 const c={prefix:Number($('maskPrefix').value),suffix:Number($('maskSuffix').value),mask:Number($('maskCount').value),maskedHeaders:$('maskedHeaders').value.trim()};
 c.prefix=Math.max(0,Math.min(12,c.prefix));c.suffix=Math.max(0,Math.min(12,c.suffix));c.mask=Math.max(1,Math.min(32,c.mask));
 try{localStorage.setItem('api-copy-mask-config',JSON.stringify(c));updateMaskPreview()}
 catch(e){showFeedback('设置保存失败：'+e.message,true)}
}
for(const [id,k] of [['maskPrefix','prefix'],['maskSuffix','suffix'],['maskCount','mask'],['maskedHeaders','maskedHeaders']]){
 if(k==='maskedHeaders'&&typeof savedMask[k]!=='string')savedMask[k]='';
 $(id).value=savedMask[k];$(id).addEventListener('input',saveMask);$(id).addEventListener('change',saveMask);
}
updateMaskPreview();
chrome.devtools.network.onRequestFinished.addListener(har=>{
 if(!isApi(har) || suppressed.has(signature(har))) return;
 const sig=signature(har);
 let r=records.find(x=>signature(x.har)===sig);
 if(!r){r=makeRecord(har);records.push(r);if(records.length>MAX)records.shift();}
 else {r.har=har;r.source=har;}
 if(!hasActiveSelection()) render();
 loadResponse(r,har);
});
// API 没有 Network 清空事件：按 HAR 当前快照尽力同步，连续两次缺失才删除。
reconcile();
setInterval(reconcile,1200);
$('filter').addEventListener('input',render);$('failedOnly').addEventListener('change',render);$('clear').addEventListener('click',()=>{for(const r of records)suppressed.add(signature(r.har));records.length=0;selectedId=null;$('feedback').textContent='';render()});
$('copyAll').addEventListener('click',()=>{const r=getRecord();if(r)copyText(formatAll(r))});$('copyCompact').addEventListener('click',()=>{const r=getRecord();if(r)copyText(APIFormat.compact(r))});$('copyUrl').addEventListener('click',()=>{const r=getRecord();if(r)copyText(APIFormat.url(r.har.request.url))});$('copyUri').addEventListener('click',()=>{const r=getRecord();if(r)copyText(APIFormat.uri(r.har.request.url))});$('copyInput').addEventListener('click',()=>{const r=getRecord();if(r)copyText(APIFormat.copyInput(r.har))});$('copyOutput').addEventListener('click',()=>{const r=getRecord();if(r)copyText(formatOutput(r))});
render();


// 可拖动左右分栏：保存相对比例，窗口调整时保持用户选择。
const splitLayout = document.querySelector('.layout');
const splitter = $('splitter');
const SPLIT_KEY = 'api-copy-list-width-v1';
const MIN_LIST = 150;
const MIN_DETAIL = 260;
const SPLIT_SIZE = 7;
const DEFAULT_RATIO = 0.28;
let splitRatio = DEFAULT_RATIO;
try { const saved = Number(localStorage.getItem(SPLIT_KEY)); if (saved > 0 && saved < 1) splitRatio = saved; } catch (_) {}
function applySplit(ratio, save = false) {
  const total = splitLayout.getBoundingClientRect().width;
  if (total <= 0) return;
  const available = Math.max(0, total - SPLIT_SIZE);
  // 极窄面板采用比例退让，避免整个布局挤出可视区域。
  const lower = Math.min(MIN_LIST, Math.max(80, available * .30));
  const upper = available - Math.min(MIN_DETAIL, Math.max(100, available * .45));
  const px = Math.max(lower, Math.min(Math.max(lower, upper), available * ratio));
  splitRatio = available ? px / available : DEFAULT_RATIO;
  splitLayout.style.setProperty('--list-width', px + 'px');
  splitter.setAttribute('aria-valuenow', String(Math.round(splitRatio * 100)));
  splitter.setAttribute('aria-valuetext', '左侧宽度 ' + Math.round(splitRatio * 100) + '%');
  if (save) { try { localStorage.setItem(SPLIT_KEY, String(splitRatio)); } catch (_) {} }
}
let dragging = false;
splitter.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  dragging = true;
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('dragging');
  document.body.classList.add('resizing');
  e.preventDefault();
});
splitter.addEventListener('pointermove', e => {
  if (!dragging) return;
  const rect = splitLayout.getBoundingClientRect();
  applySplit((e.clientX - rect.left) / Math.max(1, rect.width - SPLIT_SIZE));
});
function endDragging() {
  if (!dragging) return;
  dragging = false;
  splitter.classList.remove('dragging');
  document.body.classList.remove('resizing');
  applySplit(splitRatio, true);
}
splitter.addEventListener('pointerup', endDragging);
splitter.addEventListener('pointercancel', endDragging);
splitter.addEventListener('lostpointercapture', endDragging);
splitter.addEventListener('dblclick', () => applySplit(DEFAULT_RATIO, true));
splitter.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home') return;
  e.preventDefault();
  if (e.key === 'Home') return applySplit(DEFAULT_RATIO, true);
  const width = Math.max(1, splitLayout.clientWidth - SPLIT_SIZE);
  const delta = (e.shiftKey ? 50 : 15) / width * (e.key === 'ArrowRight' ? 1 : -1);
  applySplit(splitRatio + delta, true);
});
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => applySplit(splitRatio)).observe(splitLayout);
else window.addEventListener('resize', () => applySplit(splitRatio));
applySplit(splitRatio);
