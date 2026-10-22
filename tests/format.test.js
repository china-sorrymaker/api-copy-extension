'use strict';
const assert=require('node:assert/strict');
const {test,beforeEach}=require('node:test');
const APIFormat=require('../format.js');
let config;
global.localStorage={getItem:()=>config};
beforeEach(()=>{config=null});

function record(headers){
 return {har:{request:{method:'POST',url:'https://example.test/api/page',headers},response:{status:200},time:20},responseLoaded:true,responseText:'{"code":200,"data":{"author":"Alice"}}',contentType:'application/json'};
}
const header=(name,value)=>({name,value});
const secret='ABCD0123456789abcdefghijklmnopqrstuvwxyzWXYZ';
const masked='ABCD********WXYZ';

test('普通头和普通业务头默认明文，prolink-Auth crypto 自动脱敏',()=>{
 const r=record([header('Accept','application/json'),header('Content-Type','application/json'),header('User-Agent','Browser/1.0'),header('prolink-Auth','crypto '+secret),header('company-ticket',secret),header('prolink-Language','zh-CN')]);
 assert.equal(APIFormat.headers(r.har),`Accept: application/json\nContent-Type: application/json\nUser-Agent: Browser/1.0\nprolink-Auth: crypto ${masked}\ncompany-ticket: ${secret}\nprolink-Language: zh-CN`);
});

test('额外脱敏名单采用忽略大小写的完整名称匹配，支持常见分隔符',()=>{
 config=JSON.stringify({maskedHeaders:' PROLINK-language，Operate-Menu-Id; x-business\nother-business；last-business '});
 for(const name of ['prolink-Language','operate-menu-id','X-Business','other-business','last-business']){
  assert.equal(APIFormat.headers(record([header(name,secret)]).har),`${name}: ${masked}`);
 }
 assert.equal(APIFormat.headers(record([header('X-Business-Extra',secret)]).har),`X-Business-Extra: ${secret}`);
 config=JSON.stringify({maskedHeaders:'*'});
 assert.equal(APIFormat.headers(record([header('unknown',secret)]).har),`unknown: ${secret}`);
});

test('敏感名称不能被明文配置覆盖，兼容大小写和命名变体',()=>{
 const names=['prolink-Auth','X_AUTH','XAuth','customToken','access_token','Api.Key','SESSION-ID','client_secret','password','credentials','Authorization','Proxy-Authorization'];
 config=JSON.stringify({plainHeaders:names.join(',')});
 for(const name of names){
  assert.equal(APIFormat.headers(record([header(name,secret)]).har),`${name}: ${masked}`);
 }
});

test('认证前缀自动脱敏，无需配置头名，保留前缀而遮盖凭据',()=>{
 for(const scheme of ['Bearer','Basic','Token','crypto','CRYPTO']){
  for(const name of ['Authorization','prolink-Auth','company-ticket','Accept']){
   assert.equal(APIFormat.headers(record([header(name,scheme+' '+secret)]).har),`${name}: ${scheme} ${masked}`);
  }
 }
});

test('Cookie 逐项脱敏，短值不泄漏；明文配置不能放行 Cookie',()=>{
 config=JSON.stringify({plainHeaders:'Cookie, Set-Cookie'});
 for(const name of ['Cookie','Set-Cookie']){
  assert.equal(APIFormat.headers(record([header(name,`sid=${secret}; short=abc; empty=; HttpOnly`)]).har),`${name}: sid=${masked}; short=[REDACTED]; empty=[REDACTED]; [REDACTED]`);
 }
});

test('兼容旧配置，零保留、短值和自定义星号数量正确',()=>{
 config=JSON.stringify({prefix:0,suffix:0,mask:6});
 assert.equal(APIFormat.headers(record([header('prolink-Auth','crypto '+secret)]).har),'prolink-Auth: crypto ******');
 assert.equal(APIFormat.maskToken('ab'),'[REDACTED]');
 config=JSON.stringify({prefix:2,suffix:0,mask:3,plainHeaders:'prolink-Language'});
 assert.equal(APIFormat.maskToken(secret),'AB***');
 assert.equal(APIFormat.headers(record([header('prolink-Language','zh-CN')]).har),'prolink-Language: zh-CN');
 config=JSON.stringify({prefix:0,suffix:2,mask:3});
 assert.equal(APIFormat.maskToken(secret),'***YZ');
});

test('配置缺失、损坏或无法读取时，内置敏感规则仍生效',()=>{
 for(const value of [null,'{broken','null','{"maskedHeaders":[]}']){
  config=value;
  assert.equal(APIFormat.headers(record([header('prolink-Auth',secret)]).har),`prolink-Auth: ${masked}`);
 }
 const storage=global.localStorage;
 try{
  global.localStorage={getItem:()=>{throw new Error('unavailable')}};
  assert.equal(APIFormat.headers(record([header('prolink-Auth',secret)]).har),`prolink-Auth: ${masked}`);
 }finally{global.localStorage=storage}
});

test('所有包含请求头的复制格式均脱敏且不修改原始 HAR',()=>{
 config=JSON.stringify({maskedHeaders:'company-ticket'});
 const r=record([header('prolink-Auth','crypto '+secret),header('company-ticket',secret),header('Cookie','sid='+secret)]);
 const original=JSON.stringify(r);
 for(const format of [APIFormat.full,APIFormat.compact]){
  const text=format(r);
  assert.ok(text.includes('prolink-Auth: crypto '+masked));
  assert.ok(text.includes('company-ticket: '+masked));
  assert.ok(text.includes('Cookie: sid='+masked));
  assert.ok(!text.includes(secret));
 }
 assert.equal(JSON.stringify(r),original);
 assert.equal(APIFormat.response(r),JSON.stringify({code:200,data:{author:'Alice'}},null,2));
});

test('普通 URL 请求头中的敏感查询参数继续脱敏',()=>{
 const r=record([header('Referer','https://example.test/page?token='+secret+'&page=1'),header(':path','/api/page?access_token='+secret+'&page=1')]);
 const text=APIFormat.headers(r.har);
 assert.ok(!text.includes(secret));
 assert.ok(text.includes('page=1'));
});

test('面板兼容旧明文配置，保存脱敏名单并重开后，各复制按钮应用同一配置',async()=>{
 const fs=require('node:fs');
 const vm=require('node:vm');
 const path=require('node:path');
 const stored=new Map([['api-copy-mask-config',JSON.stringify({prefix:4,suffix:4,mask:8,plainHeaders:'prolink-Language'})]]);
 function openPanel(){
  const nodes=new Map();
  class Element{
   constructor(){this.value='';this.children=[];this.listeners={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.clientWidth=1200}
   addEventListener(name,fn){this.listeners[name]=fn}
   append(...children){this.children.push(...children)}
   replaceChildren(...children){this.children=children}
   setAttribute(){}
   querySelector(){return new Element()}
   focus(){}
   getBoundingClientRect(){return {width:1200,left:0}}
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
  let finished;
  let copied='';
  const context=vm.createContext({
   URL,URLSearchParams,console,setInterval(){},setTimeout(){return 1},clearTimeout(){},
   localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
   navigator:{clipboard:{writeText:async text=>{copied=text}}},
   window:{getSelection:()=>null,addEventListener(){}},
   document:{getElementById:node,querySelector:node,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),addEventListener(){}},
   chrome:{runtime:{},devtools:{network:{getHAR:callback=>callback({entries:[]}),onRequestFinished:{addListener:callback=>{finished=callback}}}}}
  });
  for(const name of ['format.js','json-tree.js','panel.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
  return {node,receive:entry=>finished(entry),copied:()=>copied};
 }
 let panel=openPanel();
 assert.equal(panel.node('maskedHeaders').value,'');
 panel.node('maskedHeaders').value='company-ticket';
 panel.node('maskedHeaders').listeners.change();
 panel.node('maskPrefix').value='2';
 panel.node('maskPrefix').listeners.change();
 assert.equal(JSON.parse(stored.get('api-copy-mask-config')).maskedHeaders,'company-ticket');
 panel=openPanel();
 assert.equal(panel.node('maskPrefix').value,2);
 assert.equal(panel.node('maskedHeaders').value,'company-ticket');
 const r=record([header('prolink-Auth','crypto '+secret),header('company-ticket',secret),header('prolink-Language','zh-CN')]);
 r.har.response.content={text:'{}',mimeType:'application/json'};
 panel.receive(r.har);
 const row=panel.node('requests').children[0].children[0];
 row.children[0].listeners.click();
 for(const button of [row.children[1],...['copyAll','copyCompact'].map(panel.node)]){
  await button.listeners.click();
  const text=panel.copied();
  assert.ok(text.includes('prolink-Auth: crypto AB********WXYZ'));
  assert.ok(text.includes('company-ticket: AB********WXYZ'));
  assert.ok(text.includes('prolink-Language: zh-CN'));
  assert.ok(!text.includes(secret));
 }
 panel.node('maskedHeaders').value='';
 panel.node('maskedHeaders').listeners.change();
 await panel.node('copyAll').listeners.click();
 assert.ok(panel.copied().includes('company-ticket: '+secret));
 assert.ok(panel.copied().includes('prolink-Auth: crypto AB********WXYZ'));
});

test('JSON Body 单独复制无 Body 前缀，完整信息仍标明来源',()=>{
 const r=record([]);
 const body={current:1,size:20,shopifyStatus:'ACTIVE',enabled:false,optional:null};
 r.har.request.postData={mimeType:'application/json',text:JSON.stringify(body)};
 assert.equal(APIFormat.copyInput(r.har),JSON.stringify(body,null,2));
 assert.ok(APIFormat.full(r).includes('Body:\n'+JSON.stringify(body,null,2)));
 assert.ok(APIFormat.compact(r).includes('Body:\n'+JSON.stringify(body,null,2)));
});

test('Query 保留字符串、空值、编码及重复参数数组',()=>{
 const r=record([]);
 r.har.request.url='https://example.test/api/page?current=1&size=20&sku=001&tag=a&tag=b&empty=&name=%E4%B8%AD%E6%96%87';
 assert.deepEqual(JSON.parse(APIFormat.copyInput(r.har)),{current:'1',size:'20',sku:'001',tag:['a','b'],empty:'',name:'中文'});
 assert.ok(APIFormat.input(r.har).startsWith('Query:\n'));
});

test('Query 与 Body 同时存在时分组，且敏感字段始终脱敏',()=>{
 const r=record([]);
 r.har.request.url='https://example.test/api/page?shopId=001&token='+secret;
 r.har.request.postData={text:JSON.stringify({shopId:2,access_token:secret,items:[{password:secret,sku:'ABC'}]})};
 const text=APIFormat.copyInput(r.har);
 assert.deepEqual(JSON.parse(text),{query:{shopId:'001',token:'[REDACTED]'},body:{shopId:2,access_token:'[REDACTED]',items:[{password:'[REDACTED]',sku:'ABC'}]}});
 assert.ok(!text.includes(secret));
});

test('单独复制保留合法的空 JSON 和标量，缺少入参时有明确提示',()=>{
 const r=record([]);
 for(const value of [{},[],null,false,0,'001']){
  r.har.request.postData={text:JSON.stringify(value)};
  assert.equal(APIFormat.copyInput(r.har),JSON.stringify(value,null,2));
 }
 delete r.har.request.postData;
 assert.equal(APIFormat.copyInput(r.har),'无入参');
});

test('HAR Query 回退保留重复参数，不将特殊键写入对象原型',()=>{
 const r=record([]);
 r.har.request.queryString=[{name:'tag',value:'a'},{name:'tag',value:'b'},{name:'__proto__',value:'text'}];
 const obj=JSON.parse(APIFormat.copyInput(r.har));
 assert.deepEqual(obj.tag,['a','b']);
 assert.equal(obj.__proto__,'text');
 assert.equal({}.polluted,undefined);
});

test('表单转换 JSON 保留重复字段，文件参数不包含文件内容',()=>{
 const r=record([]);
 r.har.request.postData={mimeType:'application/x-www-form-urlencoded',text:'name=a+b&tag=1&tag=2&password='+secret};
 assert.deepEqual(JSON.parse(APIFormat.copyInput(r.har)),{name:'a b',tag:['1','2'],password:'[REDACTED]'});
 r.har.request.postData={mimeType:'multipart/form-data',params:[{name:'file',fileName:'test.bin',value:'file-content'},{name:'tag',value:'1'},{name:'tag',value:'2'}]};
 const text=APIFormat.copyInput(r.har);
 assert.ok(!text.includes('file-content'));
 assert.deepEqual(JSON.parse(text),{file:'(文件/二进制内容)',tag:['1','2']});
});

test('非 JSON Body 保留原文及现有脱敏规则，不伪造 JSON',()=>{
 const r=record([]);
 r.har.request.postData={mimeType:'text/plain',text:'hello world'};
 assert.equal(APIFormat.copyInput(r.har),'hello world');
 r.har.request.postData.text='Bearer '+secret;
 assert.equal(APIFormat.copyInput(r.har),'Bearer [REDACTED]');
});

test('URL 包含域名，URI 仅含路径及查询参数，敏感查询参数共用脱敏规则',()=>{
 const raw='https://example.test:8443/api/page?current=1&token='+secret+'#fragment';
 const full=APIFormat.url(raw),uri=APIFormat.uri(raw);
 assert.ok(full.startsWith('https://example.test:8443/api/page?'));
 assert.ok(uri.startsWith('/api/page?'));
 assert.ok(!uri.includes('example.test'));
 assert.ok(!uri.includes('#fragment'));
 assert.ok(!full.includes(secret)&&!uri.includes(secret));
 assert.equal(new URL('https://example.test'+uri).searchParams.get('token'),'[REDACTED]');
 assert.equal(APIFormat.uri('https://example.test'),'/');
});
