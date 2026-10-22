'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

function entry(status=0,ms='000'){
 return {_resourceType:'xhr',startedDateTime:`2026-10-22T10:00:00.${ms}Z`,time:status?5508:0,request:{method:'POST',url:'https://example.test/api/page',headers:[],postData:{text:'{"current":1}'}},response:{status,content:{mimeType:status?'application/json':'x-unknown'}}};
}
function panel(){
 const nodes=new Map(),snapshots=[];
 let finished;
 class Element{
  constructor(){this.value='';this.children=[];this.listeners={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.clientWidth=1000}
  addEventListener(name,fn){this.listeners[name]=fn}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=children}
  setAttribute(){}
  querySelector(){return new Element()}
  focus(){}
  getBoundingClientRect(){return {width:1000,left:0}}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const storage=new Map();
 const context=vm.createContext({URL,URLSearchParams,console,setInterval(){},setTimeout(){return 1},clearTimeout(){},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  navigator:{clipboard:{writeText:async()=>{}}},window:{getSelection:()=>null,addEventListener(){}},
  document:{getElementById:node,querySelector:node,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),addEventListener(){}},
  chrome:{runtime:{},devtools:{network:{getHAR:callback=>snapshots.push(callback),onRequestFinished:{addListener:callback=>{finished=callback}}}}}
 });
 for(const name of ['format.js','json-tree.js','panel.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
 const evaluate=code=>vm.runInContext(code,context);
 return {
  node,evaluate,
  poll(entries){if(!snapshots.length)evaluate('reconcile()');assert.equal(snapshots.length,1);snapshots.shift()({entries})},
  beginPoll(){evaluate('reconcile()');assert.equal(snapshots.length,1)},
  finish:har=>finished(har),
  select(index){evaluate(`selectedId=records[${index}].id;render()`);},
  records(){return JSON.parse(evaluate('JSON.stringify(records.map(r=>({id:r.id,status:APIFormat.status(r),anomalous:APIFormat.anomalous(r),finished:r.finished,responseLoaded:r.responseLoaded,responseText:r.responseText})))'))}
 };
}

test('HAR 加载中为 waiting，完成事件在原记录上更新为 200 并保留选中项',()=>{
 const p=panel(),pending=entry();
 pending.response.content.text='';
 let reads=0;pending.getContent=()=>{reads++};
 p.poll([pending]);
 const id=p.records()[0].id;
 assert.equal(p.records()[0].status,'waiting');
 assert.equal(p.records()[0].anomalous,false);
 assert.equal(p.records()[0].responseLoaded,false);
 assert.equal(reads,0);
 p.select(0);
 assert.equal(p.node('status').textContent,'waiting');
 assert.equal(p.node('output').textContent,'请求进行中，等待响应…');
 const success=entry(200);success.response.content.text='{"code":200,"success":true}';
 p.finish(success);
 assert.equal(p.records().length,1);
 assert.equal(p.records()[0].id,id);
 assert.equal(p.node('status').textContent,'200');
 assert.equal(p.evaluate('selectedId'),id);
 assert.equal(p.records()[0].responseLoaded,true);
});

test('晚到的 waiting 快照不会回退已完成状态，也不会创建第二条记录',()=>{
 const p=panel();p.poll([entry()]);
 const id=p.records()[0].id;
 p.beginPoll();
 p.finish(entry(200));
 p.poll([entry()]);
 assert.deepEqual(p.records().map(r=>({id:r.id,status:r.status})),[{id,status:'200'}]);
 p.poll([entry(200)]);
 assert.equal(p.records()[0].id,id);
 assert.equal(p.records().length,1);
});

test('仅通过 HAR 观察到的 0 → 200 也在原记录上更新',()=>{
 const p=panel();p.poll([entry()]);
 const id=p.records()[0].id;
 p.poll([entry(200)]);
 assert.equal(p.records().length,1);
 assert.equal(p.records()[0].id,id);
 assert.equal(p.records()[0].status,'200');
});

test('status=0 必须有明确失败或完成事件才标 ERR，仅异常不展示 waiting',()=>{
 const p=panel();p.poll([entry()]);
 p.node('failedOnly').checked=true;p.node('failedOnly').listeners.change();
 assert.ok(p.node('count').textContent.includes('显示 0 条'));
 const failed=entry();failed.response._error='net::ERR_CONNECTION_REFUSED';
 p.poll([failed]);
 assert.equal(p.records()[0].status,'ERR');
 assert.equal(p.records()[0].anomalous,true);
 assert.ok(p.node('count').textContent.includes('显示 1 条'));
 const q=panel();q.poll([entry()]);q.finish(entry());
 assert.equal(q.records().length,1);
 assert.equal(q.records()[0].status,'ERR');
 q.poll([entry()]);
 assert.equal(q.records()[0].status,'ERR');
});

test('HTTP 500 为最终异常，不与 loading 混淆',()=>{
 const p=panel();p.poll([entry()]);p.finish(entry(500));
 assert.equal(p.records().length,1);
 assert.equal(p.records()[0].status,'500');
 assert.equal(p.records()[0].anomalous,true);
});

test('同接口并发请求按开始时间分别保留，完成时只更新对应记录',()=>{
 const p=panel();p.poll([entry(0,'001'),entry(0,'002')]);
 const ids=p.records().map(r=>r.id);
 p.finish(entry(200,'002'));
 assert.deepEqual(p.records().map(r=>r.status),['waiting','200']);
 p.finish(entry(200,'001'));
 assert.deepEqual(p.records().map(r=>r.id),ids);
 assert.deepEqual(p.records().map(r=>r.status),['200','200']);
});

test('开始时间相同的 HAR 项仍按出现次数保留，不合并真实请求',()=>{
 const p=panel();p.poll([entry(),entry()]);
 const ids=p.records().map(r=>r.id);
 p.finish(entry(200));p.finish(entry(200));
 assert.deepEqual(p.records().map(r=>r.id),ids);
 assert.deepEqual(p.records().map(r=>r.status),['200','200']);
 p.poll([entry(200),entry(200)]);
 assert.equal(p.records().length,2);
});

test('清空 waiting 请求后，其完成事件和最终 HAR 不会将它重新加入',()=>{
 const p=panel();p.poll([entry()]);
 p.node('clear').listeners.click();
 p.finish(entry(200));p.poll([entry(200)]);
 assert.equal(p.records().length,0);
});

test('响应正文只在结束后读取，重复完成通知不新增记录',()=>{
 const p=panel();p.poll([entry()]);
 let callback,reads=0;
 const success=entry(200);success.getContent=cb=>{reads++;callback=cb};
 p.finish(success);
 assert.equal(reads,1);
 callback('{"code":200,"data":{"total":10}}','');
 p.finish(success);
 assert.equal(p.records().length,1);
 assert.equal(JSON.parse(p.records()[0].responseText).data.total,10);
});
