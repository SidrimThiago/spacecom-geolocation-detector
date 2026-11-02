import type { Coordinates, Encounter, EncounterType, PositionRecord } from './model.js';

export function canonicalPair(a:PositionRecord,b:PositionRecord):[PositionRecord,PositionRecord] {
  return a.id<b.id?[a,b]:[b,a];
}

export function classifyPair(a:PositionRecord,b:PositionRecord):EncounterType|undefined {
  if(a.id===b.id||a.timestamp!==b.timestamp)return undefined;
  if(!a.victim&&!b.victim)return a.faction!==null&&b.faction!==null&&a.faction===b.faction?'faccao':'generico';
  if(a.victim&&b.victim)return undefined;
  const [victim,monitored]=a.victim?[a,b]:[b,a];
  return victim.restrictions.has(monitored.id)?'protetiva':undefined;
}

export function distanceFromA(a:number):number {
  if(!Number.isFinite(a))throw new Error('NONFINITE_HAVERSINE_ARGUMENT');
  const d=(2*6371000)*Math.asin(Math.sqrt(Math.min(1,Math.max(0,a))));
  if(!Number.isFinite(d)||d<0)throw new Error('INVALID_DISTANCE');
  return d;
}

export function haversine(p:Coordinates,q:Coordinates):number {
  for(const c of [p,q])if(!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||Math.abs(c.lat)>90||Math.abs(c.lon)>180)throw new Error('INVALID_COORDINATES');
  const rad=(degrees:number)=>(degrees*Math.PI)/180;
  const deltaPhi=rad(q.lat-p.lat),deltaLambda=rad(q.lon-p.lon);
  const a=Math.sin(deltaPhi/2)**2
    +Math.cos(rad(p.lat))*Math.cos(rad(q.lat))*Math.sin(deltaLambda/2)**2;
  return distanceFromA(a);
}

export function isEncounterDistance(d:number):boolean {
  if(!Number.isFinite(d)||d<0)throw new Error('INVALID_DISTANCE');
  return d<20;
}

export function makeEncounter(a:PositionRecord,b:PositionRecord):Encounter|undefined {
  const tipo=classifyPair(a,b);if(tipo===undefined)return undefined;
  const [p,q]=canonicalPair(a,b),d=haversine(p,q);if(!isEncounterDistance(d))return undefined;
  return {tipo,monitoradosEncontro:[p.id,q.id],timestamp:p.timestamp,
    posicoes:{[p.id]:{lat:p.lat,lon:p.lon},[q.id]:{lat:q.lat,lon:q.lon}},distanciaMetros:d};
}
