import {startRenderServer} from '../deployment/render/server.ts';
try {await startRenderServer();} catch {console.error('Idea Grove cannot start. Check the private deployment configuration and database schema.'); process.exitCode = 1;}
