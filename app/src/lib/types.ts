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
  /** 0 = phone, 1 = selfie verified, 2 = government ID + liveness. */
  verification_tier: number;
  kyc_status: 'none' | 'pending' | 'approved' | 'rejected';
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

/** Columns the app may read on its own profile (risk fields are server-only). */
export const PROFILE_COLUMNS =
  'id, display_name, birthdate, gender, interested_in, bio, looking_for, photos, age_min, age_max, is_paused, incognito, verified, verification_tier, kyc_status, emergency_contact_name, emergency_contact_phone';

export interface AccountState {
  status: 'active' | 'frozen' | 'banned';
  reason: string | null;
  verification_tier: number;
  kyc_status: Profile['kyc_status'];
  appeal_open: boolean;
}

export interface DatePlan {
  id: string;
  match_id: string;
  proposer_id: string;
  invitee_id: string;
  place_name: string;
  starts_at: string;
  deposit_cents: number;
  status:
    | 'proposed'
    | 'accepted'
    | 'confirmed'
    | 'completed'
    | 'no_show'
    | 'expired'
    | 'declined'
    | 'cancelled'
    | 'disputed';
  outcome_detail: string | null;
}

export interface DateDeposit {
  id: string;
  plan_id: string;
  user_id: string;
  amount_cents: number;
  status: 'pending' | 'authorized' | 'released' | 'captured' | 'failed';
  checked_in_at: string | null;
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
  /** Set by server-side screening; held messages never reach the other person. */
  held?: boolean;
  held_reason?: 'payment' | 'shadow' | 'velocity' | null;
  flags?: string[];
}

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended';

export interface Call {
  id: string;
  match_id: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
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
