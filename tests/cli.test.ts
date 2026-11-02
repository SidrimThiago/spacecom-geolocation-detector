import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,readFile,rm,readdir,writeFile,mkdir,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
const cli=resolve('dist/src/cli.js');
test('CLI exibe ajuda, rejeita argumento inválido e mantém diagnósticos fora de stdout',()=>{
  const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Spacecom/);
  const bad=spawnSync(process.execPath,[cli,'--force'],{encoding:'utf8'});assert.notEqual(bad.status,0);assert.equal(bad.stdout,'');assert.match(bad.stderr,/argument|usage/i);
});
test('O02 junction de saída existente não redireciona a escrita da CLI para fora do diretório de trabalho',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'spacecom-junction-'));try{
    const workspace=join(dir,'workspace'),external=join(dir,'external');await mkdir(workspace);await mkdir(external);await symlink(external,join(workspace,'OutPuts'),'junction');
    const result=spawnSync(process.execPath,[cli,'--dataset','1','--run-id','escape'],{cwd:workspace,encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/OUTPUT_PATH_REDIRECT/);assert.deepEqual(await readdir(external),[]);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI G01 padrão B1 calcula dois arquivos; O02 diretório exclusivo; O01 falha de lote retorna status não zero [production default]',async()=>{
  await mkdir('OutPuts/gerados',{recursive:true});
  const input1=resolve('DataSets/dataset1.txt'),input2=resolve('DataSets/dataset2.txt');
  const dir=await mkdtemp(resolve('OutPuts/gerados/rodada04-cli-')),id='own-run',badID='own-run-failed',generated=join(dir,'OutPuts/gerados');try{
    // A limpeza fica restrita ao diretório exclusivo adquirido por este teste.
    await mkdir(join(dir,'OutPuts'));
    const run=spawnSync(process.execPath,[cli,'--input',input1,'--input',input2,'--run-id',id],{cwd:dir,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,'');const manifest=JSON.parse(await readFile(join(generated,id,'manifest.json'),'utf8'));assert.equal(manifest.results.length,2);
    assert.equal(manifest.variant,'B1');assert.deepEqual(manifest.results.map((m:{variant:string;events:number})=>[m.variant,m.events]),[['B1',4],['B1',6]]);
    assert.deepEqual(manifest.results.map((m:{pairVisits:number})=>m.pairVisits),[4505,23763]);
    const rerun=spawnSync(process.execPath,[cli,'--input',input1,'--run-id',id],{cwd:dir,encoding:'utf8'});assert.notEqual(rerun.status,0);assert.match(rerun.stderr,/EEXIST/);
    const badfile=join(dir,'bad.txt');await writeFile(badfile,'invalid');
    const fail=spawnSync(process.execPath,[cli,'--input',badfile,'--run-id',badID],{cwd:dir,encoding:'utf8'});assert.notEqual(fail.status,0);assert.equal(fail.stdout,'');assert(!(await readdir(join(generated,badID))).some(x=>x.endsWith('.json')));
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
