import {randomBytes} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const path = new URL('.env.dispatch',import.meta.url);
let secret;
try { secret=(await readFile(path,'utf8')).trim().split('=')[1]; }
catch { secret=randomBytes(32).toString('hex'); await writeFile(path,`TRANSCRIPT_DISPATCH_SECRET=${secret}\n`,{mode:0o600}); }
if(!/^[a-f0-9]{64}$/.test(secret)) throw Error('Invalid dispatcher secret');
execFileSync('C:/Users/matth/scoop/shims/supabase.exe',['secrets','set','--env-file',path.pathname.replace(/^\/(\w:)/,'$1'),'--project-ref','lteimepkxuiupbcsbcpz'],{cwd:new URL('.',import.meta.url),stdio:['ignore','pipe','pipe']});
process.stdout.write(`select vault.create_secret('${secret}', 'transcript_dispatch_secret', 'Authenticated recording transcript dispatcher');`);
