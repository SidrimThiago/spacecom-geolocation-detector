import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvents, compareEvents } from '../scripts/verify.js';
const event=()=>({tipo:'generico',monitoradosEncontro:[3,20],timestamp:'2024-01-01 00:00:00',posicoes:{'3':{lat:0,lon:0},'20':{lat:0,lon:0}},distanciaMetros:0});
test('G01 verificador rejeita esquema malformado, duplicatas e distâncias não finitas',()=>{
  assert.equal(validateEvents([event()]).length,1);
  for(const bad of [{...event(),debug:1},{...event(),distanciaMetros:null},{...event(),distanciaMetros:NaN},{...event(),distanciaMetros:20},{...event(),monitoradosEncontro:[3,3]},{...event(),tipo:'invalid'},{...event(),posicoes:{...event().posicoes,other:{lat:0,lon:0}}}])assert.throws(()=>validateEvents([bad]));
  assert.throws(()=>validateEvents([event(),event()]));
});
test('G01 comparação normaliza somente a ordem e detecta divergências de conteúdo, falsos positivos e falsos negativos',()=>{
  const e=event(),reversed={...e,monitoradosEncontro:[20,3]};
  assert.deepEqual(compareEvents([e],[reversed]),{fp:0,fn:0,mismatches:[]});
  assert.equal(compareEvents([e],[]).fp,1);assert.equal(compareEvents([],[e]).fn,1);
  assert.equal(compareEvents([{...e,tipo:'faccao'}],[e]).mismatches.length,1);
  assert.equal(compareEvents([{...e,distanciaMetros:1e-15}],[e]).mismatches.length,1);
});
