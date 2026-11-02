import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, cp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyRun } from '../scripts/verify.js';
import { HEADER } from '../src/parser.js';
import type { Encounter } from '../src/model.js';

// Contraexemplo no sistema de arquivos: somente o mkdtemp externo pertence a este teste.
// O processo filho executa o teste compilado da CLI com relógio fixo e diretórios sentinela preexistentes.
test('R4-C01 limpeza do teste da CLI preserva diretórios sentinela preexistentes com relógio fixo',async()=>{
  await mkdir('OutPuts/gerados',{recursive:true});
  const workspace=await mkdtemp(resolve('OutPuts/gerados/rodada04-cleanup-probe-'));
  try{
    await cp('dist',join(workspace,'dist'),{recursive:true});
    await mkdir(join(workspace,'DataSets'));
    for(const n of [1,2])await copyFile(`DataSets/dataset${n}.txt`,join(workspace,`DataSets/dataset${n}.txt`));
    const sentinels=[];
    for(const suffix of ['','-failed']){
      const foreign=join(workspace,'OutPuts/gerados/test-1234567890000'+suffix);await mkdir(foreign,{recursive:true});
      const sentinel=join(foreign,'sentinel.txt');await writeFile(sentinel,'keep foreign bytes');sentinels.push(sentinel);
    }
    const prelude=join(workspace,'clock.cjs');await writeFile(prelude,'Date.now=()=>1234567890000;');
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--require',prelude,'--test','--test-reporter=tap','--test-name-pattern=production default',join(workspace,'dist/tests/cli.test.js')],{cwd:workspace,env,encoding:'utf8',timeout:20000});
    for(const sentinel of sentinels){assert(existsSync(sentinel),'cleanup deleted a foreign sentinel after namespace collision');assert.equal(await readFile(sentinel,'utf8'),'keep foreign bytes');}
    assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/# tests 1\r?\n/);
  }finally{await rm(workspace,{recursive:true,force:true});}
});

// Esta fixture intencionalmente incompleta do verificador NÃO foi produzida pelo detector.
// Ela adiciona um par omitido conhecido e preserva os quatro resultados positivos oficiais.
test('R4-C02 verificador associa gabaritos oficiais aos bytes do corpus, não ao sufixo do nome',async()=>{
  const fixture=await mkdtemp(resolve('OutPuts/gerados/rodada04-oracle-probe-'));
  try{
    const official:Encounter[]=JSON.parse(await readFile('OutPuts/output1.json','utf8'));
    const rows=['101;;"2024-01-01 00:00:00";0;0;false;', '102;;"2024-01-01 00:00:00";0;0;false;'];
    for(const event of official)for(const [i,id] of event.monitoradosEncontro.entries()){
      const p=event.posicoes[String(id)],victim=event.tipo==='protetiva'&&i===0;
      rows.push(`${id};${event.tipo==='faccao'?'7':''};"${event.timestamp}";${p.lat};${p.lon};${victim};${victim?event.monitoradosEncontro[1]:''}`);
    }
    for(const [index,name] of ['notdataset1.txt','dataset1.txt','renamed-corpus.txt'].entries()){
      const dir=join(fixture,String(index));await mkdir(dir);
      const input=join(dir,name),output=join(dir,'intentionally-partial.json');
      if(index===2)await copyFile('DataSets/dataset1.txt',input);else await writeFile(input,[HEADER,...rows].join('\n'));
      await writeFile(output,JSON.stringify(official));
      await writeFile(join(dir,'manifest.json'),JSON.stringify({results:[{input,output}]}));
      const report=await verifyRun(dir),result=report.results[0];
      assert.equal(result.scoreKnown,index===2,`oracle identity for ${name}`);
      if(index<2){assert.equal(result.official,null);assert.equal(result.records,10);}
      else assert.deepEqual(result.official,{fp:0,fn:0,mismatches:[]});
    }
  }finally{await rm(fixture,{recursive:true,force:true});}
});
