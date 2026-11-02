import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile,stat,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLines } from '../src/io.js';
import { groupsFromLines } from '../src/parser.js';
import { makeEncounter } from '../src/domain.js';
import type { Encounter } from '../src/model.js';

// Identidades do corpus conferidas independentemente por hash em R1 e na referência R4.
// O nome do arquivo, inclusive "notdataset1.txt", não comprova que a entrada é oficial.
const officialByInputHash:Readonly<Record<string,string>>={
  d0acb648ed0132cf562c944d19205477364fca035b0afef3526368e44b499bf4:'OutPuts/output1.json',
  '4f7664c55aa95b8211c25e3ceb2e7070af85b5f7057b3ee3663f6ccba63894f4':'OutPuts/output2.json',
};

function exact(o:unknown,keys:string[]):asserts o is Record<string,unknown> {
  assert(o!==null&&typeof o==='object'&&!Array.isArray(o),'Expected object');assert.deepEqual(Object.keys(o).sort(),[...keys].sort());
}
export const eventKey=(e:Encounter)=>JSON.stringify([e.timestamp,...[...e.monitoradosEncontro].sort((a,b)=>a-b)]);
function normalized(e:Encounter):Encounter {return {...e,monitoradosEncontro:[...e.monitoradosEncontro].sort((a,b)=>a-b) as [number,number]};}
export function validateEvents(value:unknown):Encounter[] {
  assert(Array.isArray(value),'Root must be array');const seen=new Set<string>();
  for(const item of value){exact(item,['tipo','monitoradosEncontro','timestamp','posicoes','distanciaMetros']);assert(['generico','faccao','protetiva'].includes(item.tipo as string));
    const ids=item.monitoradosEncontro;assert(Array.isArray(ids)&&ids.length===2&&ids.every(Number.isSafeInteger)&&ids[0]!==ids[1]);
    assert(typeof item.timestamp==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.timestamp));
    const d=item.distanciaMetros;assert(typeof d==='number'&&Number.isFinite(d)&&d>=0&&d<20);
    const positions=item.posicoes;exact(positions,ids.map(String));for(const id of ids){const p=positions[String(id)];exact(p,['lat','lon']);assert(typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90);assert(typeof p.lon==='number'&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180);}
    const k=eventKey(item as unknown as Encounter);assert(!seen.has(k),`Duplicate event ${k}`);seen.add(k);
  }
  return value as Encounter[];
}
export function compareEvents(actual:unknown,expected:unknown):{fp:number;fn:number;mismatches:unknown[]} {
  const got=new Map(validateEvents(actual).map(e=>[eventKey(e),normalized(e)])),want=new Map(validateEvents(expected).map(e=>[eventKey(e),normalized(e)]));
  let fp=0,fn=0;const mismatches:unknown[]=[];
  for(const [key,event]of got){const w=want.get(key);if(!w)fp++;else try{assert.deepEqual(event,w);}catch{mismatches.push({key,actual:event,expected:w});}}
  for(const key of want.keys())if(!got.has(key))fn++;return {fp,fn,mismatches};
}
export async function verifyFile(input:string,output:string,official?:string){
  const bytes=await readFile(output),events=validateEvents(JSON.parse(bytes.toString('utf8')));
  const byTime=new Map<string,Encounter[]>();for(const e of events){const a=byTime.get(e.timestamp)||[];a.push(e);byTime.set(e.timestamp,a);}
  const hash=createHash('sha256'),stream=createReadStream(input,{highWaterMark:256*1024});stream.on('data',b=>hash.update(b));let linked=0,records=0,groups=0;
  for await(const group of groupsFromLines(readLines(stream,input),input)){
    records+=group.length;groups++;const targets=byTime.get(group[0].timestamp);if(!targets)continue;const ids=new Map(group.map(r=>[r.id,r]));
    for(const e of targets){const [a,b]=e.monitoradosEncontro.map(id=>ids.get(id));assert(a&&b,`Missing source for ${eventKey(e)}`);assert.deepEqual(makeEncounter(a,b),normalized(e),`Source mismatch ${eventKey(e)}`);linked++;}byTime.delete(group[0].timestamp);
  }
  assert.equal(linked,events.length,'Output event timestamp missing in input');assert.equal(byTime.size,0);
  const check=official?compareEvents(events,JSON.parse(await readFile(official,'utf8'))):null;
  if(check)assert.deepEqual(check,{fp:0,fn:0,mismatches:[]},'Official payload differs');
  return {input,output,events:events.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),inputSha256:hash.digest('hex'),records,groups,linked,official:check,scoreKnown:!!official};
}
export async function verifyRun(dir:string){
  const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));const results=[];
  for(const row of manifest.results){
    const result=await verifyFile(row.input,row.output),official=officialByInputHash[result.inputSha256];
    if(official){
      const check=compareEvents(JSON.parse(await readFile(row.output,'utf8')),JSON.parse(await readFile(official,'utf8')));
      assert.deepEqual(check,{fp:0,fn:0,mismatches:[]},'Official payload differs');
      result.official=check;result.scoreKnown=true;
    }
    results.push(result);
  }
  const report={run:dir,verifiedAt:new Date().toISOString(),results};await writeFile(join(dir,'verification.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=process.argv[2];if(!dir){process.stderr.write('Usage: npm run verify -- OutPuts/gerados/<run>\n');process.exitCode=1;}
  else verifyRun(dir).then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n')).catch(e=>{process.stderr.write(String(e)+'\n');process.exitCode=1;});
}
