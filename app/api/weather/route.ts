import {getChatGPTUser} from '../../chatgpt-auth';
import {getWeather} from '../../../lib/api-handlers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return getWeather(request, (await getChatGPTUser())?.userId ?? null);}
