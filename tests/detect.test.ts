import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecord } from '../src/parser.js';
import { detectGroup, referenceUnordered } from '../src/detect.js';
import { newStats, type PositionRecord } from '../src/model.js';
const T='2024-01-01 00:00:00';
const r=(id:number,lat:string,lon='0.00000',v=false,fa='',list=''):PositionRecord=>parseRecord(`${id};${fa};"${T}";${lat};${lon};${v};${list}`,1,'synthetic');
const norm=(es:ReturnType<typeof referenceUnordered>)=>es.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.monitoradosEncontro[0]-b.monitoradosEncontro[0]||a.monitoradosEncontro[1]-b.monitoradosEncontro[1]);
function compare(rows:PositionRecord[]){const a=norm(referenceUnordered(rows));for(const variant of ['A','B0','B1'] as const){const stats=newStats();assert.deepEqual(norm([...detectGroup(rows,variant,stats)]),a);assert.equal(stats.events,a.length);}}
test('M04 retorno à referência em B0/B1 preserva entradas de alta precisão ou com expoente sem arredondamento',()=>{
  for(const lat of ['0.00017984','0.00017990','1e-5']){
    const rows=[r(3,'0.00000'),r(20,lat)];compare(rows);
    for(const v of ['B0','B1'] as const){const s=newStats();const e=[...detectGroup(rows,v,s)];assert.equal(s.fallbackGroups,1);assert.equal(e.length,lat==='0.00017990'?0:1);}
  }
});
test('poda por latitude descarta pares esparsos e mantém 18 ticks apenas como candidatos',()=>{
  const rows=[r(3,'0.00000'),r(4,'0.00018'),r(20,'50.00000')];compare(rows);
  for(const v of ['B0','B1'] as const){const s=newStats();assert.equal([...detectGroup(rows,v,s)].length,0);assert.equal(s.candidates,1);assert.equal(s.haversineCalls,1);assert.equal(s.fallbackGroups,0);if(v==='B0')assert.equal(s.pairVisits,3);}
});
test('comparação diferencial com semente fixa cobre grupos esparsos, densos, mesma latitude, papéis e permutações',()=>{
  let state=2027;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let trial=0;trial<100;trial++){
    const rows:PositionRecord[]=[];for(let i=0;i<40;i++){
      const lat=trial%3===0?0:trial%3===1?Math.floor(random()*1000000):Math.floor(random()*40);
      const lon=trial%3===1?Math.floor(random()*1000000):Math.floor(random()*40);
      rows.push(r(i-10,(lat/100000).toFixed(5),(lon/100000).toFixed(5),i%7===0,i%3===0?'0':'',i%7===0?'1,2,3':''));
    }
    compare(rows);compare([...rows].reverse());
  }
});
test('M06 casos de alta latitude, polo, antimeridiano e fronteira geométrica',()=>{
  compare([r(3,'80.00000','0.00001'),r(20,'80.00000','0.00072')]);
  compare([r(3,'90.00000','0.00000'),r(20,'90.00000','180.00000')]);
  compare([r(3,'0.00000','179.99995'),r(20,'0.00000','-179.99995')]);
  compare([r(3,'0.00000'),r(20,'0.00017'),r(30,'0.00018')]);
});
