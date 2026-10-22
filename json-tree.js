'use strict';
// DOM 节点全部使用 textContent 写入，响应中的 HTML 仅作为文本展示。
const APIJSONTree=(()=>{
 const MAX_FIELDS=3;
 const MAX_STRING=48;
 function shorten(text,max=MAX_STRING){const value=String(text);return value.length>max?value.slice(0,max)+'…':value}
 function scalar(value,preview=false){
  if(value===null)return {text:'null',className:'json-null'};
  if(typeof value==='string')return {text:JSON.stringify(preview?shorten(value):value),className:'json-string'};
  if(typeof value==='number')return {text:String(value),className:'json-number'};
  if(typeof value==='boolean')return {text:String(value),className:'json-boolean'};
  return {text:String(value),className:'json-null'};
 }
 // 折叠摘要只检查少量字段，不递归展开集合，避免大响应在首次展示时生成大量节点。
 function preview(value){
  const tokens=[];
  const add=(text,className='json-punctuation')=>tokens.push({text,className});
  function brief(item){
   if(item&&typeof item==='object')add(Array.isArray(item)?(item.length?'[…]':'[]'):(Object.keys(item).length?'{…}':'{}'));
   else tokens.push(scalar(item,true));
  }
  if(!value||typeof value!=='object')return [scalar(value,true)];
  const array=Array.isArray(value),keys=Object.keys(value);
  if(array&&keys.length)add(`(${value.length}) `,'json-length');
  add(array?'[':'{');
  keys.slice(0,MAX_FIELDS).forEach((key,index)=>{
   if(index)add(', ');
   if(!array){add(shorten(key,40),'json-key');add(': ');}
   brief(value[key]);
  });
  if(keys.length>MAX_FIELDS)add(', …');
  add(array?']':'}');
  return tokens;
 }
 function render(container,value,state={}){
  const expanded=state.expanded||(state.expanded=new Map());
  const controls=[];
  container.replaceChildren();
  function span(parent,text,className){const node=document.createElement('span');node.className=className;node.textContent=text;parent.append(node)}
  function keyLabel(parent,key){if(key!==null){span(parent,key,'json-key');span(parent,': ','json-punctuation')}}
  function node(parent,item,key,path,depth){
   const object=item!==null&&typeof item==='object';
   const keys=object?Object.keys(item):[];
   if(!object||!keys.length||depth>20){
    const leaf=document.createElement('div');leaf.className='json-leaf';keyLabel(leaf,key);
    const tokens=depth>20?[{text:'[深层数据省略]',className:'json-null'}]:object?preview(item):[scalar(item)];
    for(const token of tokens)span(leaf,token.text,token.className);
    parent.append(leaf);return;
   }
   const details=document.createElement('details');details.className='json-node';
   const summary=document.createElement('summary');summary.className='json-row';keyLabel(summary,key);
   for(const token of preview(item))span(summary,token.text,token.className);
   details.append(summary);parent.append(details);
   let loaded=false;
   function loadChildren(){
    if(loaded)return;
    loaded=true;
    const children=document.createElement('div');children.className='json-children';
    for(const childKey of keys){
     const childPath=path+'/'+childKey.replace(/~/g,'~0').replace(/\//g,'~1');
     node(children,item[childKey],childKey,childPath,depth+1);
    }
    details.append(children);
   }
   function setOpen(open){if(open)loadChildren();details.open=open;expanded.set(path,open)}
   controls.push({setOpen});
   details.addEventListener('toggle',()=>{if(details.open)loadChildren();expanded.set(path,details.open)});
   const open=expanded.has(path)?expanded.get(path):depth<2;
   if(open)loadChildren();
   details.open=open;
  }
  node(container,value,null,'',0);
  container.scrollTop=state.scrollTop||0;
  container.onscroll=()=>{state.scrollTop=container.scrollTop};
  return {
   // 展开时会继续生成子节点，因此按动态长度遍历，覆盖尚未创建的后代。
   expandAll(){for(let i=0;i<controls.length;i++)controls[i].setOpen(true)},
   collapseAll(){for(const control of controls)control.setOpen(false)}
  };
 }
 return {preview,render};
})();
if(typeof module!=='undefined')module.exports=APIJSONTree;
