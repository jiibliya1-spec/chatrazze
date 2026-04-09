export type MessageStatus = "sent" | "delivered" | "read";
export type MessageType = "text" | "image" | "audio";

export interface User {
  id: string;
  phone: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  created_at: string;
  participants: ChatParticipant[];
  last_message?: Message;
  unread_count?: number;
  other_user?: User;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  joined_at: string;
  user?: User;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  created_at: string;
  sender?: User;
}

export interface Contact {
  id: string;
  user_id: string;
  contact_id: string;
  contact?: User;
}
