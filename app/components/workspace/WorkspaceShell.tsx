'use client';
import Link from 'next/link';
import Image from 'next/image';
import antheaLogo from '../../../public/images/Anthea Logo.png';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import Icon from './Icon';
import RecentChat from './RecentChat';
import useSidebarVisibility from './useSidebarVisibility';
import { visibleChats } from '@/lib/workspace-data';
const routes = [['/home','Home','home'],['/dashboard','Chat','chat'],['/plants','My Plants','plants'],['/settings','Settings','settings']];
export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const { data, ready, storageError, activeChatId, setActiveChatId, newChat, save, remove } = useWorkspace();
  const [menu, setMenu] = useState(false); const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false); const [query, setQuery] = useState('');
  const [recentsMinimized, setRecentsMinimized] = useState(false);
  const [openChatOptions, setOpenChatOptions] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const [tooltipLabel, setTooltipLabel] = useState<string | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const { sidebarVisible: sidebarExpanded, toggleSidebar } = useSidebarVisibility();
  useEffect(() => { if (menu) dialog.current?.showModal(); else dialog.current?.close(); }, [menu]);
  useEffect(() => {
    const dismissTooltip = (event: KeyboardEvent) => { if (event.key === 'Escape') setTooltipDismissed(true); };
    window.addEventListener('keydown', dismissTooltip);
    return () => window.removeEventListener('keydown', dismissTooltip);
  }, []);
  if (!routes.some(([path]) => pathname === path)) return children;
  const recent = visibleChats(data.chats,expanded,query);
  const navigateChat = (id?: string) => { if (id) setActiveChatId(id); else newChat(); setOpenChatOptions(null); setMenu(false); router.push('/dashboard'); };
  const positionTooltip = (event: SyntheticEvent<HTMLElement>, label: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({ left: rect.right + 12, top: rect.top + rect.height / 2 });
    setTooltipLabel(label);
    setTooltipDismissed(false);
  };
  const sidebar = (instance: 'desktop' | 'mobile') => <>
    <div className="ws-sidebar-header">
      <Link href="/home" className="ws-brand" onClick={() => setMenu(false)}><Image src={antheaLogo} alt="" width={32} height={32} sizes="32px"/>Anthea</Link>
      <button type="button" className="ws-sidebar-toggle" onClick={toggleSidebar} aria-controls="workspace-sidebar" aria-expanded={sidebarExpanded} aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}>
        <Image className="ws-toggle-logo" src={antheaLogo} alt="" width={32} height={32} sizes="32px"/>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d={sidebarExpanded ? 'm16 9-3 3 3 3' : 'm13 9 3 3-3 3'}/></svg>
      </button>
    </div>
    <div className="ws-rail-action" onPointerEnter={event => positionTooltip(event, 'New Chat')} onFocusCapture={event => positionTooltip(event, 'New Chat')}>
      <button className="ws-new" aria-label="New Chat" disabled={!ready} onClick={() => navigateChat()}><span className="ws-new-icon" aria-hidden="true">＋</span><span className="ws-nav-label">New Chat</span></button>
      <span className="ws-rail-tooltip" style={tooltipPosition} data-active={tooltipLabel === 'New Chat'} role="tooltip" aria-hidden="true">New Chat</span>
    </div>
    <nav aria-label="Main navigation">{routes.map(([href,label,icon]) => <div className="ws-rail-action" key={href} onPointerEnter={event => positionTooltip(event, label)} onFocusCapture={event => positionTooltip(event, label)}>
      <Link href={href} aria-label={label} className={`ws-nav-item ${pathname === href ? 'is-active' : ''}`} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenu(false)}><Icon name={icon} size={18}/><span className="ws-nav-label">{label}</span></Link>
      <span className="ws-rail-tooltip" style={tooltipPosition} data-active={tooltipLabel === label} role="tooltip" aria-hidden="true">{label}</span>
    </div>)}</nav>
    <div className="ws-recents" data-minimized={recentsMinimized}>
      <div className="ws-recents-heading">
        <h2>{expanded ? 'All conversations' : 'Recent chats'}</h2>
        <button type="button" className="ws-recents-toggle" onClick={() => { setRecentsMinimized(!recentsMinimized); setOpenChatOptions(null); }} aria-expanded={!recentsMinimized} aria-controls={`recent-chats-${instance}`} aria-label={recentsMinimized ? 'Expand recent chats' : 'Minimize recent chats'} title={recentsMinimized ? 'Expand recent chats' : 'Minimize recent chats'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={recentsMinimized ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'}/></svg>
        </button>
      </div>
      <div id={`recent-chats-${instance}`} className="ws-recents-list" hidden={recentsMinimized}>
        {data.chats.length > 0 && <input className="ws-chat-search" aria-label="Search all conversations" placeholder="Find a conversation…" value={query} onChange={e => setQuery(e.target.value)}/>}
        {recent.length ? recent.map(chat => <RecentChat key={chat.id} chat={chat} selected={pathname === '/dashboard' && activeChatId === chat.id} open={openChatOptions === `${instance}:${chat.id}`} onOpenChange={open => setOpenChatOptions(open ? `${instance}:${chat.id}` : null)} onNavigate={() => navigateChat(chat.id)} onPin={() => save('chats', { ...chat, pinned: !chat.pinned })} onRename={() => {
          const title = window.prompt('Conversation name', chat.title);
          if (title?.trim()) save('chats', { ...chat, title: title.trim().slice(0, 120) });
        }} onDelete={() => {
          if (window.confirm(`Delete "${chat.title}"? This cannot be undone.`)) remove('chats', chat.id);
        }}/>) : <p>{query ? 'No matching conversations.' : 'Your conversations will grow here.'}</p>}
        {data.chats.length > 8 && <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Show recent chats' : `View all ${data.chats.length} conversations`}</button>}
      </div>
    </div>
  </>;
  return <div className={`ws-app${pathname === '/dashboard' ? ' ws-app--chat' : ''}${sidebarExpanded ? '' : ' ws-app--sidebar-collapsed'}`}>
    <a href="#workspace-content" className="ws-skip">Skip to content</a>
    <aside className="ws-sidebar" id="workspace-sidebar" data-tooltip-dismissed={tooltipDismissed} onScroll={() => setTooltipDismissed(true)}>
      {sidebar('desktop')}
    </aside>
    <div className="ws-mobile-bar"><button onClick={() => setMenu(true)} aria-label="Open navigation">☰</button><Link href="/home">Anthea</Link><button onClick={() => navigateChat()} aria-label="New chat" disabled={!ready}>＋</button></div>
    <dialog ref={dialog} className="ws-drawer" onCancel={() => setMenu(false)} onClose={() => setMenu(false)}><button className="ws-drawer-close" onClick={() => setMenu(false)} aria-label="Close navigation">×</button>{sidebar('mobile')}</dialog>
    <div className="ws-content" id="workspace-content" tabIndex={-1}>
      {storageError && <p className="ws-storage-error" role="alert">{storageError} <Link href="/settings">Back up data</Link></p>}
      {ready ? children : <div className="ws-loading" role="status">Opening your garden…</div>}
    </div>
  </div>;
}
