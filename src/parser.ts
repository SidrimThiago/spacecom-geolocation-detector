import type { DetectionStats, PositionRecord } from './model.js';

export const HEADER='idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida';
const integer=/^[+-]?[0-9]+$/;
const decimal=/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

export class InputError extends Error {
  constructor(public code:string,source:string,line:number,field:string,message:string){super(`${source}:${line} ${field} ${code}: ${message}`);this.name='InputError';}
}
function fail(source:string,line:number,field:string,message:string):never {throw new InputError('INVALID_INPUT',source,line,field,message);}

function fields(line:string,source:string,lineNo:number):string[] {
  const out:string[]=[];let i=0;
  while(true){let value='';
    if(line[i]==='"'){
      i++;let closed=false;
      while(i<line.length){if(line[i]==='"'){if(line[i+1]==='"'){value+='"';i+=2;}else{i++;closed=true;break;}}else value+=line[i++];}
      if(!closed||i<line.length&&line[i]!==';')fail(source,lineNo,'CSV','malformed quoted field');
    }else{
      const start=i;while(i<line.length&&line[i]!==';'){if(line[i]==='"')fail(source,lineNo,'CSV','quote in unquoted field');i++;}value=line.slice(start,i);
    }
    if(/[\r\n\uFEFF]/.test(value))fail(source,lineNo,'CSV','unexpected line break or BOM');
    out.push(value);if(i===line.length)break;i++;
  }
  if(out.length!==7)fail(source,lineNo,'CSV',`expected 7 columns, got ${out.length}`);
  return out;
}
export function parseHeader(line:string,source:string):void {
  if(line.startsWith('\uFEFF'))line=line.slice(1);
  if(fields(line,source,1).join(';')!==HEADER)throw new InputError('INVALID_HEADER',source,1,'header','expected exact names and order');
}
function int(token:string,source:string,line:number,field:string):number {
  if(!integer.test(token))fail(source,line,field,'expected decimal safe integer');
  const value=Number(token);if(!Number.isSafeInteger(value))fail(source,line,field,'integer outside safe Number range');return value===0?0:value;
}
function coordinate(token:string,limit:number,source:string,line:number,field:string):number {
  if(!decimal.test(token))fail(source,line,field,'expected complete decimal');
  const value=Number(token);if(!Number.isFinite(value)||Math.abs(value)>limit)fail(source,line,field,'not finite or outside geographic range');return value===0?0:value;
}
function timestampValid(t:string):boolean {
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(t);if(!m)return false;
  const [y,mo,d,h,mi,s]=m.slice(1).map(Number),leap=y%4===0&&(y%100!==0||y%400===0);
  return mo>=1&&mo<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][mo-1]&&h<24&&mi<60&&s<60;
}
export function parseRecord(line:string,lineNo:number,source:string):PositionRecord {
  return parseRecordWithPrevious(line,lineNo,source);
}
// Somente groupsFromLines fornece o timestamp anterior já validado a esta função privada.
// O parser público sempre valida o timestamp, mesmo com argumentos extras vindos de JavaScript.
function parseRecordWithPrevious(line:string,lineNo:number,source:string,previousTimestamp?:string):PositionRecord {
  const f=fields(line,source,lineNo);
  const id=int(f[0],source,lineNo,'idMonitorado'),faction=f[1]===''?null:int(f[1],source,lineNo,'faccaoMonitorado');
  if(f[2]!==previousTimestamp&&!timestampValid(f[2]))fail(source,lineNo,'timestamp','invalid exact calendar timestamp');
  const lat=coordinate(f[3],90,source,lineNo,'latitude'),lon=coordinate(f[4],180,source,lineNo,'longitude');
  if(f[5]!=='true'&&f[5]!=='false')fail(source,lineNo,'medidaProtetiva','expected true or false');
  const restrictions=new Set<number>();if(f[6]!=='')for(const token of f[6].split(','))restrictions.add(int(token,source,lineNo,'idsRestricaoMedida'));
  const latTicks=/^[+-]?[0-9]+\.[0-9]{5}$/.test(f[3])?Number(f[3].replace('.','')):null;
  return {id,faction,timestamp:f[2],lat,lon,victim:f[5]==='true',restrictions,latTicks:latTicks===0?0:latTicks,line:lineNo};
}
export function recordsEqual(a:PositionRecord,b:PositionRecord):boolean {
  if(a.id!==b.id||a.timestamp!==b.timestamp||a.faction!==b.faction||a.lat!==b.lat||a.lon!==b.lon||a.victim!==b.victim||a.restrictions.size!==b.restrictions.size)return false;
  for(const id of a.restrictions)if(!b.restrictions.has(id))return false;return true;
}
export function addUnique(group:Map<number,PositionRecord>,record:PositionRecord,source:string,stats?:DetectionStats):void {
  const old=group.get(record.id);
  if(old){if(!recordsEqual(old,record))throw new InputError('DUPLICATE_CONFLICT',source,record.line,'idMonitorado',`ID ${record.id}, timestamp ${record.timestamp}; first line ${old.line}`);
    // Uma representação alternativa não pode habilitar silenciosamente a poda decimal otimizada.
    if(old.latTicks!==record.latTicks)old.latTicks=null;
    if(stats)stats.duplicates++;
  }else group.set(record.id,record);
}
export async function* groupsFromLines(lines:AsyncIterable<string>,source:string,stats?:DetectionStats):AsyncGenerator<PositionRecord[]> {
  let line=0,current:string|undefined;let group=new Map<number,PositionRecord>();
  for await(const text of lines){line++;if(line===1){parseHeader(text,source);continue;}
    // current pertence a este iterador e resulta de um registro integralmente validado.
    const r=parseRecordWithPrevious(text,line,source,current);if(stats)stats.records++;
    if(current!==undefined&&r.timestamp<current)throw new InputError('TIMESTAMP_OUT_OF_ORDER',source,line,'timestamp',`${r.timestamp} follows ${current}; outside T1 profile`);
    if(current!==undefined&&r.timestamp!==current){yield [...group.values()];group=new Map();}
    current=r.timestamp;addUnique(group,r,source,stats);
  }
  if(line===0)throw new InputError('INVALID_HEADER',source,1,'header','missing header');
  if(group.size)yield [...group.values()];
}
