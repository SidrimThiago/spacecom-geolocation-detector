import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('O01 processamento incremental de muitos eventos não retém uma reação de falha pendente por evento',()=>{
  const module=pathToFileURL(resolve('dist/src/io.js')).href;
  const code=`
    import {Writable} from 'node:stream';
    import {writeJsonArray} from ${JSON.stringify(module)};
    let baseline=0,peakGrowth=0,bytes=0;
    async function* events(){for(let i=0;i<60000;i++){
      if(i===1000){global.gc();baseline=process.memoryUsage().heapUsed;}
      if(i===30000||i===59000){global.gc();peakGrowth=Math.max(peakGrowth,process.memoryUsage().heapUsed-baseline);}
      yield {n:i};
    }}
    const sink=new Writable({write(chunk,_encoding,callback){bytes+=chunk.length;callback();}});
    await writeJsonArray(events(),sink);
    console.log(JSON.stringify({peakGrowth,bytes,finished:sink.writableFinished}));
  `;
  const result=spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',code],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);const measured=JSON.parse(result.stdout);
  assert(measured.finished&&measured.bytes>600000);
  assert(measured.peakGrowth<8*1024*1024,`retained heap grew ${measured.peakGrowth} bytes while discarding output`);
});
