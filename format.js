'use strict';
// Pure formatting helpers shared by the panel and local tests.
const APIFormat=(()=>{
 const SENSITIVE=/(authorization|cookie|set-cookie|x-api-key|password|passwd|secret|access[_-]?token|refresh[_-]?token|(^|[_-])token($|[_-])|client[_-]?secret|api[_-]?key|credential|sessionid|session[_-]?id)/i;
 const maskKey=k=>SENSITIVE.test(String(k));
 // 仅对请求头扩大匹配范围，避免把响应中的 author 等业务字段误判为凭据。
 const sensitiveHeader=key=>maskKey(key)||/(auth|token|cookie|password|passwd|secret|apikey|credential|session)/i.test(String(key).replace(/[^a-z0-9]/gi,''));
 const AUTH_SCHEME=/^\s*(Bearer|Basic|Token|crypto)\s+([\s\S]*)$/i;
 function clean(value,key='',depth=0){
  if(maskKey(key))return '[REDACTED]';
  if(depth>12)return '[深层对象省略]';
  if(Array.isArray(value))return value.map(v=>clean(v,'',depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k,depth+1)]));
  return value;
 }
 function url(raw){try{const u=new URL(raw);for(const key of [...u.searchParams.keys()])if(maskKey(key))u.searchParams.set(key,'[REDACTED]');return u.href}catch{return raw}}
 // URI 与完整 URL 共用脱敏规则，只保留实际请求使用的路径和查询参数。
 function uri(raw){try{const u=new URL(url(raw));return u.pathname+u.search}catch{return url(raw)}}
 function safeString(text){return String(text??'').replace(/((?:Bearer|Basic)\s+)[a-z0-9._~+/=-]+/gi,'$1[REDACTED]');}
 function parse(text){try{return JSON.parse(text)}catch{return null}}
 function display(text,mime=''){
  if(text===undefined||text===null||text==='')return '(空)';
  if(/multipart\/form-data/i.test(mime))return '(multipart/form-data：文件内容不复制；可在 Chrome Network 检查)';
  const obj=parse(text);
  return obj===null?safeString(text):JSON.stringify(clean(obj),null,2);
 }
 function parameterObject(entries){
  const result=Object.create(null);
  for(const [key,value] of entries){
   if(Object.prototype.hasOwnProperty.call(result,key))result[key]=[].concat(result[key],value);
   else result[key]=value;
  }
  return result;
 }
 // 统一解析展示与复制所用的入参，Query 保留字符串，同名参数保留为数组。
 function inputData(har){
  let query={};try{query=parameterObject(new URL(har.request.url).searchParams)}catch{}
  if(!Object.keys(query).length)query=parameterObject((har.request.queryString||[]).map(e=>[e.name,e.value]));
  const data={query:clean(query),hasBody:false,body:null,bodyJson:false};
  const pd=har.request.postData;
  if(pd){
   const mime=pd.mimeType||(har.request.headers||[]).find(h=>h.name.toLowerCase()==='content-type')?.value||'';
   if(typeof pd.text==='string'&&pd.text.trim()){
    data.hasBody=true;
    if(/multipart\/form-data/i.test(mime))data.body=display(pd.text,mime);
    else if(/application\/x-www-form-urlencoded/i.test(mime)){
     data.body=clean(parameterObject(new URLSearchParams(pd.text)));data.bodyJson=true;
    }else{
     try{data.body=clean(JSON.parse(pd.text));data.bodyJson=true}
     catch{data.body=safeString(pd.text)}
    }
   }else if(Array.isArray(pd.params)&&pd.params.length){
    data.body=clean(parameterObject(pd.params.map(p=>[p.name,p.fileName?'(文件/二进制内容)':p.value??'(文件/二进制内容)'])));
    data.hasBody=true;data.bodyJson=true;
   }else if(typeof pd.text!=='string'&&!Array.isArray(pd.params)){data.body='(请求体不可用)';data.hasBody=true;}
  }
  return data;
 }
 function input(har){
  const data=inputData(har),parts=[];
  if(Object.keys(data.query).length)parts.push(`Query:\n${JSON.stringify(data.query,null,2)}`);
  // 沿用完整调试信息中的空对象省略规则；单独复制时保留原始的 {} / []。
  const empty=data.bodyJson&&data.body&&typeof data.body==='object'&&!Object.keys(data.body).length;
  if(data.hasBody&&!empty)parts.push(`Body:\n${data.bodyJson?JSON.stringify(data.body,null,2):data.body}`);
  return parts.length?parts.join('\n\n'):'无入参';
 }
 function copyInput(har){
  const data=inputData(har),hasQuery=Object.keys(data.query).length>0;
  if(hasQuery&&data.hasBody)return JSON.stringify({query:data.query,body:data.body},null,2);
  if(hasQuery)return JSON.stringify(data.query,null,2);
  if(data.hasBody)return data.bodyJson?JSON.stringify(data.body,null,2):data.body;
  return '无入参';
 }
 const headerConfig=()=>{let c={prefix:4,suffix:4,mask:8,maskedHeaders:''};try{c={...c,...JSON.parse(localStorage.getItem('api-copy-mask-config')||'{}')}}catch{};return c};
 function maskToken(value){
  const str=String(value??''); const {prefix,suffix,mask}=headerConfig();
  const a=Math.max(0,Math.min(12,Number(prefix)||0)),b=Math.max(0,Math.min(12,Number(suffix)||0)),m=Math.max(1,Math.min(32,Number(mask)||8));
  if(str.length<=a+b+2)return '[REDACTED]';
  return str.slice(0,a)+'*'.repeat(m)+str.slice(-b||str.length);
 }
 function headers(har){
  const arr=har.request?.headers||[];
  if(!arr.length)return '（未提供请求头）';
  const configured=headerConfig().maskedHeaders;
  const blocked=new Set((typeof configured==='string'?configured:'').toLowerCase().split(/[\s,;，；]+/).filter(Boolean));
  return arr.map(h=>{
   const key=String(h.name||'');const v=String(h.value??'');
   if(/^(cookie|set-cookie)$/i.test(key))return key+': '+v.split(/;\s*/).map(segment=>{
    const at=segment.indexOf('=');return at<0?'[REDACTED]':segment.slice(0,at+1)+maskToken(segment.slice(at+1));
   }).join('; ');
   const match=v.match(AUTH_SCHEME);
   // 内置敏感规则始终生效；其余仅对用户指定的请求头脱敏，保留普通业务头供排查。
   if(match)return key+': '+match[1]+' '+maskToken(match[2]);
   const name=key.toLowerCase();
   if(sensitiveHeader(key)||blocked.has(name))return key+': '+maskToken(v);
   if(name==='origin'||name==='referer')return key+': '+safeString(url(v));
   if(name===':path')return key+': '+safeString(url('https://api-copy.invalid'+v).replace('https://api-copy.invalid',''));
   return key+': '+safeString(v);
  }).join('\n');
 }
 // status=0 既可能是尚未收到响应，也可能是网络失败；只有明确失败或完成事件才能判错。
 function waiting(r){return !r.finished&&!r.har.response?._error&&!r.har._error&&!(Number(r.har.response?.status)>0)}
 const status=r=>waiting(r)?'waiting':Number(r.har.response?.status)>0?String(r.har.response.status):'ERR';
 const response=r=>waiting(r)?'(请求进行中，等待响应)':r.responseLoaded?display(r.responseText,r.contentType):'(响应暂不可读)';
 const heading=r=>`【接口】\n${r.har.request.method} ${url(r.har.request.url)}\nHTTP 状态：${status(r)}\n耗时：${waiting(r)?'等待响应':Math.round(r.har.time||0)+' ms'}`;
 const full=r=>`${heading(r)}\n\n【入参】\n${input(r.har)}\n\n【请求头（已脱敏）】\n${headers(r.har)}\n\n【返回值】\n${response(r)}`;
 const MAX_SAMPLE=2;
 function prune(value,depth=0){
  if(depth>5)return '[深层对象省略]';
  if(Array.isArray(value)){return {count:value.length,sample:value.slice(0,MAX_SAMPLE).map(v=>prune(v,depth+1)),...(value.length>MAX_SAMPLE?{omitted:value.length-MAX_SAMPLE}:{})}}
  if(value&&typeof value==='object'){
   const entries=Object.entries(value);let result={};
   for(const [k,v] of entries.slice(0,25))result[k]=prune(v,depth+1);
   if(entries.length>25)result._otherFields=`省略 ${entries.length-25} 个字段`;
   return result;
  }
  if(typeof value==='string'&&value.length>240)return value.slice(0,240)+`…（省略 ${value.length-240} 字符）`;
  return value;
 }
 function responseSummary(r){
  if(waiting(r))return '(请求进行中，等待响应)';
  if(!r.responseLoaded)return '(响应暂不可读)';
  if(!r.responseText)return '(空)';
  const obj=parse(r.responseText);
  if(obj!==null){const summarized=prune(clean(obj));return JSON.stringify(summarized,null,2)}
  const txt=safeString(r.responseText);return txt.length>900?txt.slice(0,900)+`\n…（省略 ${txt.length-900} 字符）`:txt;
 }
 function businessError(r){
  if(waiting(r)||!r.responseLoaded)return false;
  const obj=parse(r.responseText);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return false;
  if(obj.success===false)return true;
  if('code' in obj){const c=String(obj.code);return !['0','200','20000','SUCCESS','success'].includes(c)}
  return false;
 }
 function anomalous(r){return !waiting(r)&&(Boolean(r.har.response?._error||r.har._error)||Number(r.har.response?.status)>=400||!(Number(r.har.response?.status)>0)||businessError(r))}
 function compact(r){return `${heading(r)}\n\n【入参】\n${input(r.har)}\n\n【请求头（已脱敏）】\n${headers(r.har)}\n\n【返回摘要】（数组只展示前 ${MAX_SAMPLE} 条）\n${responseSummary(r)}`}
 return {clean,url,uri,display,input,copyInput,response,full,compact,waiting,status,anomalous,businessError,responseSummary,headers,maskToken};
})();
if(typeof module!=='undefined')module.exports=APIFormat;
