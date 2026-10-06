import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Idea Grove — A place for your thoughts',description:'Capture thoughts, connect ideas and explore your personal knowledge world.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
