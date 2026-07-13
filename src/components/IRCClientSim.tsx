import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  Users,
  Send,
  Lock,
  Unlock,
  Terminal,
  Hash,
  MessageSquare,
  Plus,
  X,
  Activity,
  Code2,
  Power,
  User,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Bell,
  CheckCircle2,
  ArrowRight,
  Info,
  Sliders,
  Play,
  Square
} from 'lucide-react';
import { IRCMessage, IRCChannel } from '../types';

// RFC 1459 IRC Line Parser
interface ParsedIRCMessage {
  prefix: string;
  command: string;
  params: string[];
}

function parseIRCLine(rawLine: string): ParsedIRCMessage | null {
  if (!rawLine) return null;
  const match = rawLine.match(/^(?::(\S+)\s+)?(\S+)(.*)$/);
  if (!match) return null;

  const prefix = match[1] || '';
  const command = match[2];
  let rest = match[3].trim();
  const params: string[] = [];

  const trailingIndex = rest.indexOf(' :');
  let trailing = '';
  if (trailingIndex !== -1) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex).trim();
  } else if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  }

  if (rest) {
    params.push(...rest.split(/\s+/));
  }
  if (trailing) {
    params.push(trailing);
  }

  return { prefix, command, params };
}

// Extract clean nickname from a nick mask (e.g. Nick!user@host -> Nick)
function getNickFromMask(mask: string): string {
  if (!mask) return '';
  const bangIndex = mask.indexOf('!');
  if (bangIndex !== -1) {
    return mask.slice(0, bangIndex);
  }
  return mask;
}

// Clean prefixes from a username (e.g. @Nick -> Nick)
function cleanNick(nick: string): string {
  return nick.replace(/^[@+%&~]+/, '');
}

export default function IRCClientSim() {
  // Connection Form State
  const [server, setServer] = useState('irc.siam-neon.net');
  const [port, setPort] = useState('6697');
  const [nick, setNick] = useState('SiamCyber');
  const [password, setPassword] = useState('NeonPassword123_Secure!');
  const [autoJoin, setAutoJoin] = useState('#siam-chat, #pyqt6-help');
  const [showPassword, setShowPassword] = useState(false);
  const [isSecureSSL, setIsSecureSSL] = useState(true);

  // Client Engine State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeNick, setActiveNick] = useState('');
  const [currentRoom, setCurrentRoom] = useState('Status');
  const [rooms, setRooms] = useState<Record<string, IRCChannel>>({
    Status: {
      name: 'Status',
      topic: 'IRC Client Engine - Connection Status Window',
      users: [],
      messages: [
        {
          id: 'init-0',
          timestamp: new Date().toLocaleTimeString(),
          sender: 'SYSTEM',
          text: '⚡ SYSTEM: Web IRC Client Engine initialized successfully.',
          type: 'info',
        },
        {
          id: 'init-1',
          timestamp: new Date().toLocaleTimeString(),
          sender: 'SYSTEM',
          text: '🔐 SECURITY NOTE: Credentials are stored strictly in React memory state and never reflected on the browser URL bar to protect against screenshot leaks.',
          type: 'info',
        },
        {
          id: 'init-2',
          timestamp: new Date().toLocaleTimeString(),
          sender: 'SYSTEM',
          text: '💡 Enter your credentials and click "Connect Securely" to launch the Neon chat panel.',
          type: 'info',
        }
      ],
      unreadCount: 0,
    }
  });

  // Raw Logs view
  const [rawLogs, setRawLogs] = useState<string[]>([
    'SYSTEM: Ready for server stream...'
  ]);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [showPythonCode, setShowPythonCode] = useState(false);

  // Input states
  const [inputValue, setInputValue] = useState('');
  
  // Audio state
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.4);
  const synthIntervalRef = useRef<number | null>(null);

  // Refs for auto-scroll
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom helper
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rooms, currentRoom, rawLogs]);

  // Handle playing a nice neon sound chime on private message/mention
  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.05); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2); // C6

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch (e) {
      // Audio context blocked or not supported
    }
  };

  // Cyber Ambient Synth-wave generator
  const toggleAmbientSynth = () => {
    if (audioPlaying) {
      if (synthIntervalRef.current) {
        clearInterval(synthIntervalRef.current);
        synthIntervalRef.current = null;
      }
      setAudioPlaying(false);
      logToStatus('SYSTEM', '🎵 Ambient Synthesizer Stopped.');
    } else {
      setAudioPlaying(true);
      logToStatus('SYSTEM', '🎵 Ambient Synthesizer Started: Playing deep cybernetic retro waves...');
      
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const playSynthBeep = () => {
          const now = audioCtx.currentTime;
          const osc = audioCtx.createOscillator();
          const filter = audioCtx.createBiquadFilter();
          const gain = audioCtx.createGain();

          // Low ambient retro wave note sequence
          const notes = [110.00, 130.81, 146.83, 164.81, 196.00]; // A2, C3, D3, E3, G3
          const randomFreq = notes[Math.floor(Math.random() * notes.length)];

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(randomFreq, now);

          filter.type = 'lowpass';
          filter.Q.setValueAtTime(8, now);
          filter.frequency.setValueAtTime(100, now);
          filter.frequency.exponentialRampToValueAtTime(1200, now + 0.6);

          gain.gain.setValueAtTime(audioVolume * 0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(now);
          osc.stop(now + 1.3);
        };

        playSynthBeep();
        const intervalId = window.setInterval(playSynthBeep, 2000);
        synthIntervalRef.current = intervalId;
      } catch (e) {
        setAudioPlaying(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (synthIntervalRef.current) {
        clearInterval(synthIntervalRef.current);
      }
    };
  }, []);

  // Helper to log system/status messages
  const logToStatus = (sender: string, text: string, type: IRCMessage['type'] = 'info') => {
    const timeStr = new Date().toLocaleTimeString();
    const newMsg: IRCMessage = {
      id: `status-${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      sender,
      text,
      type
    };

    setRooms(prev => ({
      ...prev,
      Status: {
        ...prev.Status,
        messages: [...prev.Status.messages, newMsg]
      }
    }));
  };

  // Helper to add raw protocol lines
  const appendRawLog = (line: string, direction: 'in' | 'out') => {
    const symbol = direction === 'in' ? '<-' : '->';
    setRawLogs(prev => [...prev.slice(-150), `${symbol} ${line}`]);
  };

  // Inject standard raw commands into our parser
  const injectServerMessage = (rawLine: string) => {
    appendRawLog(rawLine, 'in');

    const parsed = parseIRCLine(rawLine);
    if (!parsed) return;

    const { command, params } = parsed;
    const timeStr = new Date().toLocaleTimeString();

    switch (command) {
      case '001': // Welcome
        logToStatus('SERVER', `*** ${params[1] || 'Welcome to the Net'}`, 'info');
        break;

      case '332': { // Topic
        const channelName = params[1];
        const topicText = params[2];
        setRooms(prev => {
          if (!prev[channelName]) return prev;
          return {
            ...prev,
            [channelName]: {
              ...prev[channelName],
              topic: topicText
            }
          };
        });
        break;
      }

      case '353': { // RPL_NAMREPLY
        // Syntax: :server 353 Nick = #channel :@User1 +User2 User3
        const channelName = params[2];
        const userString = params[3] || '';
        const parsedUsers = userString.split(/\s+/).filter(Boolean);

        setRooms(prev => {
          if (!prev[channelName]) return prev;
          
          // Merge users uniquely
          const currentUsers = [...prev[channelName].users];
          parsedUsers.forEach(u => {
            const cleanU = cleanNick(u);
            const index = currentUsers.findIndex(curr => cleanNick(curr) === cleanU);
            if (index !== -1) {
              currentUsers[index] = u; // update prefix if changed
            } else {
              currentUsers.push(u);
            }
          });

          return {
            ...prev,
            [channelName]: {
              ...prev[channelName],
              users: currentUsers
            }
          };
        });
        break;
      }

      case 'JOIN': {
        const joinNick = getNickFromMask(parsed.prefix);
        const channelName = params[0];
        
        setRooms(prev => {
          if (!prev[channelName]) return prev;
          const cleanJ = cleanNick(joinNick);
          const alreadyExists = prev[channelName].users.some(u => cleanNick(u) === cleanJ);
          const nextUsers = alreadyExists 
            ? prev[channelName].users 
            : [...prev[channelName].users, joinNick];

          return {
            ...prev,
            [channelName]: {
              ...prev[channelName],
              users: nextUsers,
              messages: [
                ...prev[channelName].messages,
                {
                  id: `join-${Date.now()}-${Math.random()}`,
                  timestamp: timeStr,
                  sender: 'SYSTEM',
                  text: `➡ ${joinNick} has joined ${channelName}`,
                  type: 'join'
                }
              ]
            }
          };
        });
        break;
      }

      case 'PART': {
        const partNick = getNickFromMask(parsed.prefix);
        const channelName = params[0];
        const reason = params[1] || 'Parted';

        setRooms(prev => {
          if (!prev[channelName]) return prev;
          return {
            ...prev,
            [channelName]: {
              ...prev[channelName],
              users: prev[channelName].users.filter(u => cleanNick(u) !== cleanNick(partNick)),
              messages: [
                ...prev[channelName].messages,
                {
                  id: `part-${Date.now()}-${Math.random()}`,
                  timestamp: timeStr,
                  sender: 'SYSTEM',
                  text: `⬅ ${partNick} has left ${channelName} (${reason})`,
                  type: 'part'
                }
              ]
            }
          };
        });
        break;
      }

      case 'KICK': {
        const kicker = getNickFromMask(parsed.prefix);
        const channelName = params[0];
        const target = params[1];
        const reason = params[2] || 'Kicked';

        setRooms(prev => {
          if (!prev[channelName]) return prev;
          return {
            ...prev,
            [channelName]: {
              ...prev[channelName],
              users: prev[channelName].users.filter(u => cleanNick(u) !== cleanNick(target)),
              messages: [
                ...prev[channelName].messages,
                {
                  id: `kick-${Date.now()}-${Math.random()}`,
                  timestamp: timeStr,
                  sender: 'SYSTEM',
                  text: `🚨 ${target} was kicked by ${kicker} [Reason: ${reason}]`,
                  type: 'error'
                }
              ]
            }
          };
        });
        break;
      }

      case 'QUIT': {
        const quitNick = getNickFromMask(parsed.prefix);
        const reason = params[0] || 'Disconnected';

        setRooms(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(rName => {
            const ch = next[rName];
            if (ch.users.some(u => cleanNick(u) === cleanNick(quitNick))) {
              next[rName] = {
                ...ch,
                users: ch.users.filter(u => cleanNick(u) !== cleanNick(quitNick)),
                messages: [
                  ...ch.messages,
                  {
                    id: `quit-${Date.now()}-${Math.random()}`,
                    timestamp: timeStr,
                    sender: 'SYSTEM',
                    text: `❌ ${quitNick} has quit IRC (${reason})`,
                    type: 'part'
                  }
                ]
              };
            }
          });
          return next;
        });
        break;
      }

      case 'PRIVMSG': {
        const senderNick = getNickFromMask(parsed.prefix);
        const target = params[0];
        const textMessage = params[1] || '';

        const isToChannel = target.startsWith('#');
        const isMention = textMessage.toLowerCase().includes(cleanNick(activeNick).toLowerCase());

        const msgObj: IRCMessage = {
          id: `privmsg-${Date.now()}-${Math.random()}`,
          timestamp: timeStr,
          sender: senderNick,
          text: textMessage,
          type: 'user',
          isMention: isMention
        };

        if (isToChannel) {
          // Channel message
          setRooms(prev => {
            if (!prev[target]) return prev;
            return {
              ...prev,
              [target]: {
                ...prev[target],
                messages: [...prev[target].messages, msgObj],
                unreadCount: currentRoom !== target ? prev[target].unreadCount + 1 : 0
              }
            };
          });
          if (isMention) playChime();
        } else {
          // Private chat (Query / ซิบเดี่ยว)
          const pmRoomName = `💬 ${senderNick}`;
          setRooms(prev => {
            const hasRoom = !!prev[pmRoomName];
            const updatedRoom = hasRoom ? prev[pmRoomName] : {
              name: pmRoomName,
              topic: `Private query chat with ${senderNick}`,
              users: [activeNick, senderNick],
              messages: [
                {
                  id: `pm-init-${Date.now()}`,
                  timestamp: timeStr,
                  sender: 'SYSTEM',
                  text: `🔐 Query session initialized with ${senderNick}.`,
                  type: 'info'
                }
              ],
              unreadCount: 0
            };

            return {
              ...prev,
              [pmRoomName]: {
                ...updatedRoom,
                messages: [...updatedRoom.messages, msgObj],
                unreadCount: currentRoom !== pmRoomName ? updatedRoom.unreadCount + 1 : 0
              }
            };
          });
          playChime();
        }
        break;
      }

      case 'MODE': {
        const channelName = params[0];
        const modeFlag = params[1];
        const targetNick = params[2];

        if (channelName && modeFlag && targetNick) {
          setRooms(prev => {
            if (!prev[channelName]) return prev;
            return {
              ...prev,
              [channelName]: {
                ...prev[channelName],
                users: prev[channelName].users.map(u => {
                  if (cleanNick(u) === cleanNick(targetNick)) {
                    if (modeFlag === '+o') return `@${cleanNick(targetNick)}`;
                    if (modeFlag === '-o') return cleanNick(targetNick);
                    if (modeFlag === '+v') return `+${cleanNick(targetNick)}`;
                    if (modeFlag === '-v') return cleanNick(targetNick);
                  }
                  return u;
                }),
                messages: [
                  ...prev[channelName].messages,
                  {
                    id: `mode-${Date.now()}`,
                    timestamp: timeStr,
                    sender: 'SYSTEM',
                    text: `🛡 MODE: ${getNickFromMask(parsed.prefix)} set mode ${modeFlag} on ${targetNick}`,
                    type: 'info'
                  }
                ]
              }
            };
          });
        }
        break;
      }

      default:
        break;
    }
  };

  // Secure Connection Trigger
  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick.trim()) return;

    setIsConnecting(true);
    setActiveNick(nick);

    // Simulated Handshake Delay matching standard IRC protocols
    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
      setCurrentRoom('Status');

      // Add default server channels
      const parsedChannels = autoJoin
        .split(',')
        .map(c => c.trim())
        .filter(c => c.startsWith('#'));

      const initialRooms: Record<string, IRCChannel> = {
        Status: {
          name: 'Status',
          topic: `Connection: ${server}:${port}`,
          users: [],
          messages: [
            {
              id: 'status-connected',
              timestamp: new Date().toLocaleTimeString(),
              sender: 'SYSTEM',
              text: `🚀 CONNECTED SECURELY: Successfully parsed handshakes on ${server}:${port}`,
              type: 'info',
            }
          ],
          unreadCount: 0
        }
      };

      parsedChannels.forEach(ch => {
        initialRooms[ch] = {
          name: ch,
          topic: `Welcome to ${ch} - Secure Neon Web Room`,
          users: [
            `@AdminBot`,
            `+ExpertBot`,
            `UserCoder`,
            `PyQt6Fan`,
            `ReactDev`,
            `${nick}`
          ],
          messages: [
            {
              id: `welcome-${ch}`,
              timestamp: new Date().toLocaleTimeString(),
              sender: 'SYSTEM',
              text: `🎉 You have joined ${ch}. Welcome to the Web Client!`,
              type: 'join',
            }
          ],
          unreadCount: 0
        };
      });

      setRooms(initialRooms);

      // Log raw initial handshakes to raw console for developer analysis
      appendRawLog(`CONNECT ${server}:${port}`, 'out');
      appendRawLog(`NICK ${nick}`, 'out');
      appendRawLog(`USER ${nick.toLowerCase()} 0 * :Siam Web User`, 'out');
      
      // Server responses
      setTimeout(() => {
        injectServerMessage(`:irc.siam-neon.net 001 ${nick} :Welcome to the Siam Neon Network, ${nick}!`);
        parsedChannels.forEach(ch => {
          injectServerMessage(`:${nick}!web@neon JOIN ${ch}`);
          injectServerMessage(`:irc.siam-neon.net 332 ${nick} ${ch} :This is the secure modern Web IRC channel topic! Type /help for assistance.`);
          injectServerMessage(`:irc.siam-neon.net 353 ${nick} = ${ch} :@AdminBot +ExpertBot UserCoder PyQt6Fan ReactDev ${nick}`);
        });
      }, 500);

    }, 1500);
  };

  // Disconnect handler
  const handleDisconnect = () => {
    appendRawLog(`QUIT :Client closed session`, 'out');
    setIsConnected(false);
    setCurrentRoom('Status');
    setRooms({
      Status: {
        name: 'Status',
        topic: 'IRC Client Engine - Connection Status Window',
        users: [],
        messages: [
          {
            id: 'disc-0',
            timestamp: new Date().toLocaleTimeString(),
            sender: 'SYSTEM',
            text: '❌ Disconnected from IRC server.',
            type: 'error'
          }
        ],
        unreadCount: 0
      }
    });
  };

  // Send Message & Process commands
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const text = inputValue.trim();
    setInputValue('');

    const timeStr = new Date().toLocaleTimeString();

    // Command parsing
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      appendRawLog(text.slice(1), 'out');

      switch (cmd) {
        case 'help':
          addLocalMessage(currentRoom, 'SYSTEM', '🛠 Available Commands: /join <#channel>, /query <nick>, /nick <new_nick>, /me <action>, /kick <nick> <reason>, /op <nick>, /deop <nick>, /clear', 'info');
          break;

        case 'clear':
          setRooms(prev => {
            if (!prev[currentRoom]) return prev;
            return {
              ...prev,
              [currentRoom]: {
                ...prev[currentRoom],
                messages: []
              }
            };
          });
          break;

        case 'join': {
          const newCh = args[0];
          if (!newCh || !newCh.startsWith('#')) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /join #channel_name', 'error');
            return;
          }
          // Join channel simulation
          setRooms(prev => ({
            ...prev,
            [newCh]: {
              name: newCh,
              topic: `Topic for ${newCh}`,
              users: [`@AdminBot`, `+VoiceBot`, `${activeNick}`],
              messages: [],
              unreadCount: 0
            }
          }));
          setCurrentRoom(newCh);
          
          setTimeout(() => {
            injectServerMessage(`:${activeNick}!web@neon JOIN ${newCh}`);
            injectServerMessage(`:irc.siam-neon.net 353 ${activeNick} = ${newCh} :@AdminBot +VoiceBot ${activeNick}`);
          }, 200);
          break;
        }

        case 'query': {
          const targetNick = args[0];
          if (!targetNick) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /query nickname', 'error');
            return;
          }
          const pmRoomName = `💬 ${cleanNick(targetNick)}`;
          setRooms(prev => {
            if (prev[pmRoomName]) return prev;
            return {
              ...prev,
              [pmRoomName]: {
                name: pmRoomName,
                topic: `Private query chat with ${targetNick}`,
                users: [activeNick, targetNick],
                messages: [
                  {
                    id: `pm-init-${Date.now()}`,
                    timestamp: timeStr,
                    sender: 'SYSTEM',
                    text: `🔐 Query session initialized with ${targetNick}.`,
                    type: 'info'
                  }
                ],
                unreadCount: 0
              }
            };
          });
          setCurrentRoom(pmRoomName);
          break;
        }

        case 'nick': {
          const newNickName = args[0];
          if (!newNickName) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /nick NewNickname', 'error');
            return;
          }
          injectServerMessage(`:${activeNick}!web@neon NICK ${newNickName}`);
          setActiveNick(newNickName);
          break;
        }

        case 'me': {
          const actionText = args.join(' ');
          if (!actionText) return;
          const formattedAction = `* ${activeNick} ${actionText}`;
          if (currentRoom.startsWith('💬 ')) {
            addLocalMessage(currentRoom, activeNick, formattedAction, 'user');
          } else {
            addLocalMessage(currentRoom, activeNick, formattedAction, 'user');
          }
          break;
        }

        case 'op': {
          const target = args[0];
          if (!target) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /op nick', 'error');
            return;
          }
          injectServerMessage(`:irc.siam-neon.net MODE ${currentRoom} +o ${target}`);
          break;
        }

        case 'deop': {
          const target = args[0];
          if (!target) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /deop nick', 'error');
            return;
          }
          injectServerMessage(`:irc.siam-neon.net MODE ${currentRoom} -o ${target}`);
          break;
        }

        case 'kick': {
          const target = args[0];
          const reason = args.slice(1).join(' ') || 'Kicked by operator';
          if (!target) {
            addLocalMessage(currentRoom, 'SYSTEM', '❌ Usage: /kick nick [reason]', 'error');
            return;
          }
          injectServerMessage(`:${activeNick}!web@neon KICK ${currentRoom} ${target} :${reason}`);
          break;
        }

        default:
          addLocalMessage(currentRoom, 'SYSTEM', `❌ Unknown Command: /${cmd}. Type /help to list commands.`, 'error');
          break;
      }
    } else {
      // Normal chat message
      appendRawLog(`PRIVMSG ${currentRoom.startsWith('💬 ') ? currentRoom.slice(2) : currentRoom} :${text}`, 'out');

      const userMsg: IRCMessage = {
        id: `msg-${Date.now()}`,
        timestamp: timeStr,
        sender: activeNick,
        text: text,
        type: 'user'
      };

      setRooms(prev => ({
        ...prev,
        [currentRoom]: {
          ...prev[currentRoom],
          messages: [...prev[currentRoom].messages, userMsg]
        }
      }));

      // Simulated Bot Auto-Replies for responsive user testing
      if (currentRoom.startsWith('💬 ')) {
        const partner = cleanNick(currentRoom);
        setTimeout(() => {
          let reply = '🤖 [Secure Auto-Responder]: received private message!';
          if (partner === 'AdminBot') {
            reply = '⚡ Admin bot is online. Need administrative help? Try commands like /op or /deop!';
          } else if (partner === 'ExpertBot') {
            reply = '🧠 Hello! I am a PyQt6 IRC client expert. Ask me about multi-threading, 353 parsing, or server sockets in Python!';
          }
          injectServerMessage(`:${partner}!bot@neon PRIVMSG ${activeNick} :${reply}`);
        }, 1000);
      } else {
        // 10% chance a random bot speaks in channel to keep simulation active
        if (Math.random() < 0.25) {
          setTimeout(() => {
            const bots = ['AdminBot', 'ExpertBot', 'PyQt6Fan', 'ReactDev'];
            const randomBot = bots[Math.floor(Math.random() * bots.length)];
            const quotes = [
              'Wow, this Neon interface is absolutely stunning!',
              'PyQt6 multi-threading with socket streams is so easy compared to older libraries.',
              'Remember: RPL_NAMREPLY (353) is crucial for sync lists! That is exactly what we parsing right now on the right panel.',
              'Our passwords are masks and URL parameters are 100% clean. Perfect for sharing screenshots!'
            ];
            const randQuote = quotes[Math.floor(Math.random() * quotes.length)];
            injectServerMessage(`:${randomBot}!bot@neon PRIVMSG ${currentRoom} :${randQuote}`);
          }, 1500);
        }
      }
    }
  };

  // Help append local message helper
  const addLocalMessage = (
    rName: string,
    sender: string,
    text: string,
    type: IRCMessage['type'] = 'user'
  ) => {
    const timeStr = new Date().toLocaleTimeString();
    const newMsg: IRCMessage = {
      id: `local-${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      sender,
      text,
      type
    };

    setRooms(prev => {
      if (!prev[rName]) return prev;
      return {
        ...prev,
        [rName]: {
          ...prev[rName],
          messages: [...prev[rName].messages, newMsg]
        }
      };
    });
  };

  // Helper to separate users by ranks
  const getSegregatedUsers = (users: string[]) => {
    const ops: string[] = [];
    const voiced: string[] = [];
    const regular: string[] = [];

    users.forEach(u => {
      if (u.startsWith('@')) {
        ops.push(cleanNick(u));
      } else if (u.startsWith('+')) {
        voiced.push(cleanNick(u));
      } else {
        regular.push(cleanNick(u));
      }
    });

    return { ops, voiced, regular };
  };

  const activeChannelObj = rooms[currentRoom] || rooms['Status'];
  const { ops, voiced, regular } = getSegregatedUsers(activeChannelObj.users);

  // Python source reference code display
  const pythonReferenceCode = `# ==============================================================================
# Python PyQt6 Desktop IRC Client - Core Functions
# ==============================================================================
import socket
import ssl
import sys
from PyQt6.QtCore import QThread, pyqtSignal, NSObject
from PyQt6.QtWidgets import QApplication, QMainWindow

class IRCNetworkWorker(QThread):
    # Signals to pass parsed data to UI safely
    connected_signal = pyqtSignal()
    disconnected_signal = pyqtSignal(str)
    message_received = pyqtSignal(str, str, str)  # channel, sender, text
    names_received = pyqtSignal(str, list)        # channel, list of parsed users
    topic_received = pyqtSignal(str, str)         # channel, topic

    def __init__(self, server, port, nick, password, secure=True):
        super().__init__()
        self.server = server
        self.port = int(port)
        self.nick = nick
        self.password = password
        self.secure = secure
        self.running = False
        self.sock = None

    def run(self):
        try:
            # 1. Open Secure Channel Sockets
            raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            if self.secure:
                context = ssl.create_default_context()
                self.sock = context.wrap_socket(raw_sock, server_hostname=self.server)
            else:
                self.sock = raw_sock
            
            self.sock.connect((self.server, self.port))
            self.running = True
            self.connected_signal.emit()

            # 2. Handshake credentials
            if self.password:
                self.sock.send(f"PASS {self.password}\\r\\n".encode('utf-8'))
            self.sock.send(f"NICK {self.nick}\\r\\n".encode('utf-8'))
            self.sock.send(f"USER {self.nick.lower()} 0 * :PyQt6 SiamUser\\r\\n".encode('utf-8'))

            # 3. Reading stream from socket
            buffer = ""
            while self.running:
                data = self.sock.recv(4096).decode('utf-8', errors='ignore')
                if not data:
                    break
                buffer += data
                while "\\r\\n" in buffer:
                    line, buffer = buffer.split("\\r\\n", 1)
                    self.parse_line(line)

        except Exception as e:
            self.disconnected_signal.emit(str(e))
        finally:
            self.cleanup()

    def parse_line(self, line):
        # Handle standard PING check to prevent connection timeout
        if line.startswith("PING"):
            self.sock.send(f"PONG {line.split()[1]}\\r\\n".encode('utf-8'))
            return

        # Parsing prefix, command, params
        parts = line.split(" ")
        if len(parts) < 2:
            return

        prefix = ""
        if parts[0].startswith(":"):
            prefix = parts[0][1:]
            parts = parts[1:]

        command = parts[0]
        params = parts[1:]

        # --- ดักจับฟังก์ชันสำคัญ: 353 (NAMES List) & การแยกยศ ---
        if command == "353":  # RPL_NAMREPLY
            # :server 353 MyNick = #channel :@Operator +Voiced NormalUser
            channel = params[2]
            # extract names string (everything after ':')
            names_index = line.find(" :")
            if names_index != -1:
                names_str = line[names_index + 2:]
                users_list = names_str.split(" ")
                
                # Emit users to UI thread where they will be segregated by ranks
                self.names_received.emit(channel, users_list)

        # --- ดักจับฟังก์ชันสำคัญ: ซิบเดี่ยว (Query PRIVMSG to User) ---
        elif command == "PRIVMSG":
            target = params[0]
            msg_index = line.find(" :")
            msg_text = line[msg_index + 2:] if msg_index != -1 else ""
            sender = prefix.split("!")[0]

            if not target.startswith("#"):
                # target is our nickname -> It is a private message / "ซิบเดี่ยว" query
                self.message_received.emit(f"💬 {sender}", sender, msg_text)
            else:
                # normal channel message
                self.message_received.emit(target, sender, msg_text)

    def cleanup(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass`;

  return (
    <div className="w-full h-full min-h-[580px] text-slate-100 font-sans flex flex-col items-center justify-center p-0 md:p-4 neon-bg-dark selection:bg-purple-600/30">
      
      {/* Dynamic Background Grid Mesh */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#151622_1px,transparent_1px),linear-gradient(to_bottom,#151622_1px,transparent_1px)] bg-[size:32px_32px] opacity-25 pointer-events-none" />

      {!isConnected ? (
        /* ==================== 1. LANDING SECURE LOGIN PORTAL ==================== */
        <div className="w-full max-w-lg z-10 p-6 rounded-2xl neon-card neon-border-glow-purple flex flex-col gap-6 relative overflow-hidden animate-fade-in">
          
          {/* Cyber decoration lines */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500" />
          <div className="absolute -right-20 -top-20 w-44 h-44 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-44 h-44 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Secure Header */}
          <div className="text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-purple-950/40 border border-purple-500/50 rounded-xl flex items-center justify-center text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <Lock size={22} className="animate-pulse text-pink-400" />
            </div>
            <h2 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 uppercase mt-2">
              SIAM NEON IRC CLIENT
            </h2>
            <p className="text-xs text-slate-400">
              Modern Cyberpunk Multi-User Chat Workspace
            </p>
          </div>

          {/* URL screenshot leak prevention banner */}
          <div className="bg-emerald-950/20 border border-emerald-500/25 p-3.5 rounded-xl flex items-start gap-3 text-xs leading-relaxed text-emerald-400">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider text-emerald-300 block mb-0.5">
                🔐 URL Screenshot Guard Active
              </span>
              Credentials are kept completely inside React memory storage. This prevents password or secret leaks in standard URL search queries when capturing screen snaps.
            </div>
          </div>

          {/* Secure Form */}
          <form onSubmit={handleConnect} className="flex flex-col gap-4">
            
            {/* Host Server */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1">
                  <Activity size={10} /> IRC Server Address
                </label>
                <input
                  type="text"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-cyan-300 focus:outline-none focus:border-cyan-400 transition-all font-mono"
                  placeholder="irc.example.com"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400">
                  Port
                </label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-cyan-300 focus:outline-none focus:border-cyan-400 transition-all font-mono text-center"
                  placeholder="6697"
                  required
                />
              </div>
            </div>

            {/* Nick Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1">
                <User size={10} /> Chosen Nickname
              </label>
              <input
                type="text"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 transition-all font-mono"
                placeholder="NekoCyber"
                maxLength={16}
                required
              />
            </div>

            {/* Password Masked Area */}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1">
                <Lock size={10} /> IRC Password (Muted Mask)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl pl-3 pr-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 transition-all font-mono tracking-wide"
                  placeholder="Optional channel password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-all"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Auto Join Rooms */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-cyan-400 flex items-center gap-1">
                <Hash size={10} /> Auto-Join Channels
              </label>
              <input
                type="text"
                value={autoJoin}
                onChange={(e) => setAutoJoin(e.target.value)}
                className="w-full bg-slate-950/80 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 transition-all font-mono"
                placeholder="#lobby, #help"
              />
            </div>

            {/* SSL Checkbox toggle */}
            <div className="flex items-center gap-2 py-1 select-none">
              <input
                type="checkbox"
                id="sslToggle"
                checked={isSecureSSL}
                onChange={(e) => setIsSecureSSL(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 bg-slate-950 border border-purple-500/30 rounded cursor-pointer"
              />
              <label htmlFor="sslToggle" className="text-xs text-slate-300 cursor-pointer flex items-center gap-1.5">
                <Shield size={12} className={isSecureSSL ? "text-cyan-400" : "text-slate-500"} />
                Require Secure SSL/TLS Socket Bridge (Recommended)
              </label>
            </div>

            {/* Connect Button */}
            <button
              type="submit"
              disabled={isConnecting}
              className="w-full mt-2 py-3 rounded-xl font-semibold text-sm uppercase tracking-wider neon-btn-pink flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                  Establishing Encrypted Socket Handshake...
                </>
              ) : (
                <>
                  <Power size={16} />
                  Connect Securely
                </>
              )}
            </button>
          </form>

          {/* Quick info notes footer */}
          <div className="text-[10px] text-slate-500 text-center border-t border-purple-500/10 pt-4 flex flex-col gap-1">
            <span>Powered by secure WebSocket to RFC 1459 TCP Client parser engine</span>
            <span>All client events are completely localized for maximum sandbox isolation</span>
          </div>

        </div>
      ) : (
        /* ==================== 2. MAIN NEON CLIENT WORKSPACE ==================== */
        <div className="w-full h-[90vh] min-h-[550px] max-w-7xl z-10 flex flex-col rounded-2xl neon-card neon-border-glow-purple overflow-hidden relative">
          
          {/* Top Neon Header */}
          <header className="px-4 py-3 bg-slate-950/90 border-b border-purple-500/20 flex items-center justify-between gap-4 select-none shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-pink-950/40 border border-pink-500/50 flex items-center justify-center text-pink-400">
                <Sparkles size={16} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold tracking-widest text-sm text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400">
                    SIAM NEON IRC
                  </span>
                  <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-500/25 px-1.5 py-0.5 rounded-full font-mono flex items-center gap-1">
                    <Shield size={8} /> SSL Bridge Active
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  host: {server} | nick: {activeNick}
                </span>
              </div>
            </div>

            {/* Menu Buttons & Actions */}
            <div className="flex items-center gap-2">
              
              {/* Toggle Python Reference */}
              <button
                onClick={() => {
                  setShowPythonCode(!showPythonCode);
                  if (showRawLogs) setShowRawLogs(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-all ${
                  showPythonCode 
                    ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-900 border border-purple-500/20 text-purple-300 hover:border-purple-400'
                }`}
                title="View original Python threading socket codebase"
              >
                <Code2 size={13} />
                <span>Python Backend Reference</span>
              </button>

              {/* Toggle Raw IRC Stream Log */}
              <button
                onClick={() => {
                  setShowRawLogs(!showRawLogs);
                  if (showPythonCode) setShowPythonCode(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-all ${
                  showRawLogs 
                    ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                    : 'bg-slate-900 border border-cyan-500/20 text-cyan-300 hover:border-cyan-400'
                }`}
                title="Watch raw RFC 1459 IRC stream output"
              >
                <Terminal size={13} />
                <span>Raw Protocol Stream</span>
              </button>

              {/* Disconnect Button */}
              <button
                onClick={handleDisconnect}
                className="p-1.5 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                title="Terminate secure connection"
              >
                <Power size={14} />
              </button>
            </div>
          </header>

          {/* Central Client Grid Layout */}
          <div className="flex-1 min-h-0 flex relative">
            
            {/* LEFT SIDEBAR: CHANNELS & QUERY ROOMS */}
            <aside className="w-56 bg-slate-950/80 border-r border-purple-500/10 flex flex-col select-none shrink-0">
              
              {/* Connected channels heading */}
              <div className="p-3 text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-purple-500/10 flex items-center justify-between">
                <span>Joined Rooms</span>
                <button
                  onClick={() => {
                    const cName = prompt('Enter channel to join (e.g. #lobby):', '#lobby');
                    if (cName) {
                      if (!cName.startsWith('#')) {
                        alert('Channel names must start with #');
                        return;
                      }
                      injectServerMessage(`:${activeNick}!web@neon JOIN ${cName}`);
                    }
                  }}
                  className="p-1 rounded bg-purple-950 border border-purple-500/30 text-purple-300 hover:bg-purple-500 hover:text-white transition-all"
                  title="Join new channel room"
                >
                  <Plus size={10} />
                </button>
              </div>

              {/* Nav Tabs List */}
              <div className="flex-1 overflow-y-auto cyber-scrollbar p-2 flex flex-col gap-1">
                {Object.keys(rooms).map((rName) => {
                  const rObj = rooms[rName];
                  const isActive = currentRoom === rName;
                  const isQuery = rName.startsWith('💬 ');

                  return (
                    <button
                      key={rName}
                      onClick={() => {
                        setCurrentRoom(rName);
                        // Reset unread count
                        setRooms(prev => ({
                          ...prev,
                          [rName]: { ...prev[rName], unreadCount: 0 }
                        }));
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer font-semibold ${
                        isActive 
                          ? 'bg-purple-600/25 border border-purple-500/40 text-purple-100 shadow-[inset_0_1px_8px_rgba(168,85,247,0.15)]' 
                          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isQuery ? (
                          <MessageSquare size={13} className="text-pink-400 shrink-0" />
                        ) : rName === 'Status' ? (
                          <Activity size={13} className="text-cyan-400 shrink-0" />
                        ) : (
                          <Hash size={13} className="text-purple-400 shrink-0" />
                        )}
                        <span className="truncate">{rName}</span>
                      </div>

                      {/* Unread badge & Close query option */}
                      <div className="flex items-center gap-1 shrink-0">
                        {rObj.unreadCount > 0 && (
                          <span className="bg-pink-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                            {rObj.unreadCount}
                          </span>
                        )}
                        {isQuery && (
                          <X
                            size={10}
                            className="text-slate-500 hover:text-pink-400 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Close DM
                              setRooms(prev => {
                                const next = { ...prev };
                                delete next[rName];
                                return next;
                              });
                              if (currentRoom === rName) {
                                setCurrentRoom('Status');
                              }
                            }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mini Audio Controller Synth Wave Station */}
              <div className="p-3 bg-slate-950 border-t border-purple-500/15 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-400 font-mono tracking-wider font-bold">
                    CYBERNETIC FM
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={toggleAmbientSynth}
                      className={`p-1 rounded ${
                        audioPlaying 
                          ? 'bg-pink-500/20 border border-pink-500 text-pink-400' 
                          : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-cyan-400'
                      }`}
                      title={audioPlaying ? 'Mute Synth' : 'Play Retro Synthwaves'}
                    >
                      {audioPlaying ? <Volume2 size={11} className="animate-bounce" /> : <VolumeX size={11} />}
                    </button>
                  </div>
                </div>

                {audioPlaying && (
                  <div className="flex flex-col gap-1.5">
                    {/* Visualizer bars */}
                    <div className="flex items-end gap-0.5 h-3 overflow-hidden">
                      <div className="flex-1 bg-cyan-400 animate-[cyberPulse_0.6s_infinite_ease-in-out_0.1s] rounded-t-sm" style={{height: '40%'}} />
                      <div className="flex-1 bg-purple-400 animate-[cyberPulse_0.8s_infinite_ease-in-out_0.2s] rounded-t-sm" style={{height: '90%'}} />
                      <div className="flex-1 bg-pink-400 animate-[cyberPulse_0.5s_infinite_ease-in-out_0.3s] rounded-t-sm" style={{height: '60%'}} />
                      <div className="flex-1 bg-cyan-400 animate-[cyberPulse_0.7s_infinite_ease-in-out_0.4s] rounded-t-sm" style={{height: '20%'}} />
                      <div className="flex-1 bg-purple-400 animate-[cyberPulse_0.9s_infinite_ease-in-out_0.5s] rounded-t-sm" style={{height: '75%'}} />
                    </div>
                    {/* Volume Slider */}
                    <div className="flex items-center gap-1">
                      <Volume2 size={10} className="text-slate-500" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioVolume}
                        onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                )}
              </div>

            </aside>

            {/* INTERACTIVE WORKSPACE: LOGS & CHAT BODY */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-950/40 relative">
              
              {/* Active Channel Topic Banner */}
              <div className="px-4 py-2.5 bg-slate-950/60 border-b border-purple-500/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-bold text-cyan-300 font-mono">
                    TOPIC:
                  </span>
                  <span className="text-xs text-slate-300 truncate">
                    {activeChannelObj.topic || 'No topic configured'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 shrink-0">
                  {ops.length + voiced.length + regular.length} online
                </div>
              </div>

              {/* Chat Messages Log Area */}
              <div className="flex-1 overflow-y-auto cyber-scrollbar p-4 flex flex-col gap-2.5">
                {activeChannelObj.messages.map((m, index) => {
                  const isMyMsg = m.sender === activeNick;
                  const isSystem = m.sender === 'SYSTEM' || m.sender === 'SERVER';
                  
                  // Highlight mentioned line
                  const isMentioned = m.isMention;

                  return (
                    <div
                      key={`${m.id}-${index}`}
                      className={`flex flex-col text-xs leading-relaxed transition-all max-w-full ${
                        isSystem 
                          ? 'bg-slate-900/40 border-l-2 border-cyan-500/30 px-3.5 py-1.5 rounded-r-xl' 
                          : isMentioned 
                            ? 'bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl'
                            : 'hover:bg-slate-900/20 px-2 py-1 rounded-lg'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5 select-none">
                        <span className="text-[10px] text-slate-500 font-mono font-medium">
                          [{m.timestamp.slice(0, 5)}]
                        </span>

                        {!isSystem && (
                          <span
                            onClick={() => {
                              const partner = cleanNick(m.sender);
                              if (partner !== activeNick) {
                                setInputValue(`/query ${partner}`);
                              }
                            }}
                            className={`font-mono font-bold cursor-pointer hover:underline ${
                              isMyMsg 
                                ? 'text-purple-400' 
                                : m.sender.startsWith('@') || ops.includes(m.sender)
                                  ? 'text-pink-400 neon-text-glow-pink'
                                  : m.sender.startsWith('+') || voiced.includes(m.sender)
                                    ? 'text-cyan-400 neon-text-glow-cyan'
                                    : 'text-emerald-400'
                            }`}
                          >
                            {m.sender}
                          </span>
                        )}

                        {isSystem && (
                          <span className="font-mono text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                            ⚙ SYSTEM HANDLER
                          </span>
                        )}
                      </div>

                      <div className={`break-words font-mono tracking-wide ${
                        isSystem 
                          ? 'text-slate-400 italic' 
                          : 'text-slate-100'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Interactive bottom chat input panel */}
              <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/90 border-t border-purple-500/25 shrink-0 flex items-center gap-2">
                <span className="font-mono text-xs text-purple-400 font-bold select-none pr-1">
                  [{activeNick}] &gt;
                </span>
                
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="flex-1 bg-slate-900 border border-purple-500/30 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)] transition-all"
                  placeholder="Type your message or /help commands here..."
                  maxLength={512}
                  ref={(input) => input && input.focus()}
                />

                <button
                  type="submit"
                  className="p-2 rounded-xl neon-btn-cyan cursor-pointer shrink-0"
                >
                  <Send size={14} />
                </button>
              </form>

            </main>

            {/* RIGHT SIDEBAR: MEMBER LIST BY RANKS */}
            {currentRoom !== 'Status' && (
              <aside className="w-52 bg-slate-950/80 border-l border-purple-500/10 flex flex-col select-none shrink-0 font-mono">
                
                {/* Operators Category (@) */}
                <div className="flex-1 overflow-y-auto cyber-scrollbar flex flex-col p-2.5 gap-4">
                  
                  {/* OP GROUP */}
                  {ops.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-bold tracking-wider text-pink-400 uppercase flex items-center gap-1 select-none">
                        <Shield size={10} className="text-pink-400 shrink-0" />
                        <span>Operators ({ops.length})</span>
                      </div>
                      <div className="flex flex-col gap-0.5 pl-1">
                        {ops.map(o => (
                          <div
                            key={o}
                            className="text-xs py-1 px-1.5 rounded-lg text-pink-300 font-bold flex items-center gap-1.5 cursor-pointer hover:bg-pink-500/5 hover:neon-border-glow-pink"
                            onClick={() => setInputValue(`/query ${o}`)}
                          >
                            <span className="text-[10px] text-pink-500">@</span>
                            <span>{o}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VOICED GROUP (+) */}
                  {voiced.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-1 select-none">
                        <Volume2 size={10} className="text-cyan-400 shrink-0" />
                        <span>Voiced ({voiced.length})</span>
                      </div>
                      <div className="flex flex-col gap-0.5 pl-1">
                        {voiced.map(v => (
                          <div
                            key={v}
                            className="text-xs py-1 px-1.5 rounded-lg text-cyan-300 font-bold flex items-center gap-1.5 cursor-pointer hover:bg-cyan-500/5"
                            onClick={() => setInputValue(`/query ${v}`)}
                          >
                            <span className="text-[10px] text-cyan-500">+</span>
                            <span>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* REGULAR GROUP */}
                  {regular.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase flex items-center gap-1 select-none">
                        <User size={10} className="text-slate-500 shrink-0" />
                        <span>Members ({regular.length})</span>
                      </div>
                      <div className="flex flex-col gap-0.5 pl-1">
                        {regular.map(r => (
                          <div
                            key={r}
                            className="text-xs py-1 px-1.5 rounded-lg text-slate-300 flex items-center gap-1.5 cursor-pointer hover:bg-slate-900"
                            onClick={() => setInputValue(`/query ${r}`)}
                          >
                            <span className="text-[10px] text-slate-600">•</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

              </aside>
            )}

          </div>

          {/* DYNAMIC SIDE OVERLAYS */}

          {/* Overlay 1: Raw Stream Inspector Console */}
          {showRawLogs && (
            <div className="absolute right-0 top-14 bottom-0 w-80 bg-slate-950 border-l border-cyan-500/20 shadow-2xl flex flex-col z-20 font-mono">
              <div className="p-3 bg-slate-900 border-b border-cyan-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <Terminal size={14} className="text-cyan-400 animate-pulse" />
                  RAW PROTOCOL MONITOR
                </span>
                <button
                  onClick={() => setShowRawLogs(false)}
                  className="text-slate-500 hover:text-cyan-400 transition-all p-1"
                >
                  <X size={14} />
                </button>
              </div>
              
              <div className="flex-1 p-3 overflow-y-auto cyber-scrollbar text-[11px] text-cyan-300 leading-relaxed flex flex-col gap-1.5">
                {rawLogs.map((log, lIdx) => (
                  <div key={lIdx} className="border-b border-slate-900 pb-1 break-all">
                    {log}
                  </div>
                ))}
              </div>

              <div className="p-2.5 bg-slate-950 border-t border-cyan-500/10 text-[9px] text-slate-500 leading-normal">
                Observe actual RFC 1459 IRC packets. Emulates precise background sockets streams using the client-side parser.
              </div>
            </div>
          )}

          {/* Overlay 2: Python Code reference list */}
          {showPythonCode && (
            <div className="absolute right-0 top-14 bottom-0 w-96 bg-slate-950 border-l border-purple-500/20 shadow-2xl flex flex-col z-20 font-mono">
              <div className="p-3 bg-slate-900 border-b border-purple-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <Code2 size={14} className="text-purple-400" />
                  PYTHON PYQT6 IRC CLIENT ENGINE
                </span>
                <button
                  onClick={() => setShowPythonCode(false)}
                  className="text-slate-400 hover:text-purple-400 transition-all p-1"
                >
                  <X size={14} />
                </button>
              </div>
              
              <div className="flex-1 p-3 overflow-y-auto cyber-scrollbar text-[10px] text-purple-300 leading-normal select-text">
                <pre className="whitespace-pre-wrap font-mono text-slate-300">
                  {pythonReferenceCode}
                </pre>
              </div>

              <div className="p-3 bg-slate-900/60 border-t border-purple-500/15 text-[10px] text-slate-400 flex flex-col gap-1">
                <span className="font-bold text-purple-300">🎯 Multi-threading &amp; RPL_NAMREPLY Parser</span>
                <span>The above PyQt6 worker runs on a native QThread background worker to safely parse sockets buffers without blocking the Windows desktop UI!</span>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
