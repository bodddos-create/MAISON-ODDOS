// Accept the managed preview daemon's standard host/port flags for Next.js.
import {spawn} from 'node:child_process';
const args=process.argv.slice(2).filter(value=>value!=='--strictPort').map(value=>value==='--host'?'--hostname':value);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
