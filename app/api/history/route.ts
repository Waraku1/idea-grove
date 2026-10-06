import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getHistory} from '../../../lib/api-handlers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return getHistory(request, (await getChatGPTUser())?.userId ?? null, env.DB);}
