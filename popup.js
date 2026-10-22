chrome.storage.local.get(['lastDevtoolsState','lastDevtoolsDetail','lastDevtoolsTime','tabId'], s=>{
 document.getElementById('status').textContent=s.lastDevtoolsState ? `${s.lastDevtoolsState}\n${s.lastDevtoolsDetail||''}\n时间：${s.lastDevtoolsTime}\n标签ID：${s.tabId??'未知'}` : '尚未检测到 DevTools 页面启动。\n请在普通网页关闭并重新打开 F12 后再次查看。';
});