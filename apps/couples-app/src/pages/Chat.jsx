import { useEffect, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
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
import { useNavigate } from 'react-router-dom'
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
import { decryptJson, encryptJson } from '../lib/e2ee'
import { downloadDataUrl } from '../lib/downloadImage'
import { autoDownloadImagesEnabled } from '../lib/deviceSettings'
import { useEncryptionKey } from '../hooks/useEncryptionKey'
import EncryptionGate from '../components/EncryptionGate'
import ChatMenu from '../components/chat/ChatMenu'
import EmojiPicker from '../components/chat/EmojiPicker'
import MessageActionMenu from '../components/chat/MessageActionMenu'
import SendImageModal from '../components/chat/SendImageModal'
import { useChatSettings } from '../hooks/useChatSettings'
import { useLongPress } from '../hooks/useLongPress'
import { useMarkSeen } from '../hooks/useMarkSeen'
import { usePartnerSeenAt } from '../hooks/usePartnerSeenAt'
import { useTypingIndicator } from '../hooks/useTypingIndicator'

const RECENT_LIMIT = 200
// Roughly 3 lines of the message textarea at this font size, plus its
// vertical padding — CSS `max-h` + `overflow-y-auto` cap growth beyond this,
// so no line-height math is needed to enforce the 3-line limit exactly.
const MAX_INPUT_HEIGHT = 84
const URL_PATTERN = /(https?:\/\/[^\s]+)/g
const VANISH_MS = 60_000
const AUTO_DOWNLOADED_KEY = 'you-are-my-home:auto-downloaded-image-ids'

function readAutoDownloadedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(AUTO_DOWNLOADED_KEY)) || [])
  } catch {
    return new Set()
  }
}

function rememberAutoDownloadedIds(ids) {
  try {
    // Cap so this can't grow unbounded over years of chat history.
    localStorage.setItem(AUTO_DOWNLOADED_KEY, JSON.stringify([...ids].slice(-500)))
  } catch {
    // storage full/unavailable — worst case a photo gets auto-downloaded
    // twice, which is harmless
  }
}

// Splits plain message text on URLs and turns those into real links —
// separate from the rich-preview `type: 'link'` messages the share-target
// flow creates, this just makes a URL typed/pasted mid-sentence tappable.
function renderMessageText(text) {
  const parts = text.split(URL_PATTERN)
  if (parts.length === 1) return text
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-inherit underline decoration-1 underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    ),
  )
}

// Messages/photos store their real content (text, image, link preview, and
// the quoted-reply snippet) as one `encryptedContent` blob — everything else
// on the doc (type, sender, timestamps, reactions, replyTo.{id,senderName})
// is plaintext structural metadata. Docs without `encryptedContent` are
// legacy pre-migration plaintext and pass through unchanged. `_locked` marks
// a doc that has encryptedContent but couldn't be decrypted (no key, or a
// key that doesn't match) — MessageBubble shows a placeholder for those.
async function decryptMessage(message, cryptoKey) {
  if (!message.encryptedContent) return message
  if (!cryptoKey) return { ...message, _locked: true }
  try {
    const content = await decryptJson(message.encryptedContent, cryptoKey)
    return {
      ...message,
      ...content,
      replyTo: message.replyTo ? { ...message.replyTo, text: content.replyText } : null,
    }
  } catch {
    return { ...message, _locked: true }
  }
}

export default function Chat() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { hasKey, cryptoKey, saveKey } = useEncryptionKey()
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
  const [editingMessage, setEditingMessage] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [pendingImage, setPendingImage] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [atBottom, setAtBottomState] = useState(true)
  const bottomRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const imageInputRef = useRef(null)
  const atBottomRef = useRef(true)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  function setAtBottom(value) {
    atBottomRef.current = value
    setAtBottomState(value)
  }

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
  const [messagesLoaded, setMessagesLoaded] = useState(!firebaseReady)
  // Both messages and partnerSeenAt load asynchronously, so myLastMessageRead
  // can already be true (partner read it a while ago) the moment data
  // arrives — that's not a new read event. Wait for both to load once and
  // use that as the baseline before comparing further changes.
  const settledRef = useRef(false)
  const prevReadRef = useRef(false)
  useEffect(() => {
    if (!settledRef.current) {
      if (messagesLoaded && partnerSeenAt) {
        settledRef.current = true
        prevReadRef.current = myLastMessageRead
      }
      return
    }
    if (myLastMessageRead && !prevReadRef.current) playSound('chat_read')
    prevReadRef.current = myLastMessageRead
  }, [myLastMessageRead, messagesLoaded, partnerSeenAt])

  useEffect(() => {
    if (!firebaseReady) return
    const messagesQuery = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_LIMIT),
    )
    // Keyed on cryptoKey so the moment a key becomes available (first setup,
    // or switching from none to one), this re-subscribes and redecrypts
    // everything currently in view instead of leaving it stuck as-loaded.
    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
      const raw = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse()
      const decrypted = await Promise.all(raw.map((message) => decryptMessage(message, cryptoKey)))
      setMessages(decrypted)
      setMessagesLoaded(true)
    })
    return unsubscribe
  }, [cryptoKey])

  // Deletes a vanishing image 1 minute after `viewedAt` is set (see
  // revealVanishingImage) — scheduled on whichever device(s) currently have
  // Chat open. If both devices are closed when the minute is up, whichever
  // one opens Chat next re-runs this and fires the overdue deletion
  // immediately (remaining <= 0), so nothing lingers forever. A scheduled
  // Cloud Function (expireVanishingImages) backstops this for the case
  // where neither device reopens Chat for a while.
  const vanishTimersRef = useRef({})
  useEffect(() => {
    const scheduled = vanishTimersRef.current
    for (const message of messages) {
      if (!message.vanishing || !message.viewedAt || scheduled[message.id]) continue
      const remaining = VANISH_MS - (Date.now() - toDate(message.viewedAt).getTime())
      scheduled[message.id] = setTimeout(() => {
        delete scheduled[message.id]
        if (firebaseReady) {
          deleteDoc(doc(db, 'messages', message.id)).catch(() => {})
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== message.id))
        }
      }, Math.max(0, remaining))
    }
    const stillPresent = new Set(messages.map((m) => m.id))
    for (const id of Object.keys(scheduled)) {
      if (!stillPresent.has(id)) {
        clearTimeout(scheduled[id])
        delete scheduled[id]
      }
    }
  }, [messages])

  useEffect(() => () => Object.values(vanishTimersRef.current).forEach(clearTimeout), [])

  // Auto-download is the recipient's own call (Settings → Photos in chat),
  // not something the sender sets per-image — checked fresh here since it
  // can change between snapshots. Fires once per message, the first time
  // it's seen (decrypted) on this device, regardless of vanishing status.
  // Tracked in localStorage (not just a ref) so a page reload doesn't
  // re-trigger it for messages from earlier sessions.
  const autoDownloadedRef = useRef(readAutoDownloadedIds())
  useEffect(() => {
    if (!autoDownloadImagesEnabled()) return
    const seen = autoDownloadedRef.current
    let changed = false
    for (const message of messages) {
      if (
        message.type === 'image' &&
        message.senderUid !== user.uid &&
        message.imageDataUrl &&
        !seen.has(message.id)
      ) {
        downloadDataUrl(message.imageDataUrl, `photo-${message.id}.jpg`)
        seen.add(message.id)
        changed = true
      }
    }
    if (changed) rememberAutoDownloadedIds(seen)
  }, [messages, user.uid])

  // Tracks whether the bottom sentinel is currently in view within the
  // scrolling message list — drives both the "jump to bottom" button and
  // whether a new message should auto-scroll (don't yank someone back down
  // if they've scrolled up to read history, unless it's their own message).
  // Keyed on hasKey — on first mount the encryption key is still loading
  // (async), so this page renders EncryptionGate instead of the real chat
  // UI and listRef/bottomRef don't exist yet. Without this dependency the
  // effect would bail out once on that first pass and never run again once
  // the real UI actually mounts.
  useEffect(() => {
    const list = listRef.current
    const sentinel = bottomRef.current
    if (!list || !sentinel) return
    const observer = new IntersectionObserver(([entry]) => setAtBottom(entry.isIntersecting), {
      root: list,
      threshold: 1,
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasKey])

  const prevMessageCountRef = useRef(0)
  useEffect(() => {
    const isNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (!isNewMessage) return
    const lastMessage = messages[messages.length - 1]
    const isMine = lastMessage?.senderUid === user.uid
    if (atBottomRef.current || isMine) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Registered by each MessageBubble so a reply snippet can scroll its
  // original message into view and briefly highlight it. Not a ref map
  // keyed once — messages re-render/re-key on every snapshot, so bubbles
  // register/unregister themselves as they mount and unmount.
  const messageElsRef = useRef({})
  const [highlightedId, setHighlightedId] = useState(null)
  const highlightTimerRef = useRef(null)

  function registerMessageEl(id, el) {
    if (el) messageElsRef.current[id] = el
    else delete messageElsRef.current[id]
  }

  function jumpToMessage(id) {
    const el = messageElsRef.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    clearTimeout(highlightTimerRef.current)
    setHighlightedId(id)
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 1500)
  }

  // Re-measures on every keystroke (and on emoji insertion, since that also
  // changes `draft` without going through the textarea's own onChange) —
  // resetting to 'auto' first lets scrollHeight shrink back down when text
  // is deleted, not just grow.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [draft])

  function insertEmoji(emoji) {
    setDraft((prev) => prev + emoji)
    inputRef.current?.focus()
  }

  function openMessageMenu(event, message) {
    setActiveMenu({ x: event.clientX, y: event.clientY, message })
  }

  // A reaction is treated like a new message for notification purposes —
  // only adding/changing one (not removing) bumps lastActivityAt/
  // lastActivityByUid, the same fields a new message sets. That's what the
  // 'chat' badge/push-notification pipeline watches (see useUnreadBadges.js
  // and functions/index.js), and what a new Cloud Function trigger
  // (notifyOnReaction) uses server-side to detect the change and push.
  async function toggleReaction(message, emoji) {
    const current = message.reactions?.[user.uid]
    const next = current === emoji ? null : emoji
    if (next) playSound('bubble')

    if (!firebaseReady) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m
          const reactions = { ...m.reactions }
          if (next) reactions[user.uid] = next
          else delete reactions[user.uid]
          return next ? { ...m, reactions, lastActivityAt: { toDate: () => new Date() }, lastActivityByUid: user.uid } : { ...m, reactions }
        }),
      )
      setActiveMenu(null)
      return
    }

    const updates = { [`reactions.${user.uid}`]: next ?? deleteField() }
    if (next) {
      updates.lastActivityAt = serverTimestamp()
      updates.lastActivityByUid = user.uid
    }
    await updateDoc(doc(db, 'messages', message.id), updates)
    setActiveMenu(null)
  }

  // Split in two: `replyTo` is plain structural metadata (kept outside the
  // encrypted blob so a bubble can render "replying to X" and jump-to-message
  // before anything is decrypted); `buildReplyText()` is the actual quoted
  // snippet, which now lives inside the new message's own encryptedContent
  // as `replyText` instead of being duplicated in plaintext on `replyTo`.
  function buildReplySnapshot() {
    if (!replyingTo) return null
    return { id: replyingTo.id, senderName: replyingTo.senderName }
  }

  function buildReplyText() {
    if (!replyingTo) return undefined
    return replyingTo.type === 'image' ? '📷 Photo' : replyingTo.text
  }

  function startEditing(message) {
    setEditingMessage(message)
    setReplyingTo(null)
    setDraft(message.text)
    setActiveMenu(null)
    inputRef.current?.focus()
  }

  function cancelEditing() {
    setEditingMessage(null)
    setDraft('')
  }

  async function handleSaveEdit() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      if (!firebaseReady) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id ? { ...m, text, editedAt: { toDate: () => new Date() } } : m,
          ),
        )
      } else {
        // Preserve the existing quoted-reply snippet (if any) across the
        // edit — it lives inside encryptedContent now, not on a plain
        // `text` field, so it must be re-supplied on every re-encryption.
        const replyText = editingMessage.replyTo?.text
        const encryptedContent = await encryptJson({ text, replyText }, cryptoKey)
        await updateDoc(doc(db, 'messages', editingMessage.id), {
          encryptedContent,
          editedAt: serverTimestamp(),
          text: deleteField(),
        })
      }
      setEditingMessage(null)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (editingMessage) {
      await handleSaveEdit()
      return
    }
    const text = draft.trim()
    if (!text || sending) return

    playSound('chat_send')
    setSending(true)
    setDraft('')
    stopTyping()
    const replyTo = buildReplySnapshot()
    const replyText = buildReplyText()
    setReplyingTo(null)

    if (!firebaseReady) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'text',
          text,
          replyTo: replyTo ? { ...replyTo, text: replyText } : null,
          senderUid: user.uid,
          senderName: user.displayName || user.email,
          createdAt: { toDate: () => new Date() },
          lastActivityAt: { toDate: () => new Date() },
          lastActivityByUid: user.uid,
        },
      ])
      setSending(false)
      return
    }

    try {
      const encryptedContent = await encryptJson({ text, replyText }, cryptoKey)
      await addDoc(collection(db, 'messages'), {
        type: 'text',
        encryptedContent,
        replyTo,
        senderUid: user.uid,
        senderName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastActivityByUid: user.uid,
      })
    } finally {
      setSending(false)
    }
  }

  // Picking a file just opens the options modal — the actual send (and the
  // reply snapshot, captured now so a reply started before picking still
  // applies) happens in confirmSendImage once permanent/vanishing and
  // auto-download are chosen.
  function handleImageSelect(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const replyTo = buildReplySnapshot()
    const replyText = buildReplyText()
    setReplyingTo(null)
    setPendingImage({ file, previewUrl: URL.createObjectURL(file), replyTo, replyText })
  }

  function cancelSendImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
    setPendingImage(null)
  }

  async function confirmSendImage({ vanishing }) {
    const { file, previewUrl, replyTo, replyText } = pendingImage
    setUploadingImage(true)
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
            replyTo: replyTo ? { ...replyTo, text: replyText } : null,
            vanishing,
            senderUid: user.uid,
            senderName,
            createdAt: { toDate: () => new Date() },
            lastActivityAt: { toDate: () => new Date() },
            lastActivityByUid: user.uid,
          },
        ])
        // Vanishing images never go in the shared gallery — a permanent
        // copy there would defeat the point.
        if (!vanishing) {
          const gallery = readDemoList('gallery')
          writeDemoList('gallery', [
            { id: crypto.randomUUID(), imageDataUrl, uploadedByName: senderName, createdAt: new Date().toISOString() },
            ...gallery,
          ])
        }
        return
      }

      const encryptedContent = await encryptJson({ imageDataUrl, replyText }, cryptoKey)
      await addDoc(collection(db, 'messages'), {
        type: 'image',
        encryptedContent,
        replyTo,
        vanishing,
        senderUid: user.uid,
        senderName,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        lastActivityByUid: user.uid,
      })
      if (!vanishing) {
        const encryptedImage = await encryptJson({ imageDataUrl }, cryptoKey)
        await addDoc(collection(db, 'gallery'), {
          encryptedImage,
          uploadedBy: user.uid,
          uploadedByName: senderName,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          lastActivityByUid: user.uid,
          commentCount: 0,
        })
      }
    } finally {
      URL.revokeObjectURL(previewUrl)
      setPendingImage(null)
      setUploadingImage(false)
    }
  }

  // Only the recipient tapping to reveal starts the 1-minute countdown —
  // the sender can already see what they sent, so isOwn is excluded at the
  // MessageBubble/VanishingImage level, not here.
  async function revealVanishingImage(message) {
    if (message.viewedAt) return
    if (!firebaseReady) {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, viewedAt: { toDate: () => new Date() } } : m)),
      )
      return
    }
    await updateDoc(doc(db, 'messages', message.id), { viewedAt: serverTimestamp() })
  }

  async function handleExportHistory() {
    let all = messages
    if (firebaseReady) {
      const snapshot = await getDocs(query(collection(db, 'messages'), orderBy('createdAt', 'asc')))
      const raw = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      all = await Promise.all(raw.map((message) => decryptMessage(message, cryptoKey)))
    }

    const lines = all.map((message) => {
      const stamp = toDate(message.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      const body = message._locked ? '[encrypted message — key unavailable]' : message.type === 'image' ? '[photo]' : message.text
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

  if (!hasKey) {
    return <EncryptionGate saveKey={saveKey} />
  }

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
          cryptoKey={cryptoKey}
        />
      )}

      {pendingImage && (
        <SendImageModal
          previewUrl={pendingImage.previewUrl}
          sending={uploadingImage}
          onCancel={cancelSendImage}
          onConfirm={confirmSendImage}
        />
      )}

      <div
        ref={listRef}
        className="relative flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6"
        style={backgroundStyle}
      >
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
              onRegister={registerMessageEl}
              onJumpToMessage={jumpToMessage}
              onRevealVanishing={revealVanishingImage}
              onOpenSettings={() => navigate('/settings')}
              onExpandImage={setLightboxImage}
              highlighted={highlightedId === item.message.id}
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

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to latest messages"
            className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-rose text-paper shadow-lg transition-transform hover:-translate-y-0.5 sm:right-6"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M12 5v14" />
              <path d="M5 12l7 7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {activeMenu && (
        <MessageActionMenu
          x={activeMenu.x}
          y={activeMenu.y}
          message={activeMenu.message}
          isOwn={activeMenu.message.senderUid === user.uid}
          onSelectReaction={(emoji) => toggleReaction(activeMenu.message, emoji)}
          onReply={() => {
            setEditingMessage(null)
            setReplyingTo(activeMenu.message)
            setActiveMenu(null)
          }}
          onEdit={() => startEditing(activeMenu.message)}
          onClose={() => setActiveMenu(null)}
        />
      )}

      {replyingTo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-ink/10 bg-blush-soft/40 px-4 py-2 sm:px-6">
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

      {editingMessage && (
        <div className="flex shrink-0 items-center gap-2 border-t border-ink/10 bg-blush-soft/40 px-4 py-2 sm:px-6">
          <div className="min-w-0 flex-1 border-l-2 border-rose pl-2">
            <p className="font-body text-xs font-medium text-rose">Editing message</p>
          </div>
          <button
            type="button"
            onClick={cancelEditing}
            aria-label="Cancel edit"
            className="shrink-0 font-body text-lg text-ink-soft hover:text-rose"
          >
            ×
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="relative flex shrink-0 items-end gap-2 border-t border-ink/10 bg-paper px-4 py-3 sm:px-6"
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
          disabled={uploadingImage || !!editingMessage || !!pendingImage}
          aria-label="Send a photo"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-rose disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="M3.5 16l4.5-4.5 3.5 3.5 3-3 5 5" />
          </svg>
        </button>
        {/* display:none (Tailwind's `hidden`) is enough on desktop, but some
        mobile browsers refuse to open the native file/camera picker for a
        programmatic .click() on an input that isn't actually rendered —
        this stays in the render tree, just invisible and 1px, which works
        reliably everywhere. */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="absolute h-px w-px overflow-hidden opacity-0"
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) notifyTyping()
          }}
          placeholder={editingMessage ? 'Edit your message...' : 'Type a message...'}
          style={{ maxHeight: `${MAX_INPUT_HEIGHT}px` }}
          className="flex-1 resize-none overflow-y-auto rounded-2xl border border-ink/15 bg-white/60 px-4 py-2.5 font-body text-ink outline-none transition-colors focus:border-rose"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label={editingMessage ? 'Save edit' : 'Send'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose text-paper transition-transform duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {editingMessage ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </form>

      <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  )
}

function ImageLightbox({ src, onClose }) {
  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/90 p-4"
      onClick={onClose}
    >
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(event) => event.stopPropagation()} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 font-body text-2xl text-paper transition-colors hover:bg-white/20"
      >
        ×
      </button>
    </div>
  )
}

function MessageBubble({
  message,
  isOwn,
  tight,
  onOpenMenu,
  chatSettings,
  onRegister,
  onJumpToMessage,
  onRevealVanishing,
  onOpenSettings,
  onExpandImage,
  highlighted,
  read,
}) {
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
    <div
      ref={(el) => onRegister(message.id, el)}
      className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${tight ? 'mb-0.5' : 'mb-2'}`}
    >
      <div className="h-6 w-6 shrink-0">
        {avatarSrc && !tight && (
          <img
            src={avatarSrc}
            alt=""
            onClick={isOwn ? onOpenSettings : undefined}
            className={`h-6 w-6 rounded-full object-cover ${isOwn ? 'cursor-pointer transition-transform hover:scale-110' : ''}`}
          />
        )}
      </div>
      <div className={`flex min-w-0 flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="relative max-w-[80%] sm:max-w-[65%]">
          <div
            {...pressHandlers}
            className={`select-none whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 transition-shadow duration-500 ${
              highlighted ? 'ring-2 ring-rose ring-offset-2 ring-offset-paper' : ''
            } ${fontClassName} ${isMedia ? 'overflow-hidden p-1.5' : ''} ${bubbleClassName}`}
            style={bubbleStyle}
          >
            {message.replyTo && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onJumpToMessage(message.replyTo.id)
                }}
                className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left font-body text-xs transition-colors ${
                  isOwn
                    ? 'border-paper/60 bg-white/15 text-paper/90 hover:bg-white/25'
                    : 'border-rose bg-blush-soft/50 text-ink-soft hover:bg-blush-soft'
                }`}
              >
                <p className="font-medium">{message.replyTo.senderName}</p>
                <p className="truncate">{message.replyTo.text}</p>
              </button>
            )}
            {message._locked ? (
              <p className="italic text-inherit opacity-80">🔒 Encrypted — couldn't unlock with this device's key</p>
            ) : message.type === 'image' && message.vanishing ? (
              <VanishingImage message={message} isOwn={isOwn} onReveal={onRevealVanishing} onExpand={onExpandImage} />
            ) : message.type === 'image' ? (
              <img
                src={message.imageDataUrl}
                alt=""
                onClick={() => onExpandImage(message.imageDataUrl)}
                className="max-h-72 w-full cursor-pointer rounded-xl object-cover transition-transform hover:scale-[1.01]"
              />
            ) : message.type === 'link' ? (
              <a href={message.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-white">
                {message.previewImage && (
                  <img src={message.previewImage} alt="" className="max-h-48 w-full object-cover" />
                )}
                <div className="min-w-0 p-2.5">
                  <p className="break-words font-body text-sm font-medium text-ink">{message.previewTitle || message.url}</p>
                  {message.previewDomain && (
                    <p className="mt-0.5 break-words font-body text-xs text-ink-soft">{message.previewDomain}</p>
                  )}
                  {message.caption && <p className="mt-1.5 break-words font-body text-sm text-ink">{message.caption}</p>}
                </div>
              </a>
            ) : (
              renderMessageText(message.text)
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
            {message.editedAt && <span className="italic">edited ·</span>}
            {time}
            {isOwn && <ReadReceipt read={read} />}
          </span>
        )}
      </div>
    </div>
  )
}

// Recipient sees a locked placeholder until they tap it (that tap is what
// starts the 1-minute countdown, via onReveal → revealVanishingImage). The
// sender can always see their own sent photo — isOwn skips the placeholder
// — but still sees the live countdown ring once the recipient opens it,
// since viewedAt syncs to both sides the same way any other field update
// does. The slight transparency and "Unopened" caption are sender-only —
// the recipient's own copy, once they've opened it, looks like any other
// photo (just with the countdown ring, which both of you see identically).
function VanishingImage({ message, isOwn, onReveal, onExpand }) {
  const viewed = !!message.viewedAt
  const revealed = isOwn || viewed
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!viewed) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [viewed])

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => onReveal(message)}
        className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-xl bg-ink/10 text-inherit transition-transform hover:scale-[1.02]"
      >
        <span className="text-2xl">⏳</span>
        <span className="font-body text-xs">Vanishing Image. Tap to view</span>
      </button>
    )
  }

  const remainingSeconds = viewed ? Math.max(0, 60 - Math.floor((now - toDate(message.viewedAt).getTime()) / 1000)) : null

  return (
    <div>
      <div className="relative">
        <img
          src={message.imageDataUrl}
          alt=""
          onClick={() => onExpand(message.imageDataUrl)}
          className={`max-h-72 w-full cursor-pointer rounded-xl object-cover transition-transform hover:scale-[1.01] ${
            isOwn ? 'opacity-80' : ''
          }`}
        />
        {viewed && (
          <div className="absolute bottom-1.5 right-1.5">
            <CircularCountdown remainingSeconds={remainingSeconds} />
          </div>
        )}
      </div>
      {!viewed && isOwn && (
        <p className="mt-1 text-center font-body text-[10px] italic text-inherit opacity-70">Unopened Vanishing Image.</p>
      )}
    </div>
  )
}

const COUNTDOWN_TOTAL_SECONDS = 60
const COUNTDOWN_RADIUS = 14
const COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RADIUS

function CircularCountdown({ remainingSeconds }) {
  const progress = remainingSeconds / COUNTDOWN_TOTAL_SECONDS
  const dashOffset = COUNTDOWN_CIRCUMFERENCE * (1 - progress)

  return (
    <div className="relative flex h-9 w-9 items-center justify-center" title={`Vanishes in ${remainingSeconds}s`}>
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
        <circle cx="18" cy="18" r={COUNTDOWN_RADIUS} className="fill-ink/50" />
        <circle
          cx="18"
          cy="18"
          r={COUNTDOWN_RADIUS}
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={COUNTDOWN_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="absolute font-body text-[10px] font-medium text-white">{remainingSeconds}</span>
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
