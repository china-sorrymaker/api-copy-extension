'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const tree=require('../json-tree.js');
const format=require('../format.js');
const text=value=>tree.preview(value).map(token=>token.text).join('');

test('折叠记录显示核心字段摘要，而非 Object 字段数',()=>{
 assert.equal(text({id:'2113077466254888961',operationTime:'2026-10-21 21:18:22',quantity:8,other:'value'}),'{id: "2113077466254888961", operationTime: "2026-10-21 21:18:22", quantity: 8, …}');
});
test('数组摘要保留长度，嵌套对象仅显示轮廓',()=>{
 assert.equal(text([{id:1},{id:2},{id:3},{id:4}]),'(4) [{…}, {…}, {…}, …]');
 assert.equal(text({records:[{id:1}],data:{count:2}}),'{records: […], data: {…}}');
 assert.equal(text({}),'{}');
 assert.equal(text([]),'[]');
});
test('类型颜色互相区分，null 和 false 等值不丢失',()=>{
 const tokens=tree.preview({quantity:0,enabled:false,value:null});
 assert.ok(tokens.some(t=>t.text==='0'&&t.className==='json-number'));
 assert.ok(tokens.some(t=>t.text==='false'&&t.className==='json-boolean'));
 assert.ok(tokens.some(t=>t.text==='null'&&t.className==='json-null'));
 assert.equal(text('hello'),'"hello"');
});
test('长字段和长字符串摘要截断，原始数据保持不变',()=>{
 const value={['field'.repeat(30)]:'value'.repeat(100)};
 const before=JSON.stringify(value);
 assert.ok(text(value).length<110);
 assert.ok(text(value).includes('…'));
 assert.equal(JSON.stringify(value),before);
});
test('摘要使用已脱敏数据，响应的 HTML 作为文本 token 保留',()=>{
 const secret='test-private-token';
 const clean=format.clean({token:secret,message:'<img src=x onerror=alert(1)>'});
 assert.ok(!text(clean).includes(secret));
 assert.ok(text(clean).includes('[REDACTED]'));
 assert.ok(tree.preview(clean).some(t=>t.text.includes('<img')));
});
