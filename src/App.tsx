/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Send, 
  Languages, 
  Image as ImageIcon, 
  FileText, 
  User, 
  Loader2, 
  Globe,
  Paperclip,
  X,
  MessageSquare,
  Download,
  Eraser,
  Search,
  Reply,
  CornerDownRight,
  Pencil,
  Check,
  Shield,
  ShieldAlert,
  Type,
  Filter,
  Video,
  Mic,
  Square,
  Play,
  Smile,
  Settings,
  Palette,
  Sun,
  Moon,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';
import { translateContent, LANGUAGES } from '@/src/services/geminiService';

interface Message {
  id: string;
  text: string;
  translatedText?: string;
  senderId: string;
  senderName: string;
  senderLang: string;
  timestamp: string;
  file?: {
    data: string;
    mimeType: string;
    name: string;
  };
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
  isEdited?: boolean;
  reactions?: Record<string, string[]>;
}

interface Theme {
  id: string;
  name: string;
  bgMain: string;
  bgSurface: string;
  bgInput: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  border: string;
  backgroundImage?: string;
}

const THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'Escuro',
    bgMain: '#0A0A0A',
    bgSurface: '#141414',
    bgInput: '#1C1C1C',
    textPrimary: '#E6E6E6',
    textSecondary: '#A0A0A0',
    accent: '#8A8A6A',
    accentHover: '#A5A585',
    border: 'rgba(255, 255, 255, 0.08)',
  },
  {
    id: 'light',
    name: 'Claro',
    bgMain: '#F5F5F0',
    bgSurface: '#FFFFFF',
    bgInput: '#F0F0F0',
    textPrimary: '#1A1A1A',
    textSecondary: '#666666',
    accent: '#5A5A40',
    accentHover: '#4A4A30',
    border: 'rgba(0, 0, 0, 0.08)',
  },
  {
    id: 'midnight',
    name: 'Meia-noite',
    bgMain: '#05070A',
    bgSurface: '#0D1117',
    bgInput: '#161B22',
    textPrimary: '#C9D1D9',
    textSecondary: '#8B949E',
    accent: '#58A6FF',
    accentHover: '#1F6FEB',
    border: 'rgba(240, 246, 252, 0.1)',
  }
];

interface UserData {
  id: string;
  name: string;
  lang: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [userName, setUserName] = useState('');
  const [userLang, setUserLang] = useState('pt');
  const [isTranslating, setIsTranslating] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [filterSenderId, setFilterSenderId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [profanityFilter, setProfanityFilter] = useState(true);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [customTheme, setCustomTheme] = useState<Partial<Theme>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const theme = currentTheme;
    
    root.style.setProperty('--bg-main', theme.bgMain);
    root.style.setProperty('--bg-surface', theme.bgSurface);
    root.style.setProperty('--bg-input', theme.bgInput);
    root.style.setProperty('--text-primary', theme.textPrimary);
    root.style.setProperty('--text-secondary', theme.textSecondary);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-hover', theme.accentHover);
    root.style.setProperty('--border', theme.border);
    
    if (theme.backgroundImage) {
      root.style.setProperty('--bg-image', `url(${theme.backgroundImage})`);
    } else {
      root.style.setProperty('--bg-image', 'none');
    }
  }, [currentTheme]);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('previous_messages', (prevMessages: Message[]) => {
      setMessages(prevMessages);
    });

    newSocket.on('new_message', async (message: Message) => {
      setMessages((prev) => [...prev, message]);
      
      // Auto-translate if it's from someone else and in a different language
      if (message.senderId !== newSocket.id && message.senderLang !== userLang) {
        // We need to wait for currentUser to be set, but this listener is set up early.
        // We'll handle auto-translation in a separate useEffect or by checking state.
      }
    });

    newSocket.on('user_list', (userList: UserData[]) => {
      setUsers(userList);
    });

    newSocket.on('message_deleted', (messageId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    newSocket.on('message_edited', ({ messageId, newText }: { messageId: string; newText: string }) => {
      setMessages((prev) => prev.map((m) => 
        m.id === messageId ? { ...m, text: newText, translatedText: undefined, isEdited: true } : m
      ));
    });

    newSocket.on('message_reacted', ({ messageId, reactions }: { messageId: string; reactions: Record<string, string[]> }) => {
      setMessages((prev) => prev.map((m) => 
        m.id === messageId ? { ...m, reactions } : m
      ));
    });

    newSocket.on('user_typing', ({ name, isTyping }: { name: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        if (isTyping) {
          if (prev.includes(name)) return prev;
          return [...prev, name];
        } else {
          return prev.filter(u => u !== name);
        }
      });
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      autoTranslate &&
      lastMessage && 
      currentUser && 
      lastMessage.senderId !== socket?.id && 
      lastMessage.senderLang !== currentUser.lang && 
      !lastMessage.translatedText && 
      !isTranslating[lastMessage.id]
    ) {
      handleTranslateMessage(
        lastMessage.id, 
        lastMessage.text, 
        lastMessage.senderLang, 
        lastMessage.file
      );
    }
  }, [messages, currentUser, autoTranslate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleJoin = () => {
    if (!userName.trim() || !socket) return;
    const userData = { name: userName, lang: userLang, id: socket.id || '' };
    setCurrentUser(userData);
    socket.emit('join', userData);
    setIsJoining(false);
  };

  const handleCustomBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const bgData = reader.result as string;
        setCurrentTheme(prev => ({
          ...prev,
          id: 'custom-bg',
          name: 'Personalizado',
          backgroundImage: bgData
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCustomColor = (key: keyof Theme, color: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      id: 'custom-colors',
      name: 'Cores Customizadas',
      [key]: color
    }));
  };

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        data: reader.result as string,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          setSelectedFile({
            data: reader.result as string,
            mimeType: 'video/webm',
            name: `video_${Date.now()}.webm`
          });
        };
        reader.readAsDataURL(blob);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Não foi possível acessar a câmera.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const emojis = [
    { category: 'Recent', items: ['❤️', '👍', '🔥', '😂', '😮', '😢', '✨', '🙏'] },
    { category: 'Smileys', items: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
    { category: 'Gestures', items: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄'] },
    { category: 'Hearts', items: ['💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤'] }
  ];

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'video/*': [],
      'application/pdf': [],
      'application/msword': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': []
    },
    multiple: false
  });

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !socket || !currentUser) return;

    if (editingMessage) {
      socket.emit('edit_message', { messageId: editingMessage.id, newText: inputText });
      setEditingMessage(null);
      setInputText('');
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      socket.emit('typing', false);
    }

    const messageData = {
      text: inputText,
      senderLang: currentUser.lang,
      file: selectedFile,
      replyTo: replyingTo ? {
        id: replyingTo.id,
        text: replyingTo.text,
        senderName: replyingTo.senderName
      } : undefined
    };

    socket.emit('send_message', messageData);
    setInputText('');
    setSelectedFile(null);
    setReplyingTo(null);
  };

  const handleTranslateMessage = async (messageId: string, text: string, sourceLang: string, file?: Message['file']) => {
    if (!currentUser) return;
    
    setIsTranslating(prev => ({ ...prev, [messageId]: true }));
    
    try {
      const translated = await translateContent(
        text, 
        LANGUAGES.find(l => l.code === currentUser.lang)?.name || 'English',
        LANGUAGES.find(l => l.code === sourceLang)?.name || 'Auto',
        file ? { data: file.data, mimeType: file.mimeType } : undefined
      );

      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, translatedText: translated } : msg
      ));
    } finally {
      setIsTranslating(prev => ({ ...prev, [messageId]: false }));
    }
  };

  const handleContextMenu = (e: React.MouseEvent, messageId: string, senderId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId });
  };

  const handleDeleteMessage = () => {
    if (contextMenu && socket) {
      socket.emit('delete_message', contextMenu.messageId);
      setContextMenu(null);
    }
  };

  const handleReplyMessage = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId);
      if (message) {
        setReplyingTo(message);
      }
      setContextMenu(null);
    }
  };

  const handleReactToMessage = (messageId: string, emoji: string) => {
    if (socket) {
      socket.emit('react_to_message', { messageId, emoji });
    }
  };

  const handleEditMessage = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId);
      if (message) {
        setEditingMessage(message);
        setInputText(message.text);
        setReplyingTo(null);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      setContextMenu(null);
    }
  };

  const handleDownload = async (messageId: string, data: string, name: string) => {
    if (downloadProgress[messageId] !== undefined) return;

    setDownloadProgress(prev => ({ ...prev, [messageId]: 0 }));
    
    // Simulate progress for better UX feedback
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setDownloadProgress(prev => ({ ...prev, [messageId]: (i / steps) * 100 }));
    }

    const link = document.createElement('a');
    link.href = data;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Keep the 100% state briefly before removing
    setTimeout(() => {
      setDownloadProgress(prev => {
        const newState = { ...prev };
        delete newState[messageId];
        return newState;
      });
    }, 1500);
  };

  const handleClearTranslations = () => {
    setMessages(prev => prev.map(msg => ({ ...msg, translatedText: undefined })));
  };

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = !searchQuery.trim() || 
      msg.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
      msg.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (msg.translatedText && msg.translatedText.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSender = !filterSenderId || msg.senderId === filterSenderId;
    
    return matchesSearch && matchesSender;
  });

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const filterProfanity = (text: string) => {
    if (!profanityFilter) return text;
    // Common profanity list (Portuguese and English examples)
    const badWords = [
      'merda', 'porra', 'caralho', 'foda', 'puta', 'desgraça', 'idiota', 'burro',
      'shit', 'fuck', 'asshole', 'bitch', 'bastard', 'damn', 'hell'
    ];
    let filtered = text;
    badWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '***');
    });
    return filtered;
  };

  if (isJoining) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#141414] p-8 rounded-[32px] shadow-2xl max-w-md w-full border border-white/5"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#5A5A40] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-[#5A5A40]/20">
              <Languages className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-serif font-medium text-[#E6E6E6]">PolyglotChat</h1>
            <p className="text-[#8A8A6A] text-sm mt-2">Traduzindo o mundo em tempo real</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest font-semibold text-[#8A8A6A] mb-2">Seu Nome</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Como quer ser chamado?"
                className="w-full px-4 py-3 rounded-2xl bg-[#1C1C1C] text-[#E6E6E6] border border-white/5 focus:ring-2 focus:ring-[#5A5A40] transition-all placeholder:text-white/20"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest font-semibold text-[#8A8A6A] mb-2">Seu Idioma Nativo</label>
              <select 
                value={userLang}
                onChange={(e) => setUserLang(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-[#1C1C1C] text-[#E6E6E6] border border-white/5 focus:ring-2 focus:ring-[#5A5A40] transition-all appearance-none"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleJoin}
              disabled={!userName.trim()}
              className="w-full py-4 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#6A6A50] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#5A5A40]/20 active:scale-95"
            >
              Começar a Conversar
              <Globe className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#E6E6E6] font-sans">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-72 bg-[#141414] border-r border-white/5">
        <div className="p-6 border-bottom border-white/5">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center shadow-lg shadow-[#5A5A40]/20">
              <Languages className="text-white w-5 h-5" />
            </div>
            <span className="font-serif text-xl font-medium text-[#E6E6E6]">Polyglot</span>
          </div>
          
          <div className="space-y-1">
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8A8A6A] mb-4">Pessoas ({users.length})</h2>
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
              {users.sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0)).map(user => (
                <div key={user.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="relative">
                    <div className="w-8 h-8 bg-[#1C1C1C] rounded-full flex items-center justify-center border border-white/5">
                      <User className="w-4 h-4 text-[#8A8A6A]" />
                    </div>
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#141414]",
                      user.isOnline ? "bg-emerald-500" : "bg-white/20"
                    )} />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className={cn(
                      "text-sm font-medium truncate",
                      !user.isOnline && "text-white/40"
                    )}>
                      {user.name} {user.name === currentUser?.name && '(Você)'}
                    </span>
                    <span className="text-[10px] text-[#8A8A6A] uppercase tracking-wider">
                      {typingUsers.includes(user.name) ? (
                        <span className="text-emerald-500 font-bold animate-pulse">Digitando...</span>
                      ) : user.isOnline ? (
                        LANGUAGES.find(l => l.code === user.lang)?.name
                      ) : (
                        `Visto ${new Date(user.lastSeen || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-6 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center">
              <User className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{currentUser?.name}</span>
              <span className="text-xs text-[#8A8A6A]">{LANGUAGES.find(l => l.code === currentUser?.lang)?.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 bg-[#141414] border-b border-white/5 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-2 flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-[#8A8A6A]" />
            <h2 className="font-medium hidden sm:block">Chat Global</h2>
          </div>

          <div className="flex-1 max-w-md mx-4 flex items-center gap-2">
            <div className="relative group flex-1">
              <Search className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors",
                isSearching ? "text-[#5A5A40]" : "text-white/20 group-hover:text-white/40"
              )} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearching(true)}
                onBlur={() => !searchQuery && setIsSearching(false)}
                placeholder="Buscar mensagens..."
                className="w-full bg-[#1C1C1C] border border-white/5 rounded-full py-1.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#5A5A40] transition-all placeholder:text-white/20"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="relative flex items-center gap-2 bg-[#1C1C1C] border border-white/5 rounded-full px-3 py-1.5 group hover:border-white/10 transition-colors">
              <Filter className={cn(
                "w-3.5 h-3.5 transition-colors",
                filterSenderId ? "text-[#5A5A40]" : "text-white/20"
              )} />
              <select
                value={filterSenderId || ''}
                onChange={(e) => setFilterSenderId(e.target.value || null)}
                className="bg-transparent text-xs text-[#8A8A6A] outline-none cursor-pointer appearance-none pr-4"
              >
                <option value="" className="bg-[#141414]">Todos</option>
                {users.map(user => (
                  <option key={user.id} value={user.id} className="bg-[#141414]">
                    {user.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 pointer-events-none">
                <CornerDownRight className="w-2 h-2 rotate-45 text-white/20" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-2 rounded-full transition-all",
                showSettings ? "bg-[#5A5A40] text-white" : "hover:bg-white/5 text-white/40"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative"
          style={{ 
            backgroundImage: 'var(--bg-image)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
          }}
        >
          {currentTheme.backgroundImage && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none" />
          )}
          {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/10">
              {searchQuery ? (
                <>
                  <Search className="w-12 h-12 mb-4 opacity-10" />
                  <p className="text-sm italic">Nenhuma mensagem encontrada para "{searchQuery}"</p>
                </>
              ) : (
                <>
                  <Globe className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm italic">Nenhuma mensagem ainda. Comece a conversa!</p>
                </>
              )}
            </div>
          )}
          
          <AnimatePresence initial={false}>
            {filteredMessages.map((msg) => {
              const isMe = msg.senderId === socket?.id;
              const needsTranslation = msg.senderLang !== currentUser?.lang;
              
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[85%] md:max-w-[70%]",
                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8A6A]">
                      {isMe ? 'Você' : msg.senderName}
                    </span>
                    <span 
                      className="text-[10px] text-white/40 font-medium"
                      title={new Date(msg.timestamp).toLocaleString()}
                    >
                      {formatMessageTime(msg.timestamp)}
                    </span>
                    {msg.isEdited && (
                      <span className="text-[10px] text-white/20 italic">(editada)</span>
                    )}
                  </div>

                  <div 
                    onContextMenu={(e) => handleContextMenu(e, msg.id, msg.senderId)}
                    className={cn(
                      "p-4 rounded-[24px] shadow-lg relative group cursor-default",
                      isMe ? "bg-[#5A5A40] text-white rounded-tr-none" : "bg-[#1C1C1C] text-[#E6E6E6] rounded-tl-none border border-white/5"
                    )}
                  >
                    {msg.replyTo && (
                      <div className={cn(
                        "mb-3 p-2 rounded-xl border-l-4 text-xs bg-black/10 flex flex-col gap-1",
                        isMe ? "border-white/40" : "border-[#5A5A40]"
                      )}>
                        <span className="font-bold opacity-60 flex items-center gap-1">
                          <Reply className="w-3 h-3" />
                          {msg.replyTo.senderName}
                        </span>
                        <span className="truncate opacity-80 italic">
                          {filterProfanity(msg.replyTo.text)}
                        </span>
                      </div>
                    )}
                    {msg.file && (
                      <div className="mb-3 relative group/file">
                        {msg.file.mimeType.startsWith('image/') ? (
                          <div className="relative">
                            <img 
                              src={msg.file.data} 
                              alt="Sent file" 
                              className="rounded-xl max-w-full h-auto max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity border border-white/5"
                              referrerPolicy="no-referrer"
                              onClick={() => window.open(msg.file?.data)}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(msg.id, msg.file!.data, msg.file!.name);
                              }}
                              className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/file:opacity-100 transition-opacity hover:bg-black/80 backdrop-blur-sm"
                              title="Baixar imagem"
                            >
                              {downloadProgress[msg.id] !== undefined ? (
                                <div className="w-4 h-4 flex items-center justify-center">
                                  <svg className="w-4 h-4 -rotate-90">
                                    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                                    <circle 
                                      cx="8" cy="8" r="7" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="2" 
                                      strokeDasharray={44} 
                                      strokeDashoffset={44 - (44 * downloadProgress[msg.id] / 100)} 
                                      className="transition-all duration-100" 
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ) : msg.file.mimeType.startsWith('video/') ? (
                          <div className="relative group/video">
                            <video 
                              src={msg.file.data} 
                              controls 
                              className="rounded-xl max-w-full h-auto max-h-64 border border-white/5 bg-black"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(msg.id, msg.file!.data, msg.file!.name);
                              }}
                              className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/video:opacity-100 transition-opacity hover:bg-black/80 backdrop-blur-sm z-10"
                              title="Baixar vídeo"
                            >
                              {downloadProgress[msg.id] !== undefined ? (
                                <div className="w-4 h-4 flex items-center justify-center">
                                  <svg className="w-4 h-4 -rotate-90">
                                    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                                    <circle 
                                      cx="8" cy="8" r="7" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="2" 
                                      strokeDasharray={44} 
                                      strokeDashoffset={44 - (44 * downloadProgress[msg.id] / 100)} 
                                      className="transition-all duration-100" 
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <div 
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-white/5 transition-colors pr-12",
                                isMe ? "border-white/20 bg-white/10" : "border-white/10 bg-[#0A0A0A]"
                              )}
                              onClick={() => window.open(msg.file?.data)}
                            >
                              <FileText className="w-5 h-5 text-[#8A8A6A]" />
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-xs font-medium truncate">{msg.file.name}</span>
                                <span className="text-[10px] opacity-60 uppercase">{msg.file.mimeType.split('/')[1]}</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(msg.id, msg.file!.data, msg.file!.name);
                              }}
                              className={cn(
                                "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all",
                                isMe ? "hover:bg-white/20 text-white" : "hover:bg-white/10 text-[#8A8A6A]"
                              )}
                              title="Baixar arquivo"
                            >
                              {downloadProgress[msg.id] !== undefined ? (
                                <div className="w-4 h-4 flex items-center justify-center">
                                  <svg className="w-4 h-4 -rotate-90">
                                    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                                    <circle 
                                      cx="8" cy="8" r="7" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="2" 
                                      strokeDasharray={44} 
                                      strokeDashoffset={44 - (44 * downloadProgress[msg.id] / 100)} 
                                      className="transition-all duration-100" 
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className={cn(
                      "leading-relaxed whitespace-pre-wrap",
                      fontSize === 'sm' ? "text-xs" : fontSize === 'base' ? "text-sm" : "text-base"
                    )}>
                      {filterProfanity(msg.text)}
                    </div>

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReactToMessage(msg.id, emoji)}
                            className={cn(
                              "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-all",
                              users.includes(socket?.id || '') 
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" 
                                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                            )}
                          >
                            <span>{emoji}</span>
                            <span className="font-bold">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {needsTranslation && !msg.translatedText && (
                      <button 
                        onClick={() => handleTranslateMessage(msg.id, msg.text, msg.senderLang, msg.file)}
                        disabled={isTranslating[msg.id]}
                        className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest py-1.5 px-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 border border-white/5"
                      >
                        {isTranslating[msg.id] ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Traduzindo...
                          </>
                        ) : (
                          <>
                            <Languages className="w-3 h-3" />
                            Traduzir para {LANGUAGES.find(l => l.code === currentUser?.lang)?.name}
                          </>
                        )}
                      </button>
                    )}

                    {msg.translatedText && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className={cn(
                          "mt-3 pt-3 border-t text-sm italic",
                          isMe ? "border-white/20 text-white/90" : "border-white/5 text-[#A0A0A0]"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
                          <Globe className="w-3 h-3" />
                          Tradução
                        </div>
                        <div className={cn(
                          "markdown-body",
                          fontSize === 'sm' ? "text-xs" : fontSize === 'base' ? "text-sm" : "text-base"
                        )}>
                          <Markdown>{filterProfanity(msg.translatedText)}</Markdown>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            <div ref={messagesEndRef} />
          </AnimatePresence>

          {/* Typing Indicator */}
          <AnimatePresence>
            {typingUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-2 text-[10px] text-[#8A8A6A] font-medium italic px-1"
              >
                <div className="flex gap-1">
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-[#8A8A6A] rounded-full" />
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-[#8A8A6A] rounded-full" />
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-[#8A8A6A] rounded-full" />
                </div>
                {typingUsers.length === 1 
                  ? <><span className="font-bold">{typingUsers[0]}</span> está digitando...</>
                  : typingUsers.length === 2
                  ? <><span className="font-bold">{typingUsers[0]}</span> e <span className="font-bold">{typingUsers[1]}</span> estão digitando...</>
                  : <><span className="font-bold">{typingUsers[0]}</span>, <span className="font-bold">{typingUsers[1]}</span> e outros estão digitando...</>
                }
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-[#141414] border-t border-white/5">
          <AnimatePresence>
            {editingMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-4 p-3 bg-[#1C1C1C] rounded-2xl flex items-center justify-between border-l-4 border-emerald-500 border-y border-r border-white/5"
              >
                <div className="flex flex-col gap-1 overflow-hidden pr-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                    <Pencil className="w-3 h-3" />
                    Editando sua mensagem
                  </span>
                  <p className="text-xs text-white/60 truncate italic">{filterProfanity(editingMessage.text)}</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingMessage(null);
                    setInputText('');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 hover:bg-white/5 rounded-full transition-colors text-white/40 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest border border-white/5"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
              </motion.div>
            )}
            {replyingTo && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-4 p-3 bg-[#1C1C1C] rounded-2xl flex items-center justify-between border-l-4 border-[#5A5A40] border-y border-r border-white/5"
              >
                <div className="flex flex-col gap-1 overflow-hidden pr-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A6A] flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    Respondendo a {replyingTo.senderName}
                  </span>
                  <p className="text-xs text-white/60 truncate italic">{filterProfanity(replyingTo.text)}</p>
                </div>
                <button 
                  onClick={() => setReplyingTo(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {selectedFile && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-[#1C1C1C] rounded-2xl flex items-center justify-between border border-white/5"
            >
              <div className="flex items-center gap-3">
                {selectedFile.mimeType.startsWith('image/') ? (
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10">
                    <img src={selectedFile.data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : selectedFile.mimeType.startsWith('video/') ? (
                  <div className="w-12 h-12 rounded-lg bg-[#0A0A0A] flex items-center justify-center border border-white/10 overflow-hidden">
                    <video src={selectedFile.data} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#0A0A0A] flex items-center justify-center border border-white/10">
                    <FileText className="w-6 h-6 text-[#8A8A6A]" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[#E6E6E6]">{selectedFile.name}</span>
                  <span className="text-[10px] text-[#8A8A6A] uppercase">{selectedFile.mimeType.split('/')[1]}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedFile(null)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (socket) {
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    socket.emit('typing', true);
                    typingTimeoutRef.current = setTimeout(() => {
                      socket.emit('typing', false);
                    }, 2000);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escreva uma mensagem..."
                className="w-full pl-4 pr-12 py-4 rounded-[24px] bg-[#1C1C1C] text-[#E6E6E6] border border-white/5 focus:ring-2 focus:ring-[#5A5A40] transition-all resize-none max-h-32 min-h-[56px] placeholder:text-white/20"
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      showEmojiPicker ? "bg-[#5A5A40] text-white" : "hover:bg-white/5 text-[#8A8A6A]"
                    )}
                    title="Emojis"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <AnimatePresence>
                    {showEmojiPicker && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute bottom-full right-0 mb-4 w-72 h-96 bg-[#1C1C1C] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50"
                      >
                        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-[#141414]">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A6A]">Emojis</span>
                          <button onClick={() => setShowEmojiPicker(false)} className="text-white/20 hover:text-white/60">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                          {emojis.map((group) => (
                            <div key={group.category} className="mb-4">
                              <h4 className="text-[9px] font-bold uppercase tracking-tighter text-white/30 mb-2">{group.category}</h4>
                              <div className="grid grid-cols-8 gap-1">
                                {group.items.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => addEmoji(emoji)}
                                    className="text-lg hover:bg-white/5 p-1 rounded transition-colors flex items-center justify-center"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    isRecording ? "bg-red-500 text-white animate-pulse" : "hover:bg-white/5 text-[#8A8A6A]"
                  )}
                  title={isRecording ? "Parar gravação" : "Gravar vídeo"}
                >
                  {isRecording ? <Square className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
                <div {...getRootProps()} className="p-2 hover:bg-white/5 rounded-full cursor-pointer transition-colors">
                  <input {...getInputProps()} />
                  <Paperclip className="w-5 h-5 text-[#8A8A6A]" />
                </div>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={!inputText.trim() && !selectedFile}
              className={cn(
                "w-14 h-14 text-white rounded-full flex items-center justify-center transition-all shadow-lg flex-shrink-0 active:scale-95",
                editingMessage ? "bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600" : "bg-[#5A5A40] shadow-[#5A5A40]/20 hover:bg-[#6A6A50]",
                (!inputText.trim() && !selectedFile) && "opacity-50 shadow-none"
              )}
            >
              {editingMessage ? <Check className="w-6 h-6" /> : <Send className="w-6 h-6" />}
            </button>
          </form>
          <p className="text-[10px] text-white/20 mt-3 text-center uppercase tracking-widest">
            Pressione Enter para enviar • Shift + Enter para nova linha
          </p>
        </div>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[100] bg-[#1C1C1C] border border-white/10 shadow-2xl rounded-xl py-1 min-w-[160px] backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            {messages.find(m => m.id === contextMenu.messageId)?.senderId === socket?.id && (
              <>
                <button
                  onClick={handleDeleteMessage}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Excluir mensagem
                </button>
                <button
                  onClick={handleEditMessage}
                  className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Editar mensagem
                </button>
              </>
            )}
            <button
              onClick={handleReplyMessage}
              className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <Reply className="w-4 h-4" />
              Responder
            </button>
            <div className="border-t border-white/5 my-1" />
            <div className="px-2 py-1 flex items-center justify-around gap-1">
              {['❤️', '👍', '🔥', '😂', '😮', '😢'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    handleReactToMessage(contextMenu.messageId, emoji);
                    setContextMenu(null);
                  }}
                  className="text-lg hover:scale-125 transition-transform p-1.5 rounded-lg hover:bg-white/5"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[110] flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-[#141414] border-l border-white/5 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center">
                    <Settings className="text-white w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-serif font-medium">Configurações</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Theme Section */}
                <section>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-[#8A8A6A] mb-4 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Temas de Cores
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => setCurrentTheme(theme)}
                        className={cn(
                          "p-4 rounded-2xl border transition-all text-left flex flex-col gap-2",
                          currentTheme.id === theme.id 
                            ? "border-[#5A5A40] bg-[#5A5A40]/10" 
                            : "border-white/5 bg-[#1C1C1C] hover:border-white/20"
                        )}
                      >
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.bgMain }} />
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.accent }} />
                        </div>
                        <span className="text-sm font-medium">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Custom Background Section */}
                <section>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-[#8A8A6A] mb-4 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Fundo Personalizado
                  </h3>
                  <div className="space-y-4">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-white/20 group-hover:text-white/40 mb-2" />
                        <p className="text-xs text-white/40">Clique para enviar uma foto</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleCustomBackground} />
                    </label>
                    {currentTheme.backgroundImage && (
                      <button 
                        onClick={() => setCurrentTheme(prev => ({ ...prev, backgroundImage: undefined }))}
                        className="w-full py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                      >
                        Remover Fundo
                      </button>
                    )}
                  </div>
                </section>

                {/* Custom Colors Section */}
                <section>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-[#8A8A6A] mb-4 flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Cores Personalizadas
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/60">Cor Principal (Accent)</span>
                      <input 
                        type="color" 
                        value={currentTheme.accent}
                        onChange={(e) => handleCustomColor('accent', e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/60">Fundo Principal</span>
                      <input 
                        type="color" 
                        value={currentTheme.bgMain}
                        onChange={(e) => handleCustomColor('bgMain', e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                      />
                    </div>
                  </div>
                </section>

                {/* Preferences Section */}
                <section>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-[#8A8A6A] mb-4">Preferências</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Tamanho da Fonte</span>
                        <span className="text-xs text-white/40">Ajuste a legibilidade</span>
                      </div>
                      <div className="flex bg-[#1C1C1C] rounded-lg p-1 border border-white/5">
                        {(['sm', 'base', 'lg'] as const).map(size => (
                          <button
                            key={size}
                            onClick={() => setFontSize(size)}
                            className={cn(
                              "px-3 py-1 rounded-md text-xs transition-all",
                              fontSize === size ? "bg-[#5A5A40] text-white" : "text-white/40 hover:text-white/60"
                            )}
                          >
                            {size === 'sm' ? 'P' : size === 'base' ? 'M' : 'G'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Filtro de Profanidade</span>
                        <span className="text-xs text-white/40">Ocultar palavras ofensivas</span>
                      </div>
                      <button 
                        onClick={() => setProfanityFilter(!profanityFilter)}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative",
                          profanityFilter ? "bg-emerald-500" : "bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          profanityFilter ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-white/5 bg-white/5">
                <button 
                  onClick={() => {
                    setCurrentTheme(THEMES[0]);
                    setFontSize('base');
                    setProfanityFilter(true);
                  }}
                  className="w-full py-3 text-sm text-white/40 hover:text-white/60 transition-colors flex items-center justify-center gap-2"
                >
                  <Eraser className="w-4 h-4" />
                  Redefinir para o Padrão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
