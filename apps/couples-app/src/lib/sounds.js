import chatSend from '../assets/sounds/chat_send.mp3'
import chatRead from '../assets/sounds/chat_read.mp3'
import newChat from '../assets/sounds/new_chat.mp3'
import notification from '../assets/sounds/notification.mp3'
import typing from '../assets/sounds/typing.mp3'
import bubble from '../assets/sounds/bubble.mp3'
import diceRoll from '../assets/sounds/dice_roll.mp3'
import { soundsEnabled } from './deviceSettings'

const SOUNDS = {
  chat_send: chatSend,
  chat_read: chatRead,
  new_chat: newChat,
  notification,
  typing,
  bubble,
  dice_roll: diceRoll,
}

const audioCache = {}

// Only for in-app feedback while the page is actually visible — when the
// app is backgrounded or closed, the service worker's push notification
// takes over instead, and that uses the phone's default tone (we never set
// a custom `sound` on it, and browsers don't support that anyway).
export function playSound(key) {
  if (document.visibilityState !== 'visible') return
  if (!soundsEnabled()) return
  const src = SOUNDS[key]
  if (!src) return

  let audio = audioCache[key]
  if (!audio) {
    audio = new Audio(src)
    audioCache[key] = audio
  } else {
    audio.currentTime = 0
  }
  audio.play().catch(() => {
    // Autoplay can be blocked before any user gesture has happened on the
    // page — safe to ignore, later gesture-triggered sounds unblock it.
  })
}
