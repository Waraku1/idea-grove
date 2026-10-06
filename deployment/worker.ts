import handler from 'vinext/server/fetch-handler';
import {handlePublicRequest, type PublicEnv} from './auth';

export default {
  fetch(request: Request, env: PublicEnv, ctx: ExecutionContext) {
    return handlePublicRequest(request, env, authenticated => handler.fetch(authenticated, env, ctx));
  },
};
