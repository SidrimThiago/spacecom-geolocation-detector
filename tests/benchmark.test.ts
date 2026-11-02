import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize,consumeGroups,validateRepetitions } from '../scripts/benchmark.js';
import { parseRecord } from '../src/parser.js';
test('resumos do benchmark usam média, mediana e dispersão populacional e preservam o tamanho da amostra',()=>{
  assert.deepEqual(summarize([1,2,3,4,5]),{n:5,mean:3,median:3,min:1,max:5,stddev:Math.sqrt(2)});
  assert.deepEqual(summarize([7]),{n:1,mean:7,median:7,min:7,max:7,stddev:0});
  assert.throws(()=>summarize([]));assert.throws(()=>summarize([NaN]));
});
test('repetições do benchmark rejeitam valores não finitos ou fracionários antes de qualquer I/O',()=>{
  for(const n of [Infinity,-Infinity,NaN,5.5,4,0])assert.throws(()=>validateRepetitions(n));
  assert.equal(validateRepetitions(5),5);
});
test('checksum do microbenchmark usa IDs inteiros exatos, não somas de distâncias sensíveis à ordem',()=>{
  const rows=Array.from({length:5},(_,i)=>parseRecord(`${i};;"2024-01-01 00:00:00";${((4-i)/100000).toFixed(5)};0;false;`,i+2,'fixture'));
  assert.deepEqual(consumeGroups([rows],'B0'),{events:10,sum:40});
  assert.deepEqual(consumeGroups([rows],'B1'),{events:10,sum:40});
});
