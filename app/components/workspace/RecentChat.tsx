'use client';

import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { Chat } from '@/lib/workspace-data';
import Icon from './Icon';

type Props = {
  chat: Chat;
  selected: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export default function RecentChat({ chat, selected, open, onOpenChange, onNavigate, onPin, onRename, onDelete }: Props) {
  const optionsId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = optionsRef.current;
    if (!open || !menu || !button) return;
    // The top layer escapes both sidebar scrolling and the mobile dialog.
    menu.showPopover?.();
    const buttonRect = button.getBoundingClientRect();
    const sidebar = button.closest('.ws-sidebar, .ws-drawer');
    const sidebarRight = sidebar?.getBoundingClientRect().right ?? buttonRect.right;
    const menuRect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(sidebarRight + 8, window.innerWidth - menuRect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(buttonRect.top, window.innerHeight - menuRect.height - 8))}px`;
    return () => { if (menu.isConnected) menu.hidePopover?.(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const dismissOnScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const dismissOnResize = () => onOpenChange(false);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('scroll', dismissOnScroll, true);
    window.addEventListener('resize', dismissOnResize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('scroll', dismissOnScroll, true);
      window.removeEventListener('resize', dismissOnResize);
    };
  }, [open, onOpenChange]);

  const run = (action: () => void) => {
    onOpenChange(false);
    optionsRef.current?.focus();
    action();
  };

  return <div ref={rowRef} className={`ws-recent-chat${selected ? ' is-selected' : ''}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
  }} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenChange(false);
    optionsRef.current?.focus();
  }}>
    <button type="button" className="ws-recent-chat-link" onClick={onNavigate} aria-current={selected ? 'page' : undefined}>
      <Icon name={chat.pinned ? 'pin' : 'leaf'} size={17}/>
      <span>{chat.title}<small>{chat.pinned && 'Pinned · '}{new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>
    </button>
    <button ref={optionsRef} type="button" className="ws-chat-options" aria-label={`Options for ${chat.title}`} title="Chat options" aria-expanded={open} aria-controls={optionsId} onClick={() => onOpenChange(!open)}>
      <Icon name="more" size={18}/>
    </button>
    <div ref={menuRef} id={optionsId} className="ws-chat-actions" popover="manual" role="group" aria-label={`Actions for ${chat.title}`} hidden={!open}>
      <button type="button" onClick={() => run(onPin)}><Icon name="pin" size={16}/><span>{chat.pinned ? 'Unpin' : 'Pin'}</span></button>
      <button type="button" onClick={() => run(onRename)}><Icon name="edit" size={16}/><span>Rename</span></button>
      <button type="button" className="ws-chat-delete" onClick={() => run(onDelete)}><Icon name="trash" size={16}/><span>Delete</span></button>
    </div>
  </div>;
}
