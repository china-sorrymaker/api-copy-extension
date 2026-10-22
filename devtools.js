// Record registration attempts for diagnostics in the extension popup.
const write=(state,detail='')=>chrome.storage.local.set({lastDevtoolsState:state,lastDevtoolsDetail:detail,lastDevtoolsTime:new Date().toLocaleString(),tabId:chrome.devtools.inspectedWindow.tabId});
write('已加载 DevTools 页面，准备注册面板');
try {
 chrome.devtools.panels.create('API Copy','icon32.png','panel.html',()=>{
  const err=chrome.runtime.lastError;
  if(err){console.error('[API Copy] registration failure',err.message);write('面板注册失败',err.message)}
  else {console.info('[API Copy] panel registered');write('面板注册成功','如果标签栏未显示，请查看 DevTools 顶部 >>')}
 });
} catch(e){write('注册时发生异常',String(e));console.error(e)}
