import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPair, canonicalPair, haversine, distanceFromA, isEncounterDistance, makeEncounter } from '../src/domain.js';
import type { PositionRecord } from '../src/model.js';

const T='2024-01-01 00:00:00';
export function record(id:number, victim=false, faction:number|null=null, restrictions:number[]=[], lat=0,lon=0):PositionRecord {
  return {id,victim,faction,restrictions:new Set(restrictions),lat,lon,timestamp:T,latTicks:lat===0?0:null,line:1};
}
const cases:[string,PositionRecord,PositionRecord,string|undefined][]=[
  ['D01',record(3,false,7),record(20,false,7),'faccao'],
  ['D02',record(3),record(20),'generico'],
  ['D03',record(3,false,7),record(20,false,8),'generico'],
  ['D04',record(3),record(20,false,7),'generico'],
  ['D05',record(20,true,null,[3]),record(3),'protetiva'],
  ['D06',record(20,true,null,[9]),record(3),undefined],
  ['D07',record(20,true,null,[30]),record(30,true,null,[20]),undefined],
  ['D09',record(20,true,7,[3]),record(3,false,7,[20]),'protetiva'],
  ['D09',record(20,true,7,[3]),record(4,false,7,[20]),undefined],
  ['D10',record(20,true),record(3,false,null,[20]),undefined],
  ['D13',record(-7,false,0),record(0,false,-0),'faccao'],
];
for(const [id,a,b,want] of cases)test(`${id} classificação por papel ${a.id}/${b.id}`,()=>{
  assert.equal(classifyPair(a,b),want);assert.equal(classifyPair(b,a),want);
});
test('D05 identidade canônica preserva posições e direção da medida protetiva',()=>{
  const a=record(20,true,null,[3],0,.00001),b=record(3);
  assert.deepEqual(canonicalPair(a,b).map(x=>x.id),[3,20]);
  const e=makeEncounter(a,b)!;assert.deepEqual(e.monitoradosEncontro,[3,20]);assert.deepEqual(e.posicoes['20'],{lat:0,lon:.00001});
  assert.deepEqual(Object.keys(e).sort(),['tipo','monitoradosEncontro','timestamp','posicoes','distanciaMetros'].sort());
  assert.deepEqual(makeEncounter(a,b),makeEncounter(b,a));
});
test('não há par com o próprio ID nem evento entre timestamps diferentes',()=>{
  assert.equal(makeEncounter(record(3),record(3)),undefined);
  assert.equal(makeEncounter(record(3),{...record(20),timestamp:'2024-01-01 00:00:05'}),undefined);
});
test('M01 predicado estrito sem arredondar ou ocultar valores não finitos',()=>{
  assert.equal(isEncounterDistance(19.999),true);assert.equal(isEncounterDistance(20),false);assert.equal(isEncounterDistance(20.001),false);
  for(const n of [NaN,Infinity,-Infinity,-1])assert.throws(()=>isEncounterDistance(n));
});
test('M02 coordenadas idênticas e arco independente de um grau',()=>{
  const p={lat:12.5,lon:-43.25};assert.equal(haversine(p,p),0);
  assert(Math.abs(haversine({lat:0,lon:0},{lat:0,lon:1})-111194.926644558737)<1e-7);
});
test('M03 ticks 17/18 permanecem em lados opostos do limiar de 20',()=>{
  assert(isEncounterDistance(haversine({lat:0,lon:0},{lat:.00017,lon:0})));
  assert(!isEncounterDistance(haversine({lat:0,lon:0},{lat:.00018,lon:0})));
});
test('M05 arco meridional diádico tem referência analítica independente',()=>{
  assert(Math.abs(haversine({lat:45,lon:0},{lat:45+1/65536,lon:0})-1.696699930489482686)<1e-7);
});
test('M06 antimeridiano e polos sem normalização especial',()=>{
  assert(Math.abs(haversine({lat:0,lon:179.99995},{lat:0,lon:-179.99995})-11.119492664455874)<1e-7);
  const d=haversine({lat:90,lon:0},{lat:90,lon:180});assert(d>=0&&d<1e-7);
});
test('M07 finitude de a é verificada antes do clamp e coordenadas inválidas são rejeitadas',()=>{
  assert.equal(distanceFromA(1+2**-50),Math.PI*6371000);
  assert.equal(distanceFromA(-(2**-50)),0);
  for(const a of [NaN,Infinity,-Infinity])assert.throws(()=>distanceFromA(a));
  for(const p of [{lat:NaN,lon:0},{lat:91,lon:0},{lat:0,lon:181},{lat:0,lon:Infinity}])assert.throws(()=>haversine(p,{lat:0,lon:0}));
});
