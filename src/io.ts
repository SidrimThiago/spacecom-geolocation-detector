import { createReadStream } from 'node:fs';
import { link, open, unlink, mkdir,realpath } from 'node:fs/promises';
import { dirname, basename, resolve, join,relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { performance } from 'node:perf_hooks';
import { groupsFromLines } from './parser.js';
import { detectGroup } from './detect.js';
import { newStats, type DetectionStats, type Variant } from './model.js';

export async function* readLines(input:Readable,source:string):AsyncGenerator<string> {
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let tail='',lineNo=1;
  function decode(b:Uint8Array,final=false):string {
    try{return decoder.decode(b,{stream:!final});}catch(cause){throw new Error(`${source}:${lineNo} INVALID_UTF8`,{cause});}
  }
  for await(const chunk of input){
    tail+=decode(chunk as Uint8Array);let start=0,index:number;
    while((index=tail.indexOf('\n',start))!==-1){let text=tail.slice(start,index);if(text.endsWith('\r'))text=text.slice(0,-1);if(text.includes('\r'))throw new Error(`${source}:${lineNo} ISOLATED_CR`);yield text;lineNo++;start=index+1;}
    tail=tail.slice(start);
  }
  tail+=decode(new Uint8Array(),true);
  if(tail.includes('\r'))throw new Error(`${source}:${lineNo} ISOLATED_CR`);
  if(tail!=='')yield tail;
}

function writeChunk(sink:Writable,text:string):Promise<void> {
  return new Promise((resolve,reject)=>{
    let callbackDone=false,drained=false,needsDrain:boolean|undefined,settled=false;
    const clean=()=>{sink.off('error',error);sink.off('close',close);sink.off('drain',drain);};
    const error=(e:Error)=>{if(!settled){settled=true;clean();reject(e);}};
    const close=()=>error(new Error('PREMATURE_WRITE_CLOSE'));
    const check=()=>{if(!settled&&callbackDone&&(needsDrain===false||needsDrain===true&&drained)){settled=true;clean();resolve();}};
    const drain=()=>{drained=true;check();};
    sink.once('error',error);sink.once('close',close);sink.once('drain',drain);
    try{needsDrain=!sink.write(text,e=>{if(e)error(e);else{callbackDone=true;check();}});check();}catch(e){error(e as Error);}
  });
}

export async function writeJsonArray(events:AsyncIterable<unknown>|Iterable<unknown>,sink:Writable,onFailure?:(cause:unknown)=>void):Promise<void> {
  let firstFailure:unknown,pendingFailure:((cause:unknown)=>void)|undefined;
  const fail=(cause:unknown)=>{
    if(firstFailure!==undefined)return;firstFailure=cause;
    try{onFailure?.(cause);}catch{/* Cancellation cannot replace the original I/O error. */}pendingFailure?.(cause);
  };
  sink.on('error',fail);
  const done=finished(sink,{cleanup:true});void done.catch(fail);
  const iterator=Symbol.asyncIterator in events?events[Symbol.asyncIterator]():events[Symbol.iterator]();
  // Mantém uma única espera cancelável. Usar Promise.race em cada next() com a mesma
  // promessa pendente reteria uma reação por evento até o fim do arquivo.
  const next=()=>new Promise<IteratorResult<unknown>>((resolve,reject)=>{
    if(firstFailure!==undefined){reject(firstFailure);return;}
    const cancel=(cause:unknown)=>reject(cause);pendingFailure=cancel;
    try{Promise.resolve(iterator.next()).then(item=>{
      if(pendingFailure===cancel)pendingFailure=undefined;
      if(firstFailure!==undefined)reject(firstFailure);else resolve(item);
    },cause=>{if(pendingFailure===cancel)pendingFailure=undefined;reject(cause);});}
    catch(cause){pendingFailure=undefined;reject(cause);}
  });
  try{
    await writeChunk(sink,'[');let first=true;
    while(true){const item=await next();if(item.done)break;
      const json=JSON.stringify(item.value);if(json===undefined)throw new Error('UNSERIALIZABLE_EVENT');await writeChunk(sink,(first?'':',')+json);first=false;
    }
    await writeChunk(sink,']\n');sink.end();await done;
  }catch(e){fail(e);sink.destroy();void Promise.resolve(iterator.return?.()).catch(()=>{});await done.catch(()=>{});throw firstFailure;
  }finally{sink.off('error',fail);}
}

/** Criação exclusiva no mesmo sistema de arquivos: arquivo, diretório ou link existente provoca EEXIST. */
export async function publishNoClobber(temp:string,final:string):Promise<void> {await link(temp,final);}

/** Rejeita redirecionamento por junction preexistente antes de criar o diretório da execução. */
export async function createRunDirectory(id:string):Promise<string> {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id))throw new Error('Invalid run-id argument');
  const workspace=await realpath(process.cwd()),outputs=await realpath('OutPuts');
  if(relative(workspace,outputs).toLowerCase()!=='outputs')throw new Error('OUTPUT_PATH_REDIRECT: OutPuts');
  const root=resolve('OutPuts/gerados');await mkdir(root,{recursive:true});
  if(relative(outputs,await realpath(root)).toLowerCase()!=='gerados')throw new Error('OUTPUT_PATH_REDIRECT: gerados');
  const dir=join(root,id);await mkdir(dir);return dir;
}

export interface ProcessMetrics extends DetectionStats {
  input:string;output:string;variant:Variant;
  readParseMs:number;detectionMs:number;writeMs:number;publishMs:number;totalMs:number;
  sampledRSS:number;
  cleanupWarning?:string;
}

export interface PublicationOperations {
  publish?:(temp:string,final:string)=>Promise<void>;
  removeTemp?:(temp:string)=>Promise<void>;
}
export async function processDataset(input:string,output:string,variant:Variant,operations:PublicationOperations={}):Promise<ProcessMetrics> {
  const start=performance.now();if(resolve(input)===resolve(output))throw new Error('INPUT_OUTPUT_ALIAS');
  const temp=join(dirname(output),`.${basename(output)}.${randomUUID()}.partial`);
  const handle=await open(temp,'wx');let ownTemp=true;
  const controller=new AbortController();
  const metrics:ProcessMetrics={...newStats(),input,output,variant,readParseMs:0,detectionMs:0,writeMs:0,publishMs:0,totalMs:0,sampledRSS:process.memoryUsage().rss};
  // A abertura é adiada: o gravador pode aguardar o primeiro bloco antes de solicitar a entrada.
  // Criar ReadStream antes disso permitiria ENOENT antes de iniciar o consumo assíncrono.
  async function* fileLines(){
    const stream=createReadStream(input,{highWaterMark:256*1024,signal:controller.signal}),done=finished(stream,{cleanup:true});void done.catch(()=>{});let failure:unknown;
    try{yield* readLines(stream,input);}catch(e){failure=e;throw e;}finally{stream.destroy();if(failure)await done.catch(()=>{});else await done;}
  }
  const groups=groupsFromLines(fileLines(),input,metrics)[Symbol.asyncIterator]();
  async function* events(){
    while(true){let at=performance.now();const next=await groups.next();metrics.readParseMs+=performance.now()-at;if(next.done)break;
      const iter=detectGroup(next.value,variant,metrics);
      while(true){at=performance.now();const item=iter.next();metrics.detectionMs+=performance.now()-at;if(item.done)break;yield item.value;}
      if(metrics.groups%1000===0)metrics.sampledRSS=Math.max(metrics.sampledRSS,process.memoryUsage().rss);
    }
  }
  try{
    const sink=handle.createWriteStream({autoClose:true});
    const writingAt=performance.now();await writeJsonArray(events(),sink,cause=>controller.abort(cause));
    metrics.writeMs=Math.max(0,performance.now()-writingAt-metrics.readParseMs-metrics.detectionMs);
    const at=performance.now();await (operations.publish||publishNoClobber)(temp,output);metrics.publishMs=performance.now()-at;
    // O resultado já foi publicado; uma falha ao limpar o temporário não pode apagá-lo.
    try{await (operations.removeTemp||unlink)(temp);}catch(e){metrics.cleanupWarning=String(e);}ownTemp=false;
    metrics.sampledRSS=Math.max(metrics.sampledRSS,process.memoryUsage().rss);metrics.totalMs=performance.now()-start;return metrics;
  }finally{
    await groups.return?.(undefined).catch(()=>{});
    await handle.close().catch(()=>{});
    if(ownTemp)await unlink(temp).catch(()=>{});
  }
}
