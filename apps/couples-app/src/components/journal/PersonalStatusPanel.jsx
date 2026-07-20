import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCheckIn } from '../../hooks/useCheckIn'
import { MOOD_PRESETS } from '../../lib/moodPresets'

const FIELDS = [
  { key: 'mind', label: "What's on your mind right now?", placeholder: "Whatever's floating around up there..." },
  { key: 'stress', label: "What's stressing you out right now?", placeholder: 'Big or small, let it out...' },
  { key: 'gratitude', label: "Something you're grateful for...", placeholder: 'A person, a moment, anything...' },
  { key: 'doingNow', label: 'What are you doing right now?', placeholder: 'Right this very minute...' },
]

const EMPTY_FIELDS = { mind: '', stress: '', gratitude: '', doingNow: '' }

// The Journal's daily check-in — reuses the same mood presets as the Home
// page's MoodBubble, plus a few free-text well-being prompts. One doc per
// person per day (see hooks/useCheckIn.js), so re-opening this after already
// checking in today pre-fills the form for editing instead of starting blank.
export default function PersonalStatusPanel() {
  const { user } = useAuth()
  const { myCheckIn, partnerCheckIn, submitCheckIn } = useCheckIn()
  const [mood, setMood] = useState(null)
  const [customMood, setCustomMood] = useState('')
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [saved, setSaved] = useState(false)
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  useEffect(() => {
    if (!myCheckIn) return
    setMood(myCheckIn.mood ?? null)
    setFields({
      mind: myCheckIn.mind || '',
      stress: myCheckIn.stress || '',
      gratitude: myCheckIn.gratitude || '',
      doingNow: myCheckIn.doingNow || '',
    })
  }, [myCheckIn])

  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function chooseMood(emoji, label) {
    setMood({ emoji, label })
    setCustomMood('')
    setSaved(false)
  }

  function submitCustomMood(event) {
    event.preventDefault()
    const label = customMood.trim()
    if (!label) return
    setMood({ emoji: '💬', label })
    setCustomMood('')
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    await submitCheckIn({ mood, ...fields })
    setSaved(true)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink/10 bg-white/50 p-4">
        <h2 className="mb-1 font-display text-lg italic text-ink">Your check-in</h2>
        <p className="mb-4 font-body text-xs text-ink-soft">
          {myCheckIn ? "You've already checked in today — feel free to update it." : 'Take a minute for yourself today.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 font-body text-sm font-medium text-ink">How are you feeling?</p>
            <div className="grid grid-cols-5 gap-1">
              {MOOD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => chooseMood(preset.emoji, preset.label)}
                  title={preset.label}
                  className={`rounded-lg py-1.5 text-xl transition-transform hover:scale-110 ${
                    mood?.label === preset.label ? 'bg-blush-soft ring-1 ring-rose' : ''
                  }`}
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={customMood}
                onChange={(event) => setCustomMood(event.target.value)}
                placeholder="or write your own..."
                className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-2.5 py-1 font-body text-xs text-ink outline-none focus:border-rose"
              />
              <button
                type="button"
                onClick={submitCustomMood}
                disabled={!customMood.trim()}
                className="shrink-0 rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                Set
              </button>
            </div>
            {mood && (
              <p className="mt-2 font-body text-xs text-ink-soft">
                Feeling: {mood.emoji} {mood.label}
              </p>
            )}
          </div>

          {FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block font-body text-sm font-medium text-ink">{field.label}</span>
              <textarea
                value={fields[field.key]}
                onChange={(event) => updateField(field.key, event.target.value)}
                placeholder={field.placeholder}
                rows={2}
                className="w-full resize-none rounded-xl border border-ink/15 bg-white/70 px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose"
              />
            </label>
          ))}

          <button
            type="submit"
            className="w-full rounded-full bg-rose px-4 py-2 font-body text-sm font-medium text-paper shadow-[0_8px_20px_-8px_rgba(226,125,122,0.7)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            {myCheckIn ? 'Update check-in' : 'Save check-in'}
          </button>
          {saved && <p className="text-center font-body text-xs text-ink-soft">Saved ✓</p>}
        </form>
      </section>

      {partnerCheckIn && (
        <section className="rounded-2xl border border-ink/10 bg-white/50 p-4">
          <h2 className="mb-3 font-display text-lg italic text-ink">{partnerName}'s check-in</h2>
          <div className="space-y-3">
            {partnerCheckIn.mood && (
              <p className="font-body text-sm text-ink-soft">
                Feeling: {partnerCheckIn.mood.emoji} {partnerCheckIn.mood.label}
              </p>
            )}
            {FIELDS.map(
              (field) =>
                partnerCheckIn[field.key] && (
                  <div key={field.key}>
                    <p className="font-body text-xs font-medium text-rose">{field.label}</p>
                    <p className="whitespace-pre-wrap font-body text-sm text-ink">{partnerCheckIn[field.key]}</p>
                  </div>
                ),
            )}
          </div>
        </section>
      )}
    </div>
  )
}
