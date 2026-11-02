import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { readLines, writeJsonArray, publishNoClobber, processDataset } from '../src/io.js';
import { HEADER } from '../src/parser.js';

const T='2024-01-01 00:00:00';
const row=(id:number,t=T)=>`${id};;"${t}";0.00000;0.00000;false;`;
async function temp(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'spacecom-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function* objects(){yield {sample:1};yield {sample:2};}

test('P01 UTF-8 com BOM/CRLF dividido em cada byte e EOF sem quebra de linha',async()=>{
  const text='\uFEFF'+HEADER+'\r\n'+row(3)+'\r\n'+row(20);const buffers=[...Buffer.from(text)].map(x=>Buffer.from([x]));
  const out=[];for await(const s of readLines(Readable.from(buffers),'fixture'))out.push(s);
  assert.deepEqual(out,['\uFEFF'+HEADER,row(3),row(20)]);
});
test('P05 decodificação estrita, CR isolado e erro de leitura não são tratados silenciosamente como EOF',async()=>{
  async function consume(s:Readable){for await(const _ of readLines(s,'broken')){/* consume */}}
  await assert.rejects(()=>consume(Readable.from([Buffer.from([0xff])])),/UTF/);
  await assert.rejects(()=>consume(Readable.from([Buffer.from('x\ry')])),/CR/);
  const s=Readable.from((async function*(){yield Buffer.from(HEADER+'\n');throw new Error('read failure');})());
  await assert.rejects(()=>consume(s),/read failure/);
});
test('O01 destino lento aplica backpressure real e produz um array completo e válido',async()=>{
  let text='',inFlight=0,peak=0;const sink=new Writable({highWaterMark:1,write(chunk,_encoding,cb){inFlight++;peak=Math.max(peak,inFlight);setImmediate(()=>{text+=chunk.toString();inFlight--;cb();});}});
  await writeJsonArray(objects(),sink);assert.deepEqual(JSON.parse(text),[{sample:1},{sample:2}]);assert.equal(peak,1);assert(sink.writableFinished);
});
test('O01 falhas de escrita, fechamento prematuro e finalização rejeitam a operação sem travar',async()=>{
  const fail=new Writable({highWaterMark:1,write(_c,_e,cb){cb(new Error('write failure'));}});
  await assert.rejects(()=>writeJsonArray(objects(),fail),/write failure/);
  const close=new Writable({highWaterMark:1,write(_c,_e,_cb){this.destroy();}});
  await assert.rejects(()=>writeJsonArray(objects(),close),/close|premature/i);
  const final=new Writable({write(_c,_e,cb){cb();},final(cb){cb(new Error('final failure'));}});
  await assert.rejects(()=>writeJsonArray(objects(),final),/final failure/);
});
test('O01 erro no destino durante espera da entrada preserva o EIO original e cancela o produtor',async()=>{
  let start!:()=>void,release!:()=>void;const started=new Promise<void>(r=>start=r),gate=new Promise<void>(r=>release=r);
  async function* delayed(){start();await gate;yield {sample:1};}
  const sink=new Writable({write(_c,_e,cb){cb();}}),original=Object.assign(new Error('disk EIO while waiting'),{code:'EIO'});
  let cancelled:unknown;const result=writeJsonArray(delayed(),sink,e=>{cancelled=e;release();});
  await started;const observed=new Promise<void>(r=>sink.once('error',()=>r()));sink.destroy(original);await observed;release();await assert.rejects(()=>result,e=>e===original);assert.equal(cancelled,original);
});
test('O01 destino já fechado rejeita a operação e fechamento tardio é aguardado após finish',async()=>{
  const closed=new Writable({write(_c,_e,cb){cb();}});closed.destroy();await new Promise<void>(r=>closed.once('close',r));
  await assert.rejects(()=>writeJsonArray(objects(),closed),/close|destroy|premature/i);
  let destroyed=false;const delayed=new Writable({write(_c,_e,cb){cb();},destroy(error,cb){setImmediate(()=>{destroyed=true;cb(error);});}});
  await writeJsonArray(objects(),delayed);assert(destroyed);assert(delayed.closed);
});
test('O01 erro ao fechar a entrada após EOF é propagado antes de concluir com sucesso',async()=>{
  const source=new Readable({read(){this.push(Buffer.from('one\n'));this.push(null);},destroy(_error,cb){setImmediate(()=>cb(new Error('read close failure')));}});
  async function consume(){const out=[];for await(const line of readLines(source,'close-error'))out.push(line);return out;}
  await assert.rejects(consume,/read close failure/);
});
test('O01 resultado publicado sobrevive à falha de limpeza do temporário; falha de link não usa alternativa',async()=>temp(async dir=>{
  const input=join(dir,'source.txt');await writeFile(input,[HEADER,row(3),row(20)].join('\n'));
  const target=join(dir,'published.json');
  const m=await processDataset(input,target,'A',{removeTemp:async()=>{throw new Error('cleanup denied');}});
  assert.match(m.cleanupWarning||'',/cleanup denied/);assert.equal(JSON.parse(await readFile(target,'utf8')).length,1);
  const failed=join(dir,'never.json');
  await assert.rejects(()=>processDataset(input,failed,'A',{publish:async()=>{throw new Error('LINK_UNSUPPORTED');}}),/LINK_UNSUPPORTED/);
  assert(!(await readdir(dir)).includes('never.json'));
}));
test('O02 duas publicações concorrentes têm exatamente uma vencedora com conteúdo completo',async()=>temp(async dir=>{
  const a=join(dir,'a.partial'),b=join(dir,'b.partial'),target=join(dir,'winner.json');await writeFile(a,'[1]');await writeFile(b,'[2]');
  const results=await Promise.allSettled([publishNoClobber(a,target),publishNoClobber(b,target)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert(['[1]','[2]'].includes(await readFile(target,'utf8')));
}));
test('O02 publicação por hardlink não sobrescreve destino existente ou criado concorrentemente',async()=>temp(async dir=>{
  const source=join(dir,'own.partial'),target=join(dir,'final.json');await writeFile(source,'[]');await publishNoClobber(source,target);assert.equal(await readFile(target,'utf8'),'[]');
  const competing=join(dir,'competing.partial');await writeFile(competing,'[1]');await assert.rejects(()=>publishNoClobber(competing,target),/EEXIST/);assert.equal(await readFile(target,'utf8'),'[]');
  const race=join(dir,'race.json');await writeFile(race,'prior');await assert.rejects(()=>publishNoClobber(competing,race),/EEXIST/);assert.equal(await readFile(race,'utf8'),'prior');
  const alias=join(dir,'alias.json');await link(target,alias);await assert.rejects(()=>publishNoClobber(competing,alias),/EEXIST/);
}));
test('G01/O02 processDataset calcula a saída e protege a entrada e o destino existente',async()=>temp(async dir=>{
  const input=join(dir,'input.txt'),output=join(dir,'events.json');await writeFile(input,[HEADER,row(20),row(3)].join('\n'));
  const m=await processDataset(input,output,'A');assert.equal(m.events,1);assert.equal(m.records,2);assert.equal(m.pairVisits,1);
  const es=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(es[0].monitoradosEncontro,[3,20]);assert.equal(es[0].distanciaMetros,0);
  await assert.rejects(()=>processDataset(input,output,'A'),/EEXIST/);await assert.rejects(()=>processDataset(input,input,'A'));
  assert.equal(await readFile(input,'utf8'),[HEADER,row(20),row(3)].join('\n'));
  assert(!(await readdir(dir)).some(n=>n.endsWith('.partial')));
}));
test('O01/T02 falhas de parsing, regressão temporal ou entrada ausente não publicam arquivo final',async()=>temp(async dir=>{
  for(const [name,text]of [['parse',[HEADER,row(3),'bad'].join('\n')],['regress',[HEADER,row(3),row(9,'2024-01-01 00:00:05'),row(20)].join('\n')]]){
    const input=join(dir,name+'.txt'),output=join(dir,name+'.json');await writeFile(input,text);await assert.rejects(()=>processDataset(input,output,'A'));
    assert(!(await readdir(dir)).includes(name+'.json'));
  }
  await assert.rejects(()=>processDataset(join(dir,'missing'),join(dir,'missing.json'),'A'));
  assert(!(await readdir(dir)).some(n=>n.endsWith('.partial')));
}));
