import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Writable } from 'node:stream';
import { HEADER, groupsFromLines, parseRecord } from '../src/parser.js';
import { detectGroup } from '../src/detect.js';
import { newStats, type Encounter, type EncounterType, type Variant } from '../src/model.js';
import { haversine } from '../src/domain.js';
import { writeJsonArray } from '../src/io.js';

const T='2024-01-01 00:00:00', T2='2024-01-01 00:00:05';
const variants:Variant[]=['A','B0','B1'];
const row=(id:number|string,lat='0.00000',lon='0.00000',victim=false,faction='',list='',timestamp=T)=>
  `${id};${faction};"${timestamp}";${lat};${lon};${victim};"${list}"`;
async function* lines(rows:string[]){yield HEADER;yield* rows;}
async function groups(rows:string[]){const out=[];for await(const g of groupsFromLines(lines(rows),'R4-fixture'))out.push(g);return out;}
const normalized=(events:Encounter[])=>events.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.monitoradosEncontro[0]-b.monitoradosEncontro[0]||a.monitoradosEncontro[1]-b.monitoradosEncontro[1]);
// Gerador exclusivo dos testes: as distâncias zero esperadas correspondem a pontos coincidentes.
const zero=(tipo:EncounterType,a:number,b:number,timestamp=T):Encounter=>({tipo,monitoradosEncontro:[a,b],timestamp,posicoes:{[a]:{lat:0,lon:0},[b]:{lat:0,lon:0}},distanciaMetros:0});

// Mutação: a ordem de duplicatas lexicais habilita ticks indevidamente ou duplica encontros.
test('R4-A01 U01 duplicatas equivalentes 0.00000/0e0 em ambas as ordens forçam retorno seguro à referência em B0/B1',async()=>{
  const first=row('020','0.00000','-0',true,'+00','03,4,3');
  const second=row(20,'0e0','0',true,'-0','4,03');
  const expected=[zero('generico',3,4),zero('protetiva',3,20),zero('protetiva',4,20)];
  for(const order of [[first,second],[second,first]]){
    const stats=newStats();const gs=[];
    for await(const g of groupsFromLines(lines([...order,row(3),row(4)]),'R4-duplicate',stats))gs.push(g);
    assert.equal(gs[0].length,3);assert.equal(stats.duplicates,1);
    for(const variant of variants){
      const s=newStats();assert.deepEqual(normalized([...detectGroup(gs[0],variant,s)]),expected);
      assert.equal(s.fallbackGroups,variant==='A'?0:1);
    }
  }
});

// Mutação: igualdade com epsilon ou omissão de campo inativo aceita conflito indevidamente.
test('R4-A02 U02/U03 sintaxe alternativa não oculta conflitos reais de coordenadas ou listas inativas',async()=>{
  for(const rows of [
    [row('000','0e0'),row('-0','0.000000001')],
    [row('000','0e0','0',false,'','3,4'),row('-0','-0','0',false,'','3,5')],
  ])await assert.rejects(()=>groups(rows),/DUPLICATE_CONFLICT/);
});

// Mutação: restringir IDs a positivos, ordenar como texto ou confundir ID e posição.
test('R4-A03 D13 limites de inteiros seguros e IDs negativos adjacentes mantêm pares canônicos distintos',async()=>{
  const a=-9007199254740991,b=-9007199254740990,c=9007199254740991;
  const [g]=await groups([row(c),row(b),row(a)]);
  for(const variant of variants)assert.deepEqual(normalized([...detectGroup(g,variant)]),[zero('generico',a,b),zero('generico',a,c),zero('generico',b,c)]);
});

// Mutação: diferença de latitude com sinal, borda exclusiva da janela ou candidato tratado como evento.
test('R4-A04 M03 ticks 17/18/19 negativos e cruzando o equador preservam geometria e limite de candidatos',()=>{
  for(const base of [-1000000,-9])for(const delta of [17,18,19]){
    const a=parseRecord(row(20,(base/100000).toFixed(5)),2,'R4-ticks');
    const b=parseRecord(row(3,((base+delta)/100000).toFixed(5)),3,'R4-ticks');
    const analytic:Record<number,number>={17:18.903137529574985,18:20.015086796020573,19:21.12703606246616};
    assert(Math.abs(haversine(a,b)-analytic[delta])<1e-7);
    for(const variant of variants){
      const s=newStats(),events=[...detectGroup([a,b],variant,s)];
      assert.equal(events.length,delta===17?1:0);
      assert.equal(s.candidates,variant==='A'||delta<=18?1:0);
      assert.equal(s.fallbackGroups,0);
      if(events.length)assert.deepEqual(events[0].monitoradosEncontro,[3,20]);
    }
  }
});

// Mutação: arredondar representações numéricas válidas para ticks perde pares próximos.
test('R4-A05 M04 coordenadas +0/-0/.5, com expoente ou seis casas, retornam à referência sem alterar posições',async()=>{
  for(const token of ['+0','-0','0.000000','1e-5','.5','5e-1']){
    const numeric=Number(token),other=numeric.toFixed(5);
    const [g]=await groups([row(3,token),row(20,other)]);
    for(const variant of variants){
      const s=newStats(),es=[...detectGroup(g,variant,s)];
      assert.equal(es.length,1);assert.equal(es[0].distanciaMetros,0);
      assert.deepEqual(es[0].posicoes,{'3':{lat:numeric===0?0:numeric,lon:0},'20':{lat:numeric===0?0:numeric,lon:0}});
      assert.equal(s.fallbackGroups,variant==='A'?0:1);
    }
  }
});

// Referências geométricas independentes: arcos meridionais/equatoriais, sem usar makeEncounter.
test('R4-A06 M06 pares próximos ao polo e no antimeridiano são mantidos com posições canônicas',()=>{
  const cases:[string,string,string,string,number][]=[
    ['89.99999','0.00000','89.99999','90.00000',1.572533733278164],
    ['0.00000','179.99995','0.00000','-179.99995',11.119492664455874],
  ];
  for(const [lat1,lon1,lat2,lon2,expected]of cases){
    const a=parseRecord(row(20,lat1,lon1),2,'R4-geometric'),b=parseRecord(row(3,lat2,lon2),3,'R4-geometric');
    const d=haversine(a,b);assert(Math.abs(d-expected)<1e-7,'local analytic tolerance, not encounter epsilon');
    for(const variant of variants){const es=[...detectGroup([a,b],variant)];assert.equal(es.length,1);assert(Math.abs(es[0].distanciaMetros-expected)<1e-7);assert.deepEqual(es[0].monitoradosEncontro,[3,20]);assert.deepEqual(es[0].posicoes['20'],{lat:Number(lat1),lon:Number(lon1)});}
  }
});

// Mutação: a ordem da entrada, duplicatas retransmitidas ou um ID distante alteram os resultados.
test('R4-A07 O03 semente 20261031, permutações, duplicatas e adições distantes preservam o grafo explícito de cinco arestas',async()=>{
  const base=[row(20,'0.00000','0',true,'7','3,4'),row(30,'0.00000','0',true,'','3,4'),row(3,'0.00000','0',false,'7'),row(4,'0.00000','0',false,'8')];
  const expected=[zero('generico',3,4),zero('protetiva',3,20),zero('protetiva',3,30),zero('protetiva',4,20),zero('protetiva',4,30)];
  let state=20261031;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let trial=0;trial<30;trial++){
    const rows=[...base,base[trial%base.length],...Array.from({length:10},(_,i)=>row(100+i,'50.00000',String(-100+i)))];
    for(let i=rows.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
    const [g]=await groups(rows);
    for(const variant of variants)assert.deepEqual(normalized([...detectGroup(g,variant)]),expected,`trial ${trial}, seed 20261031, ${variant}`);
  }
});

// Mutação: perfil congelado, restrição invertida ou facção alteram pares não relacionados.
test('R4-A08 D08/D12/T01 mudanças de vínculos e facções afetam apenas as arestas esperadas entre instantes',async()=>{
  const rows=[row(3,'0','0',false,'7'),row(4,'0','0',false,'8'),row(20,'0','0',true,'','3,4'),
    row(3,'0','0',false,'7','',T2),row(4,'0','0',false,'7','',T2),row(20,'0','0',true,'','4',T2)];
  const gs=await groups(rows),expected=[zero('generico',3,4),zero('protetiva',3,20),zero('protetiva',4,20),zero('faccao',3,4,T2),zero('protetiva',4,20,T2)];
  for(const variant of variants)assert.deepEqual(normalized(gs.flatMap(g=>[...detectGroup(g,variant)])),expected);
});

// Mutação: ausência de backpressure real ou perda do ENOSPC original após destroy secundário.
test('R4-A09 O01 barreira de drain lento limita a produção e preserva ENOSPC simulado',async()=>{
  let entered!:()=>void,release!:()=>void,produced=0,closed=false;
  const blocked=new Promise<void>(r=>entered=r),error=Object.assign(new Error('simulated disk full'),{code:'ENOSPC'});
  const sink=new Writable({highWaterMark:1,write(chunk,_encoding,cb){if(chunk.toString()==='[')cb();else{release=()=>cb(error);entered();}}});
  async function* events(){try{for(let i=0;i<10000;i++){produced++;yield {n:i};}}finally{closed=true;}}
  const pending=writeJsonArray(events(),sink);void pending.catch(()=>{});
  await blocked;assert.equal(produced,1);assert(sink.writableNeedDrain);release();
  await assert.rejects(()=>pending,e=>e===error);assert(closed);
});

// Mutação: desfazer o lote apaga resultado válido anterior ou a regressão publica arquivo parcial.
test('R4-A10 T02/O01 lote parcial da CLI mantém arquivo completo e rejeita T1,T2,T1 sem publicar o final',async()=>{
  const fixture=await mkdtemp(resolve('OutPuts/gerados/rodada05-fixture-')),id='own-run';
  const run=join(fixture,'OutPuts/gerados',id);
  try{
    await mkdir(join(fixture,'OutPuts'));
    const good=join(fixture,'good.txt'),bad=join(fixture,'regress.txt');
    await writeFile(good,[HEADER,row(3),row(20)].join('\n'));
    await writeFile(bad,[HEADER,row(3),row(20),row(3,'0','0',false,'','',T2),row(20)].join('\n'));
    const result=spawnSync(process.execPath,[resolve('dist/src/cli.js'),'--input',good,'--input',bad,'--run-id',id],{cwd:fixture,encoding:'utf8',timeout:10000});
    assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/TIMESTAMP_OUT_OF_ORDER/);assert.match(result.stderr,/outside T1 profile/);
    assert.deepEqual(JSON.parse(await readFile(join(run,'1-good.json'),'utf8')),[zero('generico',3,20)]);
    assert.deepEqual(await readdir(run),['1-good.json']);
  }finally{await rm(fixture,{recursive:true,force:true});}
});

// Mutação: tratamento especial do hemisfério sul ou erro comum de latitude negativa.
test('R4-A11 M06 longitudes opostas no polo sul ficam em lados distintos de 20 por arcos meridionais independentes',()=>{
  for(const [latitude,expected,inside]of [['-89.99992',17.791188263129398,true],['-89.99991',20.015086796020573,false]] as const){
    const a=parseRecord(row(20,latitude,'0.00000'),2,'R4-south'),b=parseRecord(row(3,latitude,'-180.00000'),3,'R4-south');
    assert(Math.abs(haversine(a,b)-expected)<1e-7);
    for(const variant of variants){const es=[...detectGroup([a,b],variant)];assert.equal(es.length,inside?1:0);if(inside){assert.equal(es[0].tipo,'generico');assert.deepEqual(es[0].monitoradosEncontro,[3,20]);assert(Math.abs(es[0].distanciaMetros-expected)<1e-7);}}
  }
});
