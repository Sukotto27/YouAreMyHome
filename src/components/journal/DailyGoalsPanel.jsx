import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { GOAL_CATEGORIES } from '../../lib/dailyGoals'
import { useDailyGoals } from '../../hooks/useDailyGoals'

export default function DailyGoalsPanel() {
  const { user } = useAuth()
  const { myChecked, partnerChecked, toggleItem, addCustomItem, addGratitudeEntry, itemsForCategory } =
    useDailyGoals()
  const partnerName = user.displayName === 'Scott' ? 'Cristina' : 'Scott'

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg italic text-ink">Your day</h2>
        <div className="space-y-4">
          {GOAL_CATEGORIES.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              items={itemsForCategory(category.id, true)}
              checked={myChecked}
              interactive
              onToggle={(itemId) => toggleItem(category.id, itemId)}
              onAddCustom={(label) => addCustomItem(category.id, label)}
              onPromptSubmit={addGratitudeEntry}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg italic text-ink">{partnerName}'s day</h2>
        <div className="space-y-4">
          {GOAL_CATEGORIES.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              items={itemsForCategory(category.id, false)}
              checked={partnerChecked}
              interactive={false}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function CategorySection({ category, items, checked, interactive, onToggle, onAddCustom, onPromptSubmit }) {
  const [addingCustom, setAddingCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const checkedCount = items.filter((item) => checked[`${category.id}:${item.id}`]).length

  function submitCustom(event) {
    event.preventDefault()
    if (!customLabel.trim()) return
    onAddCustom(customLabel)
    setCustomLabel('')
    setAddingCustom(false)
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-body text-sm font-medium text-ink">{category.label}</p>
        <span className="font-body text-xs text-ink-soft">
          {checkedCount}/{items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const key = `${category.id}:${item.id}`
          const isChecked = !!checked[key]
          if (item.prompt) {
            return (
              <PromptItem
                key={item.id}
                label={item.label}
                checked={isChecked}
                interactive={interactive}
                onSubmit={onPromptSubmit}
              />
            )
          }
          return (
            <label
              key={item.id}
              className={`flex items-center gap-2 font-body text-sm ${
                interactive ? 'cursor-pointer text-ink' : 'text-ink-soft'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={!interactive}
                onChange={() => interactive && onToggle(item.id)}
              />
              <span className={isChecked ? 'text-ink-soft line-through' : ''}>{item.label}</span>
            </label>
          )
        })}
      </div>
      {interactive && (
        <div className="mt-2">
          {addingCustom ? (
            <form onSubmit={submitCustom} className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder="Add your own..."
                className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-2.5 py-1 font-body text-xs text-ink outline-none focus:border-rose"
              />
              <button
                type="submit"
                disabled={!customLabel.trim()}
                className="shrink-0 rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingCustom(false)}
                className="shrink-0 font-body text-xs text-ink-soft"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="font-body text-xs text-ink-soft hover:text-rose"
            >
              + add custom
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// A "prompt" item (currently just Daily Gratitude) opens a text form instead
// of being a plain checkbox — you can add more than one per day, each one
// posts its own Journal Timeline entry, so the affordance to add another
// stays available even once checked.
function PromptItem({ label, checked, interactive, onSubmit }) {
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!text.trim()) return
    onSubmit(text)
    setText('')
    setWriting(false)
  }

  return (
    <div className="font-body text-sm">
      <div className={`flex items-center gap-2 ${checked ? 'text-ink-soft' : interactive ? 'text-ink' : 'text-ink-soft'}`}>
        <span>{checked ? '🙏✓' : '🙏'}</span>
        <span>{label}</span>
        {interactive && !writing && (
          <button type="button" onClick={() => setWriting(true)} className="font-body text-xs text-rose hover:text-ink">
            {checked ? '+ add more' : 'add'}
          </button>
        )}
      </div>
      {writing && (
        <form onSubmit={handleSubmit} className="mt-1.5 flex gap-1">
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What are you grateful for today?"
            className="min-w-0 flex-1 rounded-full border border-ink/15 bg-white/70 px-2.5 py-1 font-body text-xs text-ink outline-none focus:border-rose"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="shrink-0 rounded-full bg-rose px-3 py-1 font-body text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
          <button type="button" onClick={() => setWriting(false)} className="shrink-0 font-body text-xs text-ink-soft">
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
