import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage } from '../lib/chat';
import { formatMessageTime, parseMessageLinks } from '../lib/chat';
import '../styles/chat.css';

/* ---------------- SVG ICONS ---------------- */
function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ---------------- TYPES & PROPS ---------------- */
export interface ChatProps {
  /** Controls visibility of the chat drawer */
  isOpen: boolean;
  /** Callback to close the chat drawer */
  onClose: () => void;
  /** Active message list */
  messages: ChatMessage[];
  /** Callback fired when user sends a text message */
  onSendMessage: (text: string) => void;
  /** Current unread count to show in header badge */
  unreadCount?: number;
  /** Current user's socket / peer ID to differentiate self messages */
  currentUserId?: string;
  /** Header title, defaults to "In-Call Messages" */
  title?: string;
  /** Custom input placeholder */
  placeholder?: string;
}

export interface ChatToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
  className?: string;
}

/* ---------------- TOGGLE BUTTON COMPONENT ---------------- */
export function ChatToggleButton({
  isOpen,
  onToggle,
  unreadCount = 0,
  className = '',
}: ChatToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`ctrl-btn ${isOpen ? 'highlight' : ''} ${className}`}
      data-tip={isOpen ? 'Close Chat' : 'Messages'}
      aria-label={isOpen ? 'Close in-call chat' : 'Open in-call chat'}
      style={{ position: 'relative' }}
    >
      <ChatIcon size={20} />
      {unreadCount > 0 && !isOpen && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            padding: '0 4px',
            backgroundColor: '#7c5cff',
            color: '#fff',
            fontSize: '0.68rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px rgba(124, 92, 255, 0.8)',
          }}
          aria-label={`${unreadCount} unread messages`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

/* ---------------- MAIN CHAT DRAWER COMPONENT ---------------- */
export function Chat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  unreadCount = 0,
  currentUserId,
  title = 'In-Call Messages',
  placeholder = 'Send a message to room...',
}: ChatProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to latest message when messages change or drawer opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input automatically on desktop when drawer opens
  useEffect(() => {
    if (isOpen) {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (!isTouch) {
        inputRef.current?.focus();
      }
    }
  }, [isOpen]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputText.trim();
      if (!trimmed) return;

      onSendMessage(trimmed);
      setInputText('');
    },
    [inputText, onSendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  return (
    <>
      {/* Dimmed backdrop (click to dismiss) */}
      <div
        className={`chat-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer */}
      <aside
        className={`chat-drawer ${isOpen ? 'open' : ''}`}
        aria-label={title}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-title-wrap">
            <h2 className="chat-header-title">{title}</h2>
            {unreadCount > 0 && (
              <span className="chat-unread-badge" aria-label={`${unreadCount} unread`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <button
            type="button"
            className="chat-close-btn"
            onClick={onClose}
            aria-label="Close chat"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        {/* Message List */}
        <div className="chat-messages-container" role="log" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <ChatIcon size={24} />
              </div>
              <p className="chat-empty-title">No messages yet</p>
              <p className="chat-empty-sub">
                Send a message or drop links to everyone in the room.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isSelf = msg.isLocal || (currentUserId ? msg.senderId === currentUserId : false);
              const tokens = parseMessageLinks(msg.text);

              return (
                <div
                  key={msg.id}
                  className={`chat-msg-row ${isSelf ? 'msg-self' : 'msg-peer'}`}
                >
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-meta">
                      <span className="chat-sender-name">
                        {isSelf ? 'You' : msg.senderName}
                      </span>
                      <span className="chat-msg-time">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                    </div>

                    <div className="chat-msg-content">
                      {tokens.map((token, idx) => {
                        if (token.type === 'link' && token.href) {
                          return (
                            <a
                              key={idx}
                              href={token.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="chat-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {token.text}
                            </a>
                          );
                        }
                        return <span key={idx}>{token.text}</span>;
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {/* Input Bar */}
        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={placeholder}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            maxLength={1000}
            aria-label="Type a message"
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!inputText.trim()}
            aria-label="Send message"
          >
            <SendIcon size={18} />
          </button>
        </form>
      </aside>
    </>
  );
}

export { Chat as ChatDrawer };
