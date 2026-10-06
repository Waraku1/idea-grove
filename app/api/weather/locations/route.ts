import {getChatGPTUser} from '../../../chatgpt-auth';
import {getWeatherLocations} from '../../../../lib/api-handlers';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return getWeatherLocations(request, (await getChatGPTUser())?.userId ?? null);}
