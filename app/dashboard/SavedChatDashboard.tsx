'use client';
import { useEffect, useRef } from 'react';
import { useWorkspace } from '../components/workspace/WorkspaceProvider';
import ChatDashboard from './ChatDashboard';
export default function SavedChatDashboard() {
  const { data, activeChatId, draftChat, newChat } = useWorkspace();
  const initialized = useRef(false);
  const chat = data.chats.find(c => c.id === activeChatId) ?? (draftChat?.id === activeChatId ? draftChat : null);
  useEffect(() => {
    if (chat) { initialized.current = false; return; }
    if (initialized.current) return;
    initialized.current = true;
    newChat();
  }, [chat, newChat]);
  return chat ? <ChatDashboard key={chat.id} chat={chat}/> : <p className="ws-loading" role="status">Opening your conversation…</p>;
}
