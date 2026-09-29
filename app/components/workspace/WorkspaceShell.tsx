'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import Icon from './Icon';
import { visibleChats } from '@/lib/workspace-data';
const routes = [['/home','Home','home'],['/dashboard','Chat','chat'],['/plants','My Plants','plants'],['/guide','Plant Guide','guide'],['/reminders','Reminders','reminders'],['/settings','Settings','settings']];
export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const { data, ready, storageError, activeChatId, setActiveChatId, newChat } = useWorkspace();
  const [menu, setMenu] = useState(false); const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false); const [query, setQuery] = useState('');
  useEffect(() => { if (menu) dialog.current?.showModal(); else dialog.current?.close(); }, [menu]);
  if (!routes.some(([path]) => pathname === path)) return children;
  const recent = visibleChats(data.chats,expanded,query);
  const navigateChat = (id?: string) => { if (id) setActiveChatId(id); else newChat(); setMenu(false); router.push('/dashboard'); };
  const sidebar = <>
    <Link href="/home" className="ws-brand" onClick={() => setMenu(false)}><Icon name="leaf" size={32}/>Anthea</Link>
    <p className="ws-tagline">Your plant-care companion</p>
    <button className="ws-new" disabled={!ready} onClick={() => navigateChat()}><span aria-hidden="true">＋</span> New Chat</button>
    <nav aria-label="Main navigation">{routes.map(([href,label,icon]) => <Link key={href} href={href} className={`ws-nav-item ${pathname === href ? 'is-active' : ''}`} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenu(false)}><Icon name={icon}/>{label}</Link>)}</nav>
    <div className="ws-recents"><h2>{expanded ? 'All conversations' : 'Recent chats'}</h2>{data.chats.length > 0 && <input className="ws-chat-search" aria-label="Search all conversations" placeholder="Find a conversation…" value={query} onChange={e => setQuery(e.target.value)}/>}{recent.length ? recent.map(chat => <button className={pathname === '/dashboard' && activeChatId === chat.id ? 'is-selected' : ''} key={chat.id} onClick={() => navigateChat(chat.id)}><Icon name="leaf" size={18}/><span>{chat.title}<small>{new Date(chat.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</small></span></button>) : <p>{query ? 'No matching conversations.' : 'Your conversations will grow here.'}</p>}{data.chats.length > 8 && <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Show recent chats' : `View all ${data.chats.length} conversations`}</button>}</div>
    <div className="ws-local"><span aria-hidden="true">◉</span> Saved in this browser<Link href="/settings" onClick={() => setMenu(false)}>Manage your data →</Link></div>
  </>;
  return <div className="ws-app">
    <a href="#workspace-content" className="ws-skip">Skip to content</a>
    <aside className="ws-sidebar">{sidebar}</aside>
    <div className="ws-mobile-bar"><button onClick={() => setMenu(true)} aria-label="Open navigation">☰</button><Link href="/home">Anthea</Link><button onClick={() => navigateChat()} aria-label="New chat" disabled={!ready}>＋</button></div>
    <dialog ref={dialog} className="ws-drawer" onCancel={() => setMenu(false)} onClose={() => setMenu(false)}><button className="ws-drawer-close" onClick={() => setMenu(false)} aria-label="Close navigation">×</button>{sidebar}</dialog>
    <div className="ws-content" id="workspace-content" tabIndex={-1}>
      {storageError && <p className="ws-storage-error" role="alert">{storageError} <Link href="/settings">Back up data</Link></p>}
      {ready ? children : <div className="ws-loading" role="status">Opening your garden…</div>}
    </div>
  </div>;
}
