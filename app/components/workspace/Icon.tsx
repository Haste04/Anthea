export default function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    chat: <><path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z"/><path d="M7 8h9M7 12h6"/></>,
    plants: <><path d="M6 15h12l-2 7H8ZM12 15V8M12 11C6 11 3 8 4 3c5 0 8 3 8 8ZM12 8c0-4 3-6 8-6 0 5-3 8-8 8"/></>,
    guide: <><path d="M12 5C9 2 5 3 3 3v16c3-1 6-1 9 2 3-3 6-3 9-2V3c-3 0-6-1-9 2Z"/><path d="M12 5v16M6 7h3M15 7h3"/></>,
    settings: <><path d="m9 3 1-2h4l1 2 3 2 2 1v4l-2 2v3l1 3-3 3-3-1h-3l-3 1-3-3 1-3v-3l-2-2V6l3-1Z"/><circle cx="12" cy="11" r="3"/></>,
    leaf: <><path d="M20 3C9 2 2 8 5 16c8 4 15-2 15-13Z"/><path d="m3 22 12-13"/></>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
    microphone: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.leaf}</svg>;
}
