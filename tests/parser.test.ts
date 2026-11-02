import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADER, parseHeader, parseRecord, recordsEqual, groupsFromLines } from '../src/parser.js';
import { detectGroup, referenceUnordered } from '../src/detect.js';
import { newStats } from '../src/model.js';

const T='2024-01-01 00:00:00',T1='2024-01-01 00:00:05';
const row=(id=3,ts=T,lat='0.00000',faction='',victim='false',list='')=>`${id};${faction};"${ts}";${lat};0.00000;${victim};${list}`;
async function* lines(a:string[]){yield* a;}
async function collect(a:string[]){const out=[];for await(const g of groupsFromLines(lines(a),'fixture.txt'))out.push(g);return out;}

test('P01 sete campos com aspas, lista por vírgulas e cabeçalho com BOM inicial',()=>{
  parseHeader('\uFEFF'+HEADER,'f');
  const r=parseRecord(row(20,T,'-0.00000','7','true','"3,4,3"'),2,'f');
  assert.equal(r.id,20);assert.equal(r.lat,0);assert.equal(r.victim,true);assert.equal(r.faction,7);
  assert.deepEqual([...r.restrictions],[3,4]);assert.equal(r.latTicks,0);
});
test('D13 gramática ampliada de inteiros e P04 consumo completo do campo',()=>{
  assert.equal(parseRecord('-000;;"'+T+'";0;0;false;',2,'f').id,0);
  assert.equal(parseRecord('-7;0;"'+T+'";0;0;false;"+3,-4"',2,'f').faction,0);
  for(const value of ['','12junk','1e3','1.1','0x10','9007199254740993'])assert.throws(()=>parseRecord(`${value};;"${T}";0;0;false;`,2,'f'),/f:2.*idMonitorado/);
});
test('P02 booleanos literais e M04 coordenadas preservam precisão e ticks conservadores',()=>{
  for(const b of ['False','TRUE','0','',' false'])assert.throws(()=>parseRecord(row(3,T,'0','',''+b),4,'f'),/medidaProtetiva/);
  for(const x of ['.5','5.','1e-5','0.00017984','-90','+0.0']){
    const r=parseRecord(row(3,T,x),2,'f');assert.equal(r.lat,Number(x));assert.equal(r.latTicks,null);
  }
  for(const x of ['','NaN','Infinity','1e400','91','0x10','1junk',' 0'])assert.throws(()=>parseRecord(row(3,T,x),2,'f'),/latitude/);
  assert.equal(parseRecord(row(3,T,'-0.00017'),2,'f').latTicks,-17);
});
test('P03 calendário sem fuso horário ou normalização de anos 0/99 por Date',()=>{
  for(const ts of ['2024-02-30 00:00:00','1900-02-29 00:00:00','2024-01-01 24:00:00','2024-01-01 00:00:60','2024-01-01T00:00:00',' '+T])assert.throws(()=>parseRecord(row(3,ts),2,'f'),/timestamp/);
  for(const ts of ['2000-02-29 00:00:00','0000-02-29 00:00:00','0099-01-01 00:00:00'])assert.equal(parseRecord(row(3,ts),2,'f').timestamp,ts);
});
test('P05 rejeita cabeçalho malformado, aspas inválidas, colunas extras, listas inválidas, BOM indevido e linhas vazias',()=>{
  for(const h of ['',HEADER+';extra',HEADER.replace('idMonitorado','IdMonitorado'),HEADER.split(';').reverse().join(';')])assert.throws(()=>parseHeader(h,'f'));
  for(const r of ['',row()+';extra',row().replace('"'+T+'"','"'+T),row().replace('"'+T+'"','"'+T+'"x'),row(3,T,'0','','true','"3,,4"'),row(3,T,'0','','true','"3, 4"'),'\uFEFF'+row()])assert.throws(()=>parseRecord(r,2,'f'));
});
test('P06 somente cabeçalho válido produz resultado vazio; ausência de cabeçalho gera erro',async()=>{
  assert.deepEqual(await collect([HEADER]),[]);await assert.rejects(()=>collect([]),/HEADER/);
});
test('U01 igualdade usa valores tipados normalizados e conjuntos de restrições',async()=>{
  const a=parseRecord('020;7;"'+T+'";-0.00000;0;true;"3,4,3"',2,'f');
  const b=parseRecord('20;+07;"'+T+'";0.00000;0.000;true;"4,3"',3,'f');
  assert(recordsEqual(a,b));const stats=newStats();const gs=[];
  for await(const g of groupsFromLines(lines([HEADER,'020;7;"'+T+'";-0.00000;0;true;"3,4,3"','20;+07;"'+T+'";0.00000;0.000;true;"4,3"',row(3),row(4)]),'f',stats))gs.push(g);
  assert.equal(gs[0].length,3);assert.equal(stats.duplicates,1);
  assert.equal([...detectGroup(gs[0],'A')].length,3);
});
test('U02/U03 posições e campos inativos geram conflito, sem escolher o primeiro ou o último registro',async()=>{
  await assert.rejects(()=>collect([HEADER,row(),row(3,T,'0.000000001')]),/DUPLICATE_CONFLICT/);
  await assert.rejects(()=>collect([HEADER,row(20,T,'0','7','true','3'),row(20,T,'0','8','true','3')]),/DUPLICATE_CONFLICT/);
});
test('T01/T02/T03 grupos não decrescentes, timestamp exato e mesmo par permitido em instante posterior',async()=>{
  const gs=await collect([HEADER,row(3),row(20),row(3,T1),row(20,T1)]);
  assert.equal(gs.length,2);assert.equal(gs.flatMap(g=>[...detectGroup(g,'A')]).length,2);
  await assert.rejects(()=>collect([HEADER,row(3),row(9,T1),row(20)]),/TIMESTAMP_OUT_OF_ORDER/);
  await assert.rejects(()=>collect([HEADER,row(9,T1),row(3)]),/TIMESTAMP_OUT_OF_ORDER/);
  const unordered=[parseRecord(row(3),2,'f'),parseRecord(row(9,T1),3,'f'),parseRecord(row(20),4,'f')];
  const events=referenceUnordered(unordered);assert.equal(events.length,1);assert.deepEqual(events[0].monitoradosEncontro,[3,20]);
});
test('D08/D09/D10 relações muitos-para-muitos e campos inativos não criam papéis',async()=>{
  const gs=await collect([HEADER,row(20,T,'0','7','true','"3,4"'),row(30,T,'0','','true','"3,4"'),row(3,T,'0','7'),row(4,T,'0','8')]);
  const events=[...detectGroup(gs[0],'A')];assert.equal(events.length,5);assert.equal(events.filter(e=>e.tipo==='protetiva').length,4);
  assert.deepEqual(events.map(e=>[e.tipo,...e.monitoradosEncontro]),[
    ['generico',3,4],['protetiva',3,20],['protetiva',3,30],['protetiva',4,20],['protetiva',4,30],
  ]);
});
test('D13 caso de três IDs com esperado explícito, incluindo facção vazia e facção zero',async()=>{
  const gs=await collect([HEADER,'-7;0;"'+T+'";0;0;false;','-000;-0;"'+T+'";0;0;false;','000042;;"'+T+'";0;0;false;']);
  assert.deepEqual([...detectGroup(gs[0],'A')].map(e=>[e.tipo,...e.monitoradosEncontro]),[['faccao',-7,0],['generico',-7,42],['generico',0,42]]);
});
test('D11/D12/D14 mudanças de atributos, alvo não simultâneo e arquivos independentes',async()=>{
  const gs=await collect([HEADER,row(20,T,'0','','true','3'),row(3,T1)]);assert.equal(gs.flatMap(g=>[...detectGroup(g,'A')]).length,0);
  const changed=await collect([HEADER,row(3),row(20),row(3,T1),row(20,T1,'0','','true','3')]);
  assert.deepEqual(changed.flatMap(g=>[...detectGroup(g,'A')]).map(e=>e.tipo),['generico','protetiva']);
  const first=await collect([HEADER,row(3),row(20)]),second=await collect([HEADER,row(3),row(20)]);
  assert.equal([...detectGroup(first[0],'A')].length,1);assert.equal([...detectGroup(second[0],'A')].length,1);
});
test('O03 permutação da entrada preserva eventos completos e associação canônica',async()=>{
  const a=await collect([HEADER,row(3),row(20,T,'0.00001'),row(4,T,'0.00002')]);
  const b=await collect([HEADER,row(4,T,'0.00002'),row(3),row(20,T,'0.00001')]);
  assert.deepEqual([...detectGroup(a[0],'A')],[...detectGroup(b[0],'A')]);
});
