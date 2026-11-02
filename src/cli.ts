import { mkdir, writeFile } from 'node:fs/promises';
import { resolve,join,basename,relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { processDataset,createRunDirectory } from './io.js';
import type { Variant } from './model.js';

export const DEFAULT_VARIANT:Variant='B1';
export async function runCLI(args:string[]):Promise<void> {
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('Spacecom 2027\nUsage: npm start -- --all | --dataset N [--dataset N] | --input path\n  [--variant A|B0|B1] [--run-id safe-unique-name]\nOutputs: OutPuts/gerados/<run-id>/ (must not exist). T1 sorted timestamps only.\n');return;
  }
  let variant:Variant=DEFAULT_VARIANT,runID='run-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);const inputs:string[]=[];
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--all')inputs.push(...Array.from({length:7},(_,n)=>`DataSets/dataset${n+1}.txt`));
    else if(['--dataset','--input','--variant','--run-id'].includes(arg)){
      const value=args[++i];if(value===undefined)throw new Error('Invalid argument: missing value');
      if(arg==='--dataset'){if(!/^[1-7]$/.test(value))throw new Error('Invalid dataset argument');inputs.push(`DataSets/dataset${value}.txt`);}
      else if(arg==='--input')inputs.push(value);
      else if(arg==='--variant'){if(!['A','B0','B1'].includes(value))throw new Error('Invalid variant argument');variant=value as Variant;}
      else{if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value))throw new Error('Invalid run-id argument');runID=value;}
    }else throw new Error(`Unknown argument ${arg}; use --help`);
  }
  if(!inputs.length)throw new Error('Usage: select --all, --dataset N or --input path; use --help');
  const dir=await createRunDirectory(runID);
  const results=[];
  for(let n=0;n<inputs.length;n++){
    const input=resolve(inputs[n]),label=basename(input).replace(/\.[^.]+$/,'');
    const output=join(dir,`${n+1}-${label}.json`);
    const metrics=await processDataset(input,output,variant);results.push(metrics);
    process.stderr.write(`${basename(input)}: ${metrics.events} events, ${metrics.totalMs.toFixed(1)} ms -> ${relative(process.cwd(),output)}\n`);
  }
  await writeFile(join(dir,'manifest.json'),JSON.stringify({node:process.version,v8:process.versions.v8,created:new Date().toISOString(),variant,profile:'T1',results},null,2),{flag:'wx'});
  process.stderr.write(`Manifest: ${join(dir,'manifest.json')}\n`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runCLI(process.argv.slice(2)).catch(e=>{process.stderr.write(`${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;});
}
