/** A decorative botanical silhouette drawn in Anthea's existing palette. */
export default function BotanicalSprig({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 260" fill="none" aria-hidden="true" focusable="false">
      <path d="M98 250C114 195 109 114 133 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M111 197C58 199 24 167 26 128C71 127 106 151 111 197Z" fill="currentColor" />
      <path d="M114 167C158 165 187 136 183 105C144 107 115 131 114 167Z" fill="currentColor" opacity=".8" />
      <path d="M119 120C80 112 63 83 71 55C105 62 124 87 119 120Z" fill="currentColor" opacity=".9" />
      <path d="M129 80C158 73 174 48 165 25C139 32 126 52 129 80Z" fill="currentColor" opacity=".75" />
      <path d="M135 33C120 19 123 5 135 0C149 13 148 24 135 33Z" fill="currentColor" />
      <path d="M109 194L43 146M116 163L169 119M120 116L81 71M129 77L157 38" stroke="var(--background)" strokeOpacity=".38" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
