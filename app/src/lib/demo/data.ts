import type { Gender, LookingFor } from '../types';

export interface DemoPerson {
  id: string;
  display_name: string;
  birthdate: string;
  gender: Gender;
  interested_in: Gender[];
  bio: string;
  looking_for: LookingFor;
  verified: boolean;
  distance_mi: number;
  active: boolean;
  boosted: boolean;
  /** Whether they like the demo user back when the demo user likes them. */
  likesBack: boolean;
  look: Look;
}

interface Look {
  skin: string;
  hair: string;
  style: 'short' | 'long' | 'bun' | 'curly' | 'buzz';
  shirt: string;
  beard?: boolean;
  bg: [string, string];
}

const SKIN = ['#F4D1B5', '#E8B894', '#C98E66', '#A86B45', '#7A4A2E', '#5A3520'];
const HAIR = {
  black: '#1E1512',
  brown: '#5B3A24',
  auburn: '#8E3B1F',
  blonde: '#D9A85B',
  grey: '#9A9390',
  pink: '#E06AA0',
};

const person = (p: Omit<DemoPerson, 'id'> & { id: string }): DemoPerson => p;

export const DEMO_PEOPLE: DemoPerson[] = [
  person({
    id: 'p-maya',
    display_name: 'Maya',
    birthdate: '1998-03-14',
    gender: 'woman',
    interested_in: ['man', 'nonbinary'],
    bio: 'Matcha over coffee. Will drag you to a pottery class.',
    looking_for: 'relationship',
    verified: true,
    distance_mi: 1,
    active: true,
    boosted: true,
    likesBack: true,
    look: { skin: SKIN[2], hair: HAIR.black, style: 'long', shirt: '#F28C38', bg: ['#FFB199', '#FF0844'] },
  }),
  person({
    id: 'p-jordan',
    display_name: 'Jordan',
    birthdate: '1995-07-02',
    gender: 'man',
    interested_in: ['woman'],
    bio: 'Chef by day, terrible karaoke singer by night 🎤',
    looking_for: 'relationship',
    verified: true,
    distance_mi: 1,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[4], hair: HAIR.black, style: 'buzz', shirt: '#2E86AB', beard: true, bg: ['#89F7FE', '#66A6FF'] },
  }),
  person({
    id: 'p-sofia',
    display_name: 'Sofia',
    birthdate: '1996-11-21',
    gender: 'woman',
    interested_in: ['man'],
    bio: 'Sunday farmers market regular. Ask me about my sourdough starter.',
    looking_for: 'not_sure',
    verified: false,
    distance_mi: 2,
    active: false,
    boosted: false,
    likesBack: false,
    look: { skin: SKIN[1], hair: HAIR.auburn, style: 'curly', shirt: '#6A994E', bg: ['#F6D365', '#FDA085'] },
  }),
  person({
    id: 'p-ethan',
    display_name: 'Ethan',
    birthdate: '1993-01-09',
    gender: 'man',
    interested_in: ['woman', 'man'],
    bio: 'Climbing, bad puns, good tacos. Pick two.',
    looking_for: 'casual',
    verified: true,
    distance_mi: 2,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[0], hair: HAIR.blonde, style: 'short', shirt: '#BC4749', bg: ['#A1C4FD', '#C2E9FB'] },
  }),
  person({
    id: 'p-river',
    display_name: 'River',
    birthdate: '1999-05-30',
    gender: 'nonbinary',
    interested_in: ['woman', 'man', 'nonbinary'],
    bio: 'Vinyl collector. I know every good record shop within 5 miles.',
    looking_for: 'friends',
    verified: false,
    distance_mi: 3,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[3], hair: HAIR.pink, style: 'short', shirt: '#3D405B', bg: ['#D4FC79', '#96E6A1'] },
  }),
  person({
    id: 'p-amara',
    display_name: 'Amara',
    birthdate: '1994-09-17',
    gender: 'woman',
    interested_in: ['man', 'woman'],
    bio: 'Architect. I will judge your bookshelf, lovingly.',
    looking_for: 'relationship',
    verified: true,
    distance_mi: 3,
    active: false,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[5], hair: HAIR.black, style: 'bun', shirt: '#E9C46A', bg: ['#FBC2EB', '#A6C1EE'] },
  }),
  person({
    id: 'p-leo',
    display_name: 'Leo',
    birthdate: '1997-12-03',
    gender: 'man',
    interested_in: ['woman', 'nonbinary'],
    bio: 'Dog dad to a very dramatic husky. Sunsets > sunrises.',
    looking_for: 'not_sure',
    verified: false,
    distance_mi: 4,
    active: false,
    boosted: true,
    likesBack: false,
    look: { skin: SKIN[2], hair: HAIR.brown, style: 'curly', shirt: '#264653', bg: ['#FAD0C4', '#FFD1FF'] },
  }),
  person({
    id: 'p-chloe',
    display_name: 'Chloe',
    birthdate: '2000-04-25',
    gender: 'woman',
    interested_in: ['woman', 'nonbinary'],
    bio: 'Grad student, plant hoarder, night owl 🌙',
    looking_for: 'casual',
    verified: true,
    distance_mi: 4,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[0], hair: HAIR.brown, style: 'long', shirt: '#9B5DE5', bg: ['#E0C3FC', '#8EC5FC'] },
  }),
  person({
    id: 'p-marcus',
    display_name: 'Marcus',
    birthdate: '1991-08-11',
    gender: 'man',
    interested_in: ['woman'],
    bio: 'Marathoner. Will absolutely make you a playlist.',
    looking_for: 'relationship',
    verified: true,
    distance_mi: 5,
    active: false,
    boosted: false,
    likesBack: true,
    look: {
      skin: SKIN[5],
      hair: HAIR.black,
      style: 'short',
      shirt: '#F4A261',
      beard: true,
      bg: ['#FFECD2', '#FCB69F'],
    },
  }),
  person({
    id: 'p-nina',
    display_name: 'Nina',
    birthdate: '1992-02-08',
    gender: 'woman',
    interested_in: ['man'],
    bio: 'Travel nurse back in town. Show me your favourite brunch spot.',
    looking_for: 'relationship',
    verified: false,
    distance_mi: 5,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[3], hair: HAIR.black, style: 'curly', shirt: '#2A9D8F', bg: ['#FF9A9E', '#FECFEF'] },
  }),
  person({
    id: 'p-sam',
    display_name: 'Sam',
    birthdate: '1996-06-19',
    gender: 'nonbinary',
    interested_in: ['woman', 'man', 'nonbinary'],
    bio: 'Board game night host. Bring snacks, lose gracefully.',
    looking_for: 'not_sure',
    verified: true,
    distance_mi: 8,
    active: false,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[1], hair: HAIR.grey, style: 'buzz', shirt: '#E76F51', bg: ['#C1DFC4', '#DEECDD'] },
  }),
  person({
    id: 'p-zoe',
    display_name: 'Zoe',
    birthdate: '1997-10-01',
    gender: 'woman',
    interested_in: ['man', 'woman'],
    bio: 'Photographer. Golden hour is my love language.',
    looking_for: 'casual',
    verified: true,
    distance_mi: 12,
    active: true,
    boosted: false,
    likesBack: true,
    look: { skin: SKIN[2], hair: HAIR.blonde, style: 'long', shirt: '#118AB2', bg: ['#FDCBF1', '#E6DEE9'] },
  }),
  person({
    id: 'p-dante',
    display_name: 'Dante',
    birthdate: '1990-03-27',
    gender: 'man',
    interested_in: ['man', 'nonbinary'],
    bio: 'Jazz bar regular. Better at cooking than texting.',
    looking_for: 'relationship',
    verified: false,
    distance_mi: 18,
    active: false,
    boosted: false,
    likesBack: true,
    look: {
      skin: SKIN[4],
      hair: HAIR.black,
      style: 'curly',
      shirt: '#073B4C',
      beard: true,
      bg: ['#F5F7FA', '#C3CFE2'],
    },
  }),
];

export const DEMO_REPLIES = [
  'Haha I love that 😄',
  'Okay you have my attention. Tell me more?',
  'That sounds fun! Are you free this weekend?',
  'I was literally just thinking the same thing',
  'Coffee at that little place on 5th sometime? ☕',
  'Stop, that’s amazing 😂',
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

/** The picture inside the demo snap: a sunset. */
export function snapScene(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 700">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B1055"/><stop offset="0.55" stop-color="#D53A9D"/><stop offset="1" stop-color="#FFB86C"/></linearGradient></defs>
<rect width="400" height="700" fill="url(#s)"/>
<circle cx="200" cy="470" r="90" fill="#FFE29A"/>
<rect y="470" width="400" height="230" fill="#3A1C71" opacity="0.85"/>
<g fill="#FFE29A" opacity="0.6"><rect x="140" y="500" width="120" height="6" rx="3"/><rect x="160" y="530" width="80" height="6" rx="3"/><rect x="180" y="560" width="40" height="6" rx="3"/></g>
<text x="200" y="150" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">view from my run 🌅</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const MY_LOOKS: Record<Gender, Look> = {
  woman: { skin: SKIN[1], hair: HAIR.brown, style: 'long', shirt: '#FF4F8B', bg: ['#FFDEE9', '#B5FFFC'] },
  man: { skin: SKIN[2], hair: HAIR.brown, style: 'short', shirt: '#FF4F8B', bg: ['#FFDEE9', '#B5FFFC'] },
  nonbinary: { skin: SKIN[2], hair: HAIR.auburn, style: 'curly', shirt: '#FF4F8B', bg: ['#FFDEE9', '#B5FFFC'] },
};
