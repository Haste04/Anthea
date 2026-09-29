import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
const compile = async path => ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const dataExports = {};
vm.runInNewContext(await compile('../lib/workspace-data.ts'),{exports:dataExports,atob});
const source = await compile('../app/api/assistant/route.ts');
function route() {
  const calls=[]; const exports={};
  const dependencies = {
    'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init?.headers}})}},
    '@/lib/api-guard':{enforceApiLimit:async()=>({allowed:true}),readBodyWithLimit:async(req,limit)=>{const bytes=new Uint8Array(await req.arrayBuffer());return bytes.length>limit?null:bytes;}},
    '@/lib/gemini':{isProviderOverloaded:()=>false,runAssistant:async(...args)=>{calls.push(args);return {response_text:'Test reply'};}},
    '@/lib/plant-profile':{parsePlantProfile:()=>null},
    '@/lib/conversation':{parseConversationHistory:()=>[]},
    '@/lib/workspace-data':dataExports,
    sharp:{default:sharp},
  };
  vm.runInNewContext(source,{exports,require:name=>dependencies[name],Buffer,TextDecoder,console});
  return {post:body=>exports.POST(new Request('http://localhost/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})),calls};
}
test('invalid or truncated photo content never reaches the provider',async()=>{
  const {post,calls}=route();
  for(const photo of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,/9j/2Q==','https://example.com/photo']) {
    assert.equal((await post({transcript:'Identify this',photo})).status,400);
  }
  assert.equal(calls.length,0);
});
test('valid photos are decoded and normalized before sending to the provider',async()=>{
  const {post,calls}=route();
  const png=await sharp({create:{width:8,height:8,channels:3,background:'#378135'}}).png().toBuffer();
  const response=await post({transcript:'Identify this',photo:`data:image/png;base64,${png.toString('base64')}`,photoContext:true,plantContext:'Kitchen plant'});
  assert.equal(response.status,200);assert.equal(calls.length,1);
  assert.match(calls[0][3],/^data:image\/jpeg;base64,/);assert.equal(calls[0][4],true);assert.equal(calls[0][5],'Kitchen plant');
});
test('oversized photo requests and plant context are rejected before provider use',async()=>{
  const {post,calls}=route();
  assert.equal((await post({transcript:'Help',photo:'x'.repeat(2_900_001)})).status,413);
  assert.equal((await post({transcript:'Help',plantContext:'x'.repeat(2601)})).status,400);
  assert.equal(calls.length,0);
});
