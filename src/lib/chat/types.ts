export type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  type: 'text' | 'media' | 'system' | 'sticker';
  sticker_id: string | null;
  reply_to: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

export type Media = {
  id: string;
  message_id: string;
  conversation_id: string;
  sender_id: string;
  kind: 'image' | 'video';
  mime: string;
  size_bytes: number;
  mode: 'normal' | 'once' | 'timed';
  timer_seconds: number | null;
  viewed_at: string | null;
  deleted_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type LocationShare = {
  id: string;
  conversation_id: string;
  requested_by: string;
  sharer_id: string;
  status: 'requested' | 'active' | 'declined' | 'stopped' | 'expired';
  duration_minutes: number | null;
  expires_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_at: string | null;
  created_at: string;
};

export const MSG_COLS = 'id,conversation_id,sender_id,body,type,sticker_id,reply_to,created_at,delivered_at,read_at';
export const MEDIA_COLS =
  'id,message_id,conversation_id,sender_id,kind,mime,size_bytes,mode,timer_seconds,viewed_at,deleted_at,expires_at,created_at';
export const SHARE_COLS =
  'id,conversation_id,requested_by,sharer_id,status,duration_minutes,expires_at,last_lat,last_lng,last_accuracy,last_at,created_at';

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type ConversationItem = {
  id: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null; // avatar asset id, used with <Avatar assetId=...>
  otherAbout: string | null;
  lastBody: string | null;
  lastType: string | null;
  lastAt: string | null;
  lastMine: boolean;
  lastRead: boolean;
  unread: number;
};
