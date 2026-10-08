/** Original leaf silhouette; its cutouts let photography and typography show through. */
export default function BotanicalLeaf({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 260" aria-hidden="true" focusable="false" fill="none">
      <path fill="currentColor" fillRule="evenodd" d="M108 217C62 202 11 161 17 105C21 59 60 28 108 59C153 17 202 51 204 98C207 152 158 196 108 217ZM86 90C71 68 54 73 62 91C70 105 90 113 86 90ZM76 133C55 111 37 117 49 134C59 147 85 151 76 133ZM91 170C65 151 52 162 72 180C85 191 102 184 91 170ZM132 83C145 61 165 60 157 81C151 96 126 108 132 83ZM147 124C170 103 188 112 175 129C162 143 139 145 147 124ZM131 164C158 143 173 152 153 174C140 189 122 187 131 164Z" />
      <path d="M107 253C110 212 110 141 112 81" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M111 194L39 137M111 153L41 95M113 126L179 83M111 181L184 132" stroke="var(--background)" strokeWidth="1.3" strokeOpacity=".25" />
    </svg>
  );
}
