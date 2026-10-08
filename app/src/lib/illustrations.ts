// Illustrated people for the welcome slides. They're artwork, not users;
// swap in licensed photos of real models before launch if you prefer.

export interface Look {
  skin: string;
  hair: string;
  style: 'short' | 'long' | 'bun' | 'curly' | 'buzz';
  shirt: string;
  beard?: boolean;
  bg: [string, string];
}

const SKIN = ['#F4D1B5', '#E8B894', '#C98E66', '#A86B45', '#7A4A2E', '#5A3520'];

export const ILLUSTRATED_PEOPLE: { name: string; look: Look }[] = [
  {
    name: 'Maya',
    look: { skin: SKIN[2], hair: '#1E1512', style: 'long', shirt: '#F28C38', bg: ['#FFB199', '#FF0844'] },
  },
  {
    name: 'Jordan',
    look: { skin: SKIN[4], hair: '#1E1512', style: 'buzz', shirt: '#2E86AB', beard: true, bg: ['#89F7FE', '#66A6FF'] },
  },
  {
    name: 'Amara',
    look: { skin: SKIN[5], hair: '#1E1512', style: 'bun', shirt: '#E9C46A', bg: ['#FBC2EB', '#A6C1EE'] },
  },
];

/** A flat illustrated portrait as an SVG data URI. `variant` shifts the background for extra photos. */
export function portrait(look: Look, variant = 0): string {
  const [c1, c2] = variant % 2 === 0 ? look.bg : [look.bg[1], look.bg[0]];
  const hairBack =
    look.style === 'long'
      ? `<path d="M100 240 C90 120 310 120 300 240 L315 420 C250 450 150 450 85 420 Z" fill="${look.hair}"/>`
      : look.style === 'curly'
        ? `<g fill="${look.hair}">${[
            [120, 170],
            [150, 135],
            [200, 122],
            [250, 135],
            [280, 170],
            [292, 215],
            [108, 215],
            [115, 260],
            [285, 260],
          ]
            .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="42"/>`)
            .join('')}</g>`
        : '';
  const hairTop =
    look.style === 'buzz'
      ? `<path d="M118 210 C118 130 282 130 282 210 C262 172 138 172 118 210 Z" fill="${look.hair}" opacity="0.85"/>`
      : look.style === 'bun'
        ? `<circle cx="200" cy="112" r="40" fill="${look.hair}"/><path d="M112 222 C105 120 295 120 288 222 C268 165 132 165 112 222 Z" fill="${look.hair}"/>`
        : look.style === 'curly'
          ? ''
          : `<path d="M110 228 C100 110 300 110 290 228 C275 160 180 150 110 228 Z" fill="${look.hair}"/>`;
  const beard = look.beard
    ? `<path d="M128 262 C135 335 175 352 200 352 C225 352 265 335 272 262 C255 300 230 312 200 312 C170 312 145 300 128 262 Z" fill="${look.hair}" opacity="0.9"/>`
    : '';
  const tilt = variant === 1 ? 'rotate(-4 200 260)' : variant === 2 ? 'rotate(3 200 260)' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="400" height="500" fill="url(#g)"/>
<circle cx="${variant === 2 ? 330 : 70}" cy="${variant === 1 ? 420 : 80}" r="60" fill="#fff" opacity="0.18"/>
<g transform="${tilt}">
${hairBack}
<ellipse cx="200" cy="520" rx="175" ry="150" fill="${look.shirt}"/>
<rect x="172" y="300" width="56" height="80" rx="20" fill="${look.skin}"/>
<rect x="172" y="300" width="56" height="40" fill="#000" opacity="0.08"/>
<ellipse cx="200" cy="235" rx="86" ry="104" fill="${look.skin}"/>
<circle cx="116" cy="245" r="14" fill="${look.skin}"/><circle cx="284" cy="245" r="14" fill="${look.skin}"/>
${hairTop}
<circle cx="168" cy="240" r="7" fill="#2B1A14"/><circle cx="232" cy="240" r="7" fill="#2B1A14"/>
<path d="M155 218 Q168 210 181 217 M219 217 Q232 210 245 218" stroke="#2B1A14" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>
<circle cx="152" cy="272" r="13" fill="#FF6B8B" opacity="0.22"/><circle cx="248" cy="272" r="13" fill="#FF6B8B" opacity="0.22"/>
<path d="M200 248 Q194 268 203 270" stroke="#000" stroke-width="3" fill="none" opacity="0.18" stroke-linecap="round"/>
${beard}
<path d="M176 290 Q200 ${variant === 1 ? 316 : 306} 224 290" stroke="#7A2E2E" stroke-width="5" fill="none" stroke-linecap="round"/>
</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
