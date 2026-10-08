import Grove from './grove';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
import {headers} from 'next/headers';
export const dynamic='force-dynamic';
export default async function Page(){const u=await getChatGPTUser(),github=(await headers()).get('grove-auth-provider')==='github';return <Grove signedIn={!!u} signInPath={github?'/auth/sign-in':chatGPTSignInPath('/')} signInLabel={github?'Sign in with GitHub':'Sign in'} standalone={github} userKey={u?.userId??'guest'} />;}
