import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processDataset } from '../src/io.js';
import type { Encounter } from '../src/model.js';

const normalized=(events:Encounter[])=>[...events].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.monitoradosEncontro[0]-b.monitoradosEncontro[0]||a.monitoradosEncontro[1]-b.monitoradosEncontro[1]);
for(const variant of ['A','B0','B1'] as const)for(const n of [1,2])test(`G01 ${variant} calcula a partir da entrada o conteúdo oficial exato do dataset ${n}`,async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-gabarito-'));try{
    const output=join(dir,'computed.json');await processDataset(`DataSets/dataset${n}.txt`,output,variant);
    const got=JSON.parse(await readFile(output,'utf8')),expected=JSON.parse(await readFile(`OutPuts/output${n}.json`,'utf8'));
    assert.equal(got.length,n===1?4:6);assert.deepEqual(normalized(got),normalized(expected));
  }finally{await rm(dir,{recursive:true,force:true});}
});
