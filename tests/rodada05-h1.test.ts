import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {HEADER,groupsFromLines,parseRecord} from '../src/parser.js';
import {detectGroup} from '../src/detect.js';
import {processDataset} from '../src/io.js';
import type {Encounter,Variant} from '../src/model.js';

const T='2024-01-01 00:00:00',U='2024-01-01 00:00:05',V='2024-01-01 00:00:10';
const row=(id:number,t=T,lat='0.00000',lon='0.00000',victim='false',faction='',list='')=>`${id};${faction};${JSON.stringify(t)};${lat};${lon};${victim};${list}`;
async function* lines(rows:string[]){yield HEADER;yield* rows;}
async function collect(rows:string[],source='H1-fixture'){const out=[];for await(const g of groupsFromLines(lines(rows),source))out.push(g);return out;}

// Mutação: H1 ausente, cache global, validação pública ignorada ou reutilização não consecutiva.
// O observador restrito delega ao RegExp.exec real, sem alterar seu comportamento, em processo filho isolado.
// Não introduz hook de produção, transformação da fonte ou resultado simulado de validação.
test('H1-01 observador da validação real identifica somente reutilização positiva consecutiva por dataset',async()=>{
  const parser=pathToFileURL(resolve('dist/src/parser.js')).href;
  const cases:[string,number][]=[['groups',2],['public',2],['independent',2],['alternating',3],['invalid',2]];
  for(const [mode,calls]of cases){
      const code=`import assert from 'node:assert/strict';import{parseRecord,groupsFromLines,HEADER}from ${JSON.stringify(parser)};
      const T=${JSON.stringify(T)},U=${JSON.stringify(U)},mode=${JSON.stringify(mode)};
      const pattern=${JSON.stringify('^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2})$')};
      let validations=0;const exec=RegExp.prototype.exec;
      RegExp.prototype.exec=function(input){if(this.source===pattern&&this.flags==='')validations++;return Reflect.apply(exec,this,[input]);};
      const row=(id,t)=>id+';;"'+t+'";0.00000;0.00000;false;';
      async function* ls(rows){yield HEADER;yield* rows;}async function run(rows){const out=[];for await(const g of groupsFromLines(ls(rows),'coverage-fixture'))out.push(g);return out;}
      if(mode==='groups'){const g=await run([row(1,T),row(2,T),row(3,T),row(1,U),row(2,U)]);assert.deepEqual(g.map(x=>x.length),[3,2]);assert.deepEqual(g.map(x=>x[0].timestamp),[T,U]);}
      if(mode==='public'){parseRecord(row(1,T),2,'public');parseRecord(row(2,T),3,'public');}
      if(mode==='independent'){const gs=await Promise.all([run([row(1,T),row(2,T)]),run([row(3,T),row(4,T)])]);assert.deepEqual(gs.map(g=>g[0].length),[2,2]);}
      if(mode==='alternating')await assert.rejects(()=>run([row(1,T),row(1,U),row(1,T)]),e=>e.code==='TIMESTAMP_OUT_OF_ORDER');
      if(mode==='invalid')for(let i=0;i<2;i++)assert.throws(()=>parseRecord(row(1,'2024-02-30 00:00:00'),2,'public'),e=>e.code==='INVALID_INPUT');
      RegExp.prototype.exec=exec;console.log(JSON.stringify({mode,ok:true,validations}));`;
      const env:NodeJS.ProcessEnv={...process.env};delete env.NODE_TEST_CONTEXT;delete env.NODE_V8_COVERAGE;
      const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000});
      assert.equal(r.status,0,r.stdout+r.stderr);const observed=JSON.parse(r.stdout);
      assert.equal(observed.mode,mode);assert.equal(observed.ok,true);
      assert.equal(observed.validations,calls,`${mode}: actual full timestamp validations`);
  }
});

// Mutação: expor cache ou atalho público, ou reutilizar falhas entre chamadas diretas.
test('H1-02 parseRecord público não permite contornar a validação com argumentos extras ou strings inválidas repetidas',()=>{
  for(const invalid of ['1900-02-29 00:00:00','2024-02-30 00:00:00',T+' ',T+'Z'])for(let i=0;i<2;i++){
    assert.throws(()=>Reflect.apply(parseRecord,undefined,[row(1,invalid),3,'public',invalid,{lastValidatedTimestamp:invalid}]),/public:3 timestamp INVALID_INPUT/);
  }
});

// Mutação: reutilizar registro/perfil inteiro ou ignorar validações não temporais em um acerto de cache.
test('H1-03 timestamp válido repetido mantém a validação dos demais campos e a ordem dos erros',async()=>{
  const malformed:[string,string][]=[
    [`x;;"${T}";0;0;false;`,'idMonitorado'],[`2;x;"${T}";0;0;false;`,'faccaoMonitorado'],
    [row(2,T,'91'),'latitude'],[row(2,T,'0','181'),'longitude'],[row(2,T,'0','0','FALSE'),'medidaProtetiva'],[row(2,T,'0','0','false','','x'),'idsRestricaoMedida'],
  ];
  for(const [bad,field]of malformed)await assert.rejects(()=>collect([row(1),bad]),new RegExp(`H1-fixture:3 ${field} INVALID_INPUT`));
  await assert.rejects(()=>collect([row(1),`x;;"not-a-date";91;181;FALSE;x`]),/H1-fixture:3 idMonitorado INVALID_INPUT/);
});

// Mutação: igualdade aproximada por prefixo, trim ou cadência reutiliza token inválido.
test('H1-04 igualdade após decodificar CSV é exata e valores inválidos semelhantes não herdam sucesso',async()=>{
  const gs=await collect([row(1),`2;;${T};0.00000;0.00000;false;`]);assert.equal(gs[0].length,2);assert.equal(gs[0][1].timestamp,T);
  for(const invalid of [T+' ',T+'\t',T+'.000',T+'Z',T+'+00:00','2024-01-01T00:00:00'])await assert.rejects(()=>collect([row(1),row(2,invalid)]),/timestamp INVALID_INPUT/);
});

// Mutação: contaminar cache após falha, continuar após linha inválida ou vazar estado entre arquivos.
test('H1-05 valor inválido entre sucessos repetidos encerra o fluxo sem contaminar outro dataset',async()=>{
  const bad='2024-02-30 00:00:00';let reachedAfterBad=false,closed=false;
  async function* input(){try{yield HEADER;yield row(1);yield row(2,bad);reachedAfterBad=true;yield row(3);}finally{closed=true;}}
  await assert.rejects(async()=>{for await(const _g of groupsFromLines(input(),'middle')){/* consume */}},/middle:3 timestamp INVALID_INPUT/);
  assert(closed);assert.equal(reachedAfterBad,false);
  for(let i=0;i<2;i++)await assert.rejects(()=>collect([row(1,bad)],'new-file'),/new-file:2 timestamp INVALID_INPUT/);
  const [a,b]=await Promise.all([collect([row(1),row(2)]),collect([row(3),row(4)])]);assert.deepEqual([a[0].length,b[0].length],[2,2]);
});

// Mutação: deixar de validar a mudança de timestamp ou alterar regras de ano bissexto/calendário proléptico.
test('H1-06 transições do calendário e datas bissextas repetidas preservam as regras de aceitação',async()=>{
  const dates=['0000-02-29 00:00:00','1900-03-01 00:00:00','2000-02-29 00:00:00','2024-02-29 23:59:59','2024-03-01 00:00:00','9999-12-31 23:59:59'];
  const gs=await collect(dates.flatMap(t=>[row(1,t),row(2,t)]));assert.deepEqual(gs.map(g=>g[0].timestamp),dates);assert(gs.every(g=>g.length===2));
  for(const t of ['1900-02-29 00:00:00','2024-02-30 00:00:00','2024-13-01 00:00:00','2024-01-01 24:00:00'])await assert.rejects(()=>collect([row(1),row(2,t)]),/timestamp INVALID_INPUT/);
});

// Mutação: guardar atributos mutáveis de pessoas ou ignorar conflitos de duplicatas normalizadas.
test('H1-07 mudanças de papéis, facções e metadados duplicados preservam os eventos esperados explícitos e independentes',async()=>{
  const rows=[row(1,T,'0.00000','0','false','7'),row(2,T,'0.00000','0','false','7'),row(1,T,'0e0','0','false','7'),
    row(1,U,'0','0','true','99','2'),row(2,U,'0','0','false','8'),row(1,V),row(2,V)];
  const expected:Encounter[]=[{tipo:'faccao',monitoradosEncontro:[1,2],timestamp:T,posicoes:{'1':{lat:0,lon:0},'2':{lat:0,lon:0}},distanciaMetros:0},
    {tipo:'protetiva',monitoradosEncontro:[1,2],timestamp:U,posicoes:{'1':{lat:0,lon:0},'2':{lat:0,lon:0}},distanciaMetros:0},
    {tipo:'generico',monitoradosEncontro:[1,2],timestamp:V,posicoes:{'1':{lat:0,lon:0},'2':{lat:0,lon:0}},distanciaMetros:0}];
  for(const v of ['A','B0','B1'] as Variant[]){const gs=await collect(rows);assert.equal(gs[0][0].latTicks,null);assert.deepEqual(gs.flatMap(g=>[...detectGroup(g,v)]),expected);}
  await assert.rejects(()=>collect([row(1),row(1,T,'0','0','false','','2')]),/DUPLICATE_CONFLICT/);
});

// Mutação: reutilizar o primeiro timestamp sem preservar a comparação de monotonicidade.
test('H1-08 T1,T2,T1 continua rejeitado após a entrega do primeiro grupo',async()=>{
  const it=groupsFromLines(lines([row(1),row(2),row(1,U),row(1)]),'regression');
  const first=await it.next();assert(!first.done);assert.equal(first.value[0].timestamp,T);
  await assert.rejects(()=>it.next(),/regression:5 timestamp TIMESTAMP_OUT_OF_ORDER/);
});

// Mutação: UTF-8 inválido ao final permite publicação parcial ou remove resultado anterior completo.
test('H1-09 UTF-8 inválido ao final impede a publicação sem remover resultado anterior completo',async()=>{
  const dir=await mkdtemp(resolve('OutPuts/gerados/rodada05-late-'));
  try{
    const out=join(dir,'out');await mkdir(out);const good=join(dir,'good.txt'),bad=join(dir,'bad.txt');
    await writeFile(good,[HEADER,row(1),row(2)].join('\n'));
    await writeFile(bad,Buffer.concat([Buffer.from([HEADER,row(1),row(2),...Array.from({length:7000},()=>row(1,U))].join('\n')+'\n'),Buffer.from([255])]));
    const completed=await processDataset(good,join(out,'good.json'),'B1');assert.equal(completed.events,1);
    const before=await readFile(join(out,'good.json'));
    await assert.rejects(()=>processDataset(bad,join(out,'bad.json'),'B1'),/INVALID_UTF8/);
    assert.deepEqual(await readdir(out),['good.json']);assert.deepEqual(await readFile(join(out,'good.json')),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});
