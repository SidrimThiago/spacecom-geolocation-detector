import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { readLines,processDataset,createRunDirectory,type ProcessMetrics } from '../src/io.js';
import { groupsFromLines,parseRecord } from '../src/parser.js';
import { detectGroup } from '../src/detect.js';
import { newStats,type PositionRecord,type Variant } from '../src/model.js';
import { compareEvents } from './verify.js';

export function summarize(values:number[]){
  assert(values.length&&values.every(Number.isFinite));const sorted=[...values].sort((a,b)=>a-b),mean=values.reduce((a,b)=>a+b,0)/values.length;
  return {n:values.length,mean,median:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2,min:sorted[0],max:sorted.at(-1)!,stddev:Math.sqrt(values.reduce((s,x)=>s+(x-mean)**2,0)/values.length)};
}
export function validateRepetitions(n:number):number {
  assert(Number.isSafeInteger(n)&&n>=5,'repetitions must be a finite safe integer >=5');return n;
}
export function consumeGroups(groups:readonly PositionRecord[][],v:Variant){
  let events=0,sum=0;for(const g of groups)for(const e of detectGroup(g,v)){events++;sum+=e.monitoradosEncontro[0]+e.monitoradosEncontro[1];}return {events,sum};
}
async function micro(){
  const groups:PositionRecord[][]=[];
  for(let n=1;n<=7;n++){
    const path=`DataSets/dataset${n}.txt`;
    for await(const g of groupsFromLines(readLines(createReadStream(path),path),path)){groups.push(g);if(groups.length>=n*100)break;}
  }
  for(const mode of ['dense','same-lat','sparse'])for(let k=0;k<100;k++){
    groups.push(Array.from({length:120},(_,i)=>parseRecord(`${i};;"2024-01-01 00:00:00";${(mode==='sparse'?i/10:i%2===0&&mode==='dense'?.00001:0).toFixed(5)};${(mode==='same-lat'?i:0).toFixed(5)};false;`,i+2,'micro')));
  }
  // A equivalência é conferida antes da medição pelo conteúdo completo dos eventos, não apenas por hash.
  for(const g of groups){const a=[...detectGroup(g,'A')];for(const v of ['B0','B1'] as const)assert.deepEqual(compareEvents([...detectGroup(g,v)],a),{fp:0,fn:0,mismatches:[]});}
  const consume=(v:Variant)=>consumeGroups(groups,v);
  const expected=consume('B0');consume('B1');const samples:{variant:Variant;ms:number}[]=[];
  for(let r=0;r<5;r++)for(const v of (r%2?['B1','B0']:['B0','B1']) as Variant[]){const at=performance.now(),got=consume(v),ms=performance.now()-at;assert.deepEqual(got,expected);samples.push({variant:v,ms});}
  return {groups:groups.length,realFirstGroupsPerDataset:100,syntheticGroups:300,sortIncluded:true,equivalence:'full payload before timing',samples,summary:Object.fromEntries(['B0','B1'].map(v=>[v,summarize(samples.filter(s=>s.variant===v).map(s=>s.ms))]))};
}
export async function benchmark(repetitions=5,id='bench-'+Date.now()){
  validateRepetitions(repetitions);assert(/^[A-Za-z0-9_-]+$/.test(id));
  const dir=await createRunDirectory(id);
  const evidence=resolve('Relatorios/evidencias',id+'.json');
  const report:{environment:unknown;method:unknown;micro:unknown;samples:(ProcessMetrics&{dataset:number;repetition:number;warmup:boolean})[];summary?:unknown}={
    environment:{node:process.version,v8:process.versions.v8,cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,platform:process.platform,totalMemory:os.totalmem(),started:new Date().toISOString()},
    method:{repetitions,cache:'uncontrolled OS cache; warmup per dataset/variant; same process',timing:'processDataset includes reading/parsing, detection, serialization/writing and exclusive publication; sampled RSS is not exact peak',baselineA:'one full run per dataset; five repetitions only datasets 1/2',order:'B0/B1 alternated by repetition and dataset; all runs sequential'},micro:null,samples:[]};
  report.micro=await micro();await writeFile(evidence,JSON.stringify(report,null,2),{flag:'wx'});
  const canonical=new Map<number,unknown>();
  const run=async(n:number,v:Variant,r:number,warmup=false)=>{
    const output=join(dir,`${n}-${v}-${warmup?'warm':r}.json`),m=await processDataset(`DataSets/dataset${n}.txt`,output,v);
    const actual=JSON.parse(await readFile(output,'utf8')),expected=canonical.get(n);
    if(expected)assert.deepEqual(compareEvents(actual,expected),{fp:0,fn:0,mismatches:[]});else canonical.set(n,actual);
    report.samples.push({...m,dataset:n,repetition:r,warmup});await writeFile(evidence,JSON.stringify(report,null,2));
    process.stderr.write(`bench ${n} ${v} ${warmup?'warm':r}: ${m.totalMs.toFixed(1)} ms, ${m.events} events\n`);
  };
  // A usa cinco amostras nos datasets 1–2 e uma nos demais, sempre sobre o arquivo completo.
  for(let n=1;n<=7;n++){await run(n,'A',0);if(n<=2)for(let r=1;r<5;r++)await run(n,'A',r);}
  for(let n=1;n<=7;n++)for(const v of ['B0','B1'] as const)await run(n,v,-1,true);
  for(let r=0;r<repetitions;r++)for(let n=1;n<=7;n++)for(const v of ((r+n)%2?['B1','B0']:['B0','B1']) as Variant[])await run(n,v,r);
  const summary:Record<string,unknown>={};
  for(const v of ['A','B0','B1']){
    const perDataset=Array.from({length:7},(_,i)=>{
      const samples=report.samples.filter(s=>s.variant===v&&s.dataset===i+1&&!s.warmup);
      return {dataset:i+1,total:summarize(samples.map(s=>s.totalMs)),readParse:summarize(samples.map(s=>s.readParseMs)),detection:summarize(samples.map(s=>s.detectionMs)),write:summarize(samples.map(s=>s.writeMs)),publish:summarize(samples.map(s=>s.publishMs)),sampledRSSMax:Math.max(...samples.map(s=>s.sampledRSS)),counters:((({groups,records,pairVisits,candidates,haversineCalls,events,fallbackGroups})=>({groups,records,pairVisits,candidates,haversineCalls,events,fallbackGroups}))(samples[0]))};
    });summary[v]={perDataset,sumMeans:perDataset.reduce((s,x)=>s+x.total.mean,0)};
  }
  report.summary=summary;await writeFile(evidence,JSON.stringify(report,null,2));return {evidence,dir,summary};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reps=Number(process.argv[2]||5),id=process.argv[3]||'bench-'+Date.now();
  benchmark(reps,id).then(x=>process.stdout.write(JSON.stringify(x,null,2)+'\n')).catch(e=>{process.stderr.write(String(e)+'\n');process.exitCode=1;});
}
