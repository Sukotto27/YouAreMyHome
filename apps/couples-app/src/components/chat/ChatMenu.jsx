import ChatCustomizationPanel from './ChatCustomizationPanel'

// Quick in-chat access to background/color/font (see ChatCustomizationPanel
// for the shared implementation, also used by the full Settings page) plus
// the chat-specific history export action.
export default function ChatMenu({ settings, onUpdateSettings, onExportHistory, onClose, cryptoKey }) {
  return (
    <div className="absolute right-4 top-14 z-20 w-80 rounded-2xl border border-ink/10 bg-paper p-3 shadow-lg sm:right-6">
      <ChatCustomizationPanel settings={settings} onUpdateSettings={onUpdateSettings} cryptoKey={cryptoKey} />

      <hr className="my-3 border-ink/10" />

      <button
        type="button"
        onClick={() => {
          onExportHistory()
          onClose()
        }}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 font-body text-sm text-ink-soft transition-colors hover:text-rose"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
        Download chat history
      </button>
    </div>
  )
}
