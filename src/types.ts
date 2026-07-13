export interface IRCMessage {
  id: string;
  timestamp: string;
  sender: string;
  text: string;
  type: 'system' | 'user' | 'error' | 'motd' | 'join' | 'part' | 'info';
  isMention?: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  isImage?: boolean;
}

export interface IRCChannel {
  name: string;
  topic: string;
  users: string[];
  messages: IRCMessage[];
  unreadCount: number;
  bannedUsers?: string[];
}

export interface DesktopWindow {
  id: string;
  title: string;
  type: 'pirch' | 'python_code' | 'about_pirch' | 'help';
  x: number;
  y: number;
  w: number;
  h: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isOpen: boolean;
  zIndex: number;
}
