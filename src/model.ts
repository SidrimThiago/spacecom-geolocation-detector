export interface Coordinates { lat:number; lon:number }
export interface PositionRecord extends Coordinates {
  id:number;
  faction:number|null;
  timestamp:string;
  victim:boolean;
  restrictions:ReadonlySet<number>;
  latTicks:number|null;
  line:number;
}
export type EncounterType='generico'|'faccao'|'protetiva';
export type Variant='A'|'B0'|'B1';
export interface Encounter {
  tipo:EncounterType;
  monitoradosEncontro:[number,number];
  timestamp:string;
  posicoes:Record<string,Coordinates>;
  distanciaMetros:number;
}
export interface DetectionStats {
  groups:number;
  records:number;
  duplicates:number;
  pairVisits:number;
  candidates:number;
  haversineCalls:number;
  events:number;
  fallbackGroups:number;
}
export function newStats():DetectionStats {
  return {groups:0,records:0,duplicates:0,pairVisits:0,candidates:0,haversineCalls:0,events:0,fallbackGroups:0};
}
