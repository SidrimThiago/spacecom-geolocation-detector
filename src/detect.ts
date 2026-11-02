import { classifyPair, makeEncounter } from './domain.js';
import type { DetectionStats, Encounter, PositionRecord, Variant } from './model.js';
import { addUnique } from './parser.js';

export function* detectGroup(records:readonly PositionRecord[],variant:Variant='A',stats?:DetectionStats):Generator<Encounter> {
  if(stats)stats.groups++;
  let active=variant;
  if(variant!=='A'&&records.some(r=>r.latTicks===null)){active='A';if(stats)stats.fallbackGroups++;}
  const sorted=[...records].sort(active==='B1'?(a,b)=>a.latTicks!-b.latTicks!||a.id-b.id:(a,b)=>a.id-b.id);
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
    const a=sorted[i],b=sorted[j];if(stats)stats.pairVisits++;
    if(active!=='A'&&Math.abs(a.latTicks!-b.latTicks!)>18){if(active==='B1')break;continue;}
    if(stats)stats.candidates++;
    if(classifyPair(a,b)===undefined)continue;
    if(stats)stats.haversineCalls++;const event=makeEncounter(a,b);
    if(event){if(stats)stats.events++;yield event;}
  }
}

/** Referência pequena para testes: sem exigência de ordem temporal e sem poda espacial. */
export function referenceUnordered(records:readonly PositionRecord[]):Encounter[] {
  const groups=new Map<string,Map<number,PositionRecord>>();
  for(const r of records){let g=groups.get(r.timestamp);if(!g){g=new Map();groups.set(r.timestamp,g);}addUnique(g,r,'reference');}
  const events:Encounter[]=[];
  for(const timestamp of [...groups.keys()].sort()){
    const rows=[...groups.get(timestamp)!.values()].sort((a,b)=>a.id-b.id);
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const event=makeEncounter(rows[i],rows[j]);if(event)events.push(event);}
  }
  return events;
}
