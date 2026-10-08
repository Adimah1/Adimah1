export type Gender = 'woman' | 'man' | 'nonbinary';
export type LookingFor = 'relationship' | 'casual' | 'friends' | 'not_sure';
export type MessageKind = 'text' | 'snap' | 'screenshot';

export interface Profile {
  id: string;
  display_name: string;
  birthdate: string;
  gender: Gender;
  interested_in: Gender[];
  bio: string;
  looking_for: LookingFor;
  photos: string[];
  age_min: number;
  age_max: number;
  is_paused: boolean;
  incognito: boolean;
  verified: boolean;
}

export interface NearbyProfile {
  id: string;
  display_name: string;
  age: number;
  bio: string;
  looking_for: LookingFor;
  photos: string[];
  verified: boolean;
  distance_mi: number;
  active_now: boolean;
  boosted: boolean;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  age: number;
  gender: Gender;
  bio: string;
  looking_for: LookingFor;
  photos: string[];
  verified: boolean;
  matched: boolean;
}

export interface LikeCard {
  id: string;
  display_name: string;
  age: number;
  photos: string[];
  verified: boolean;
}

export interface MatchSummary {
  match_id: string;
  other_id: string;
  display_name: string;
  photo: string | null;
  verified: boolean;
  last_kind: MessageKind | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  matched_at: string;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  viewed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export const GENDER_LABELS: Record<Gender, string> = {
  woman: 'Women',
  man: 'Men',
  nonbinary: 'Non-binary people',
};

export const GENDER_SELF_LABELS: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  nonbinary: 'Non-binary',
};

export const LOOKING_FOR_LABELS: Record<LookingFor, string> = {
  relationship: 'A relationship',
  casual: 'Something casual',
  friends: 'New friends',
  not_sure: 'Not sure yet',
};
