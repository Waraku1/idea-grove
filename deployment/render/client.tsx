import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Grove from '../../app/grove';
import Privacy from '../../app/privacy/page';
import Terms from '../../app/terms/page';
import '../../app/globals.css';

type Session = {signedIn: boolean; userKey: string};
function App() {
  const [session, setSession] = useState<Session | null>(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const pathname = window.location.pathname;
  useEffect(() => {
    if (pathname !== '/') return;
    const controller = new AbortController();
    setFailed(false);
    fetch('/session', {cache: 'no-store', signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error();
      const s = await response.json() as Session;
      if (typeof s.signedIn !== 'boolean' || typeof s.userKey !== 'string' || (s.signedIn ? !/^github:[1-9]\d{0,19}$/.test(s.userKey) : s.userKey !== 'guest')) throw new Error();
      setSession(s);
    }).catch(() => {if (!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  }, [attempt, pathname]);
  if (pathname === '/privacy') return <Privacy hosting="render"/>;
  if (pathname === '/terms') return <Terms/>;
  if (!session) return <main style={{height:'100dvh',display:'grid',placeContent:'center',textAlign:'center',gap:16}}><h1 style={{fontFamily:'Georgia,serif',fontWeight:400}}>idea grove</h1><p role="status">{failed ? 'Could not connect. Please try again.' : 'Opening your grove…'}</p>{failed && <button onClick={() => setAttempt(n => n + 1)}>Try again</button>}</main>;
  return <Grove signedIn={session.signedIn} signInPath="/auth/sign-in" signInLabel="Sign in with GitHub" standalone userKey={session.userKey}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
