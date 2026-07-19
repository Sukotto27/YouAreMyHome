import { useEffect, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { buildTimeline, toDate } from '../lib/chatGrouping'
import { resizeImageFile } from '../lib/image'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import { backgroundStyleFor } from '../lib/chatBackgrounds'
import { chatFontClassName } from '../lib/chatFonts'
import { textColorFor } from '../lib/bubbleColors'
import { avatarFor } from '../lib/avatars'
import { playSound } from '../lib/sounds'
import ChatMenu from '../components/chat/ChatMenu'
import EmojiPicker from '../components/chat/EmojiPicker'
import MessageActionMenu from '../components/chat/MessageActionMenu'
import { useChatSettings } from '../hooks/useChatSettings'
import { useLongPress } from '../hooks/useLongPress'
import { useMarkSeen } from '../hooks/useMarkSeen'
import { usePartnerSeenAt } from '../hooks/usePartnerSeenAt'
import { useTypingIndicator } from '../hooks/useTypingIndicator'

const RECENT_LIMIT = 200

export default function Chat() {
  const { user } = useAuth()
  useMarkSeen('chat')
  const partnerSeenAt = usePartnerSeenAt('chat')
  const { partnerTyping, notifyTyping, stopTyping } = useTypingIndicator()
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [chatSettings, updateChatSettings] = useChatSettings()
  const [pickingMenu, setPickingMenu] = useState(false)
  const [pickingEmoji, setPickingEmoji] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const imageInputRef = useRef(null)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  useEffect(() => stopTyping, [stopTyping])

  const prevPartnerTypingRef = useRef(false)
  useEffect(() => {
    if (partnerTyping && !prevPartnerTypingRef.current) playSound('typing')
    prevPartnerTypingRef.current = partnerTyping
  }, [partnerTyping])

  const myLastMessage = [...messages].reverse().find((m) => m.senderUid === user.uid)
  const myLastMessageRead = !!(
    myLastMessage &&
    partnerSeenAt &&
    toDate(myLastMessage.createdAt).getTime() <= partnerSeenAt.toMillis()
  )
  const prevReadRef = useRef(false)
  useEffect(() => {
    if (myLastMessageRead && !prevReadRef.current) playSound('chat_read')
    prevReadRef.current = myLastMessageRead
  }, [myLastMessageRead])

  useEffect(() => {
    if (!firebaseReady) return
    const messagesQuery = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_LIMIT),
    )
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse())
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function insertEmoji(emoji) {
    setDraft((prev) => prev + emoji)
    inputRef.current?.focus()
  }

  function openMessageMenu(event, message) {
    setActiveMenu({ x: event.clientX, y: event.clientY, message })
  }

  async function toggleReaction(message, emoji) {
    const current = message.reactions?.[user.uid]
    const next = current === emoji ? null : emoji

    if (!firebaseReady) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m
          const reactions = { ...m.reactions }
          if (next) reactions[user.uid] = next
          else delete reactions[user.uid]
          return { ...m, reactions }
        }),
      )
      setActiveMenu(null)
      return
    }

    await updateDoc(doc(db, 'messages', message.id), {
      [`reactions.${user.uid}`]: next ?? deleteField(),
    })
    setActiveMenu(null)
  }

  function buildReplySnapshot() {
    if (!replyingTo) return null
    return {
      id: replyingTo.id,
      senderName: replyingTo.senderName,
      text: replyingTo.type === 'image' ? '📷 Photo' : replyingTo.text,
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return

    playSound('chat_send')
    setSending(true)
    setDraft('')
    stopTyping()
    const replyTo = buildReplySnapshot()
    setReplyingTo(null)

    if (!firebaseReady) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'text',
          text,
          replyTo,
          senderUid: user.uid,
          senderName: user.displayName || user.email,
          createdAt: { toDate: () => new Date() },
        },
      ])
      setSending(false)
      return
    }

    try {
      await addDoc(collection(db, 'messages'), {
        type: 'text',
        text,
        replyTo,
        senderUid: user.uid,
        senderName: user.displayName || user.email,
        createdAt: serverTimestamp(),
      })
    } finally {
      setSending(false)
    }
  }

  async function handleImageSelect(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingImage(true)
    const replyTo = buildReplySnapshot()
    setReplyingTo(null)
    try {
      const imageDataUrl = await resizeImageFile(file)
      const senderName = user.displayName || user.email

      if (!firebaseReady) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: 'image',
            imageDataUrl,
            replyTo,
            senderUid: user.uid,
            senderName,
            createdAt: { toDate: () => new Date() },
          },
        ])
        const gallery = readDemoList('gallery')
        writeDemoList('gallery', [
          { id: crypto.randomUUID(), imageDataUrl, uploadedByName: senderName, createdAt: new Date().toISOString() },
          ...gallery,
        ])
        return
      }

      await addDoc(collection(db, 'messages'), {
        type: 'image',
        imageDataUrl,
        replyTo,
        senderUid: user.uid,
        senderName,
        createdAt: serverTimestamp(),
      })
      await addDoc(collection(db, 'gallery'), {
        imageDataUrl,
        uploadedBy: user.uid,
        uploadedByName: senderName,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastActivityByUid: user.uid,
        commentCount: 0,
      })
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleExportHistory() {
    let all = messages
    if (firebaseReady) {
      const snapshot = await getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'asc')))
      all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }

    const lines = all.map((message) => {
      const stamp = toDate(message.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      const body = message.type === 'image' ? '[photo]' : message.text
      const replyNote = message.replyTo ? ` (replying to ${message.replyTo.senderName}: "${message.replyTo.text}")` : ''
      return `[${stamp}] ${message.senderName}: ${body}${replyNote}`
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `chat-history-${new Date().toISOString().slice(0, 10)}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  const backgroundStyle = backgroundStyleFor(chatSettings.background)
  const timeline = buildTimeline(messages)

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="absolute right-4 top-3 z-10 flex items-center gap-2 sm:right-6">
        <button
          type="button"
          onClick={() => setPickingMenu((v) => !v)}
          aria-label="Chat options"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
        </button>
      </div>
      {pickingMenu && (
        <ChatMenu
          settings={chatSettings}
          onUpdateSettings={updateChatSettings}
          onExportHistory={handleExportHistory}
          onClose={() => setPickingMenu(false)}
        />
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4 sm:px-6" style={backgroundStyle}>
        {messages.length === 0 && (
          <p className="pt-10 text-center font-hand text-xl text-ink-soft">
            say something sweet... (algo doce)
          </p>
        )}
        {timeline.map((item) =>
          item.type === 'separator' ? (
            <div key={item.key} className="flex justify-center py-2">
              <span className="rounded-full bg-white/60 px-3 py-1 font-body text-xs text-ink-soft">
                {item.label}
              </span>
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              isOwn={item.message.senderUid === user.uid}
              tight={item.tight}
              onOpenMenu={openMessageMenu}
              chatSettings={chatSettings}
              read={
                item.message.senderUid === user.uid &&
                !!partnerSeenAt &&
                toDate(item.message.createdAt).getTime() <= partnerSeenAt.toMillis()
              }
            />
          ),
        )}
        {partnerTyping && (
          <p className="px-1 font-hand text-lg text-ink-soft">{partnerName} is typing…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {activeMenu && (
        <MessageActionMenu
          x={activeMenu.x}
          y={activeMenu.y}
          onSelectReaction={(emoji) => toggleReaction(activeMenu.message, emoji)}
          onReply={() => {
            setReplyingTo(activeMenu.message)
            setActiveMenu(null)
          }}
          onClose={() => setActiveMenu(null)}
        />
      )}

      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-ink/10 bg-blush-soft/40 px-4 py-2 sm:px-6">
          <div className="min-w-0 flex-1 border-l-2 border-rose pl-2">
            <p className="font-body text-xs font-medium text-rose">
              Replying to {replyingTo.senderName}
            </p>
            <p className="truncate font-body text-xs text-ink-soft">
              {replyingTo.type === 'image' ? '📷 Photo' : replyingTo.text}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="shrink-0 font-body text-lg text-ink-soft hover:text-rose"
          >
            ×
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-2 border-t border-ink/10 px-4 py-3 sm:px-6"
      >
        {pickingEmoji && <EmojiPicker onSelect={insertEmoji} />}
        <button
          type="button"
          onClick={() => setPickingEmoji((v) => !v)}
          aria-label="Insert emoji"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl transition-transform hover:scale-110"
        >
          😊
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={uploadingImage}
          aria-label="Send a photo"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-rose disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="M3.5 16l4.5-4.5 3.5 3.5 3-3 5 5" />
          </svg>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) notifyTyping()
          }}
          placeholder="Type a message..."
          className="flex-1 rounded-full border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message, isOwn, tight, onOpenMenu, chatSettings, read }) {
  const time = toDate(message.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const pressHandlers = useLongPress((event) => onOpenMenu(event, message))
  const reactionEmojis = [...new Set(Object.values(message.reactions || {}))]
  const avatarSrc = avatarFor(message.senderName, chatSettings.avatars)
  const customColor = chatSettings.bubbleColors[message.senderName]
  const fontClassName = chatFontClassName(chatSettings.font)

  const isMedia = message.type === 'image' || message.type === 'link'

  const bubbleStyle =
    !isMedia && customColor
      ? { backgroundColor: customColor, color: textColorFor(customColor), WebkitTouchCallout: 'none' }
      : { WebkitTouchCallout: 'none' }

  const bubbleClassName = isMedia
    ? isOwn
      ? 'rounded-br-sm bg-rose/20'
      : 'rounded-bl-sm border border-teal/30 bg-white/70'
    : customColor
      ? isOwn
        ? 'rounded-br-sm'
        : 'rounded-bl-sm'
      : isOwn
        ? 'rounded-br-sm bg-rose text-paper'
        : 'rounded-bl-sm border border-teal/30 bg-white/70 text-ink'

  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${tight ? 'mb-0.5' : 'mb-2'}`}>
      <div className="h-6 w-6 shrink-0">
        {avatarSrc && !tight && (
          <img src={avatarSrc} alt="" className="h-6 w-6 rounded-full object-cover" />
        )}
      </div>
      <div className={`flex min-w-0 flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="relative max-w-[80%] sm:max-w-[65%]">
          <div
            {...pressHandlers}
            className={`select-none rounded-2xl px-4 py-2.5 ${fontClassName} ${
              isMedia ? 'overflow-hidden p-1.5' : ''
            } ${bubbleClassName}`}
            style={bubbleStyle}
          >
            {message.replyTo && (
              <div
                className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 font-body text-xs ${
                  isOwn ? 'border-paper/60 bg-white/15 text-paper/90' : 'border-rose bg-blush-soft/50 text-ink-soft'
                }`}
              >
                <p className="font-medium">{message.replyTo.senderName}</p>
                <p className="truncate">{message.replyTo.text}</p>
              </div>
            )}
            {message.type === 'image' ? (
              <img src={message.imageDataUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />
            ) : message.type === 'link' ? (
              <a href={message.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-white">
                {message.previewImage && (
                  <img src={message.previewImage} alt="" className="max-h-48 w-full object-cover" />
                )}
                <div className="p-2.5">
                  <p className="font-body text-sm font-medium text-ink">{message.previewTitle || message.url}</p>
                  {message.previewDomain && (
                    <p className="mt-0.5 font-body text-xs text-ink-soft">{message.previewDomain}</p>
                  )}
                  {message.caption && <p className="mt-1.5 font-body text-sm text-ink">{message.caption}</p>}
                </div>
              </a>
            ) : (
              message.text
            )}
          </div>
          {reactionEmojis.length > 0 && (
            <div className={`absolute -bottom-2.5 flex gap-0.5 ${isOwn ? 'right-2' : 'left-2'}`}>
              {reactionEmojis.map((emoji) => (
                <span
                  key={emoji}
                  className="rounded-full border border-ink/10 bg-paper px-1 text-xs shadow-sm"
                >
                  {emoji}
                </span>
              ))}
            </div>
          )}
        </div>
        {!tight && (
          <span className={`flex items-center gap-1 px-1 text-xs text-ink-soft/70 ${reactionEmojis.length > 0 ? 'mt-3' : 'mt-1'}`}>
            {time}
            {isOwn && <ReadReceipt read={read} />}
          </span>
        )}
      </div>
    </div>
  )
}

function ReadReceipt({ read }) {
  return (
    <svg
      viewBox="0 0 20 12"
      className={`h-3 w-4 ${read ? 'text-rose' : 'text-ink-soft/50'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={read ? 'Read' : 'Delivered'}
    >
      <path d="M1 6.5l3 3 6-7" />
      {read && <path d="M8 6.5l3 3 7-8" />}
    </svg>
  )
}
