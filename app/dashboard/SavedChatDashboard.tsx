'use client';
import { useEffect, useRef } from 'react';
import { useWorkspace } from '../components/workspace/WorkspaceProvider';
import ChatDashboard from './ChatDashboard';
export default function SavedChatDashboard() {
  const { data, activeChatId, setActiveChatId, newChat } = useWorkspace();
  const initialized = useRef(false);
  const chat = data.chats.find(c => c.id === activeChatId);
  useEffect(() => {
    if (chat) { initialized.current = false; return; }
    if (initialized.current) return;
    initialized.current = true;
    const latest = [...data.chats].sort((a,b) => b.updatedAt-a.updatedAt)[0];
    if (latest) setActiveChatId(latest.id); else newChat();
  }, [chat, data.chats, newChat, setActiveChatId]);
  return chat ? <ChatDashboard key={chat.id} chat={chat}/> : <p className="ws-loading" role="status">Opening your conversation…</p>;
}
