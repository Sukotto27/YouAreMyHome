import { useEffect, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db, firebaseReady } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { buildTimeline, toDate } from '../lib/chatGrouping'
import { resizeImageFile } from '../lib/image'
import { readDemoList, writeDemoList } from '../lib/demoStore'
import {
  CHAT_BACKGROUNDS,
  DEFAULT_CHAT_BACKGROUND,
  getSavedChatBackground,
  saveChatBackground,
} from '../lib/chatBackgrounds'
import BackgroundPicker from '../components/chat/BackgroundPicker'
import EmojiPicker from '../components/chat/EmojiPicker'
import { useLongPress } from '../hooks/useLongPress'
import { useMarkSeen } from '../hooks/useMarkSeen'

const RECENT_LIMIT = 200

export default function Chat() {
  const { user } = useAuth()
  useMarkSeen('chat')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [background, setBackground] = useState(getSavedChatBackground)
  const [pickingBackground, setPickingBackground] = useState(false)
  const [pickingEmoji, setPickingEmoji] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const imageInputRef = useRef(null)

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

  function handleBackgroundSelect(id) {
    setBackground(id)
    saveChatBackground(id)
  }

  function insertEmoji(emoji) {
    setDraft((prev) => prev + emoji)
    inputRef.current?.focus()
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

    setSending(true)
    setDraft('')
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

  const backgroundStyle =
    CHAT_BACKGROUNDS.find((bg) => bg.id === background)?.style ??
    CHAT_BACKGROUNDS.find((bg) => bg.id === DEFAULT_CHAT_BACKGROUND).style
  const timeline = buildTimeline(messages)

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="absolute right-4 top-3 z-10 flex items-center gap-2 sm:right-6">
        <button
          type="button"
          onClick={handleExportHistory}
          aria-label="Download chat history"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 19h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setPickingBackground((v) => !v)}
          aria-label="Change chat background"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink-soft transition-colors hover:text-rose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="M3.5 16.5l4.5-4.5 3.5 3.5 3-3 5 5" />
          </svg>
        </button>
      </div>
      {pickingBackground && (
        <BackgroundPicker
          current={background}
          onSelect={handleBackgroundSelect}
          onClose={() => setPickingBackground(false)}
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
              onReply={() => setReplyingTo(item.message)}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>

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
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-full border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-full bg-rose px-5 py-2.5 font-body font-medium text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message, isOwn, tight, onReply }) {
  const time = toDate(message.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const pressHandlers = useLongPress(onReply)

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${tight ? 'mb-0.5' : 'mb-2'}`}>
      <div
        {...pressHandlers}
        className={`max-w-[80%] select-none rounded-2xl px-4 py-2.5 font-body sm:max-w-[65%] ${
          message.type === 'image' ? 'overflow-hidden p-1.5' : ''
        } ${
          isOwn
            ? message.type === 'image'
              ? 'rounded-br-sm bg-rose/20'
              : 'rounded-br-sm bg-rose text-paper'
            : message.type === 'image'
              ? 'rounded-bl-sm border border-teal/30 bg-white/70'
              : 'rounded-bl-sm border border-teal/30 bg-white/70 text-ink'
        }`}
        style={{ WebkitTouchCallout: 'none' }}
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
        ) : (
          message.text
        )}
      </div>
      {!tight && <span className="mt-1 px-1 text-xs text-ink-soft/70">{time}</span>}
    </div>
  )
}
