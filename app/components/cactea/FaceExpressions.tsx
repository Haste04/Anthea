/** Expression artwork shares the PNGs' square canvas, keeping the face aligned. */
export function ClosedEye() {
  return (
    <svg viewBox="0 0 1280 1280" aria-hidden="true" focusable="false">
      <path d="M 285 650 Q 640 245 995 650" fill="none" stroke="#17251b" strokeWidth="110" strokeLinecap="round" />
      <path d="M 320 607 Q 640 295 960 607" fill="none" stroke="#45624b" strokeWidth="22" strokeLinecap="round" />
    </svg>
  );
}

export function WorriedBrow() {
  return (
    <svg viewBox="0 0 1280 1280" aria-hidden="true" focusable="false">
      <path d="M 270 210 Q 650 165 995 80" fill="none" stroke="#24452d" strokeWidth="70" strokeLinecap="round" />
    </svg>
  );
}

export function OpenMouth({ round = false }: { round?: boolean }) {
  return (
    <svg viewBox="0 0 1280 1280" aria-hidden="true" focusable="false">
      {round ? <>
        <ellipse cx="640" cy="645" rx="190" ry="235" fill="#173c26" stroke="#387a35" strokeWidth="35" />
        <path d="M 490 775 Q 640 695 790 775 Q 775 850 640 860 Q 505 850 490 775" fill="#dc9387" />
      </> : <>
        <path d="M 285 490 Q 640 625 995 490 Q 970 900 640 910 Q 310 900 285 490" fill="#173c26" stroke="#387a35" strokeWidth="35" strokeLinejoin="round" />
        <path d="M 330 520 Q 640 625 950 520 L 930 600 Q 640 690 350 600 Z" fill="#fff9df" />
        <path d="M 450 840 Q 640 690 830 840 Q 750 885 640 885 Q 530 885 450 840" fill="#dc9387" />
      </>}
    </svg>
  );
}
export function AngryBrow() {
  return (
    <svg viewBox="0 0 1280 1280" aria-hidden="true" focusable="false">
      <path d="M 250 100 L 1030 390" fill="none" stroke="#24452d" strokeWidth="85" strokeLinecap="round" />
    </svg>
  );
}

export function FrownMouth() {
  return (
    <svg viewBox="0 0 1280 1280" aria-hidden="true" focusable="false">
      <path d="M 285 780 Q 640 360 995 780" fill="none" stroke="#173c26" strokeWidth="90" strokeLinecap="round" />
    </svg>
  );
}
