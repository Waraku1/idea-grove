import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getWorld, postWorld} from '../../../lib/api-handlers';
export const dynamic = 'force-dynamic';
export async function GET() {return getWorld((await getChatGPTUser())?.userId ?? null, env.DB);}
export async function POST(request: Request) {return postWorld(request, (await getChatGPTUser())?.userId ?? null, env.DB);}
