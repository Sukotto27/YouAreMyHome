// The network side of online co-op in Doors, over Realtime Database.
//
// The HOST's device runs the real simulation. The guest sends its inputs (and
// the odd command: a drawn stroke, "next room"...) and mirrors the host's state,
// which the host publishes ~15 times a second, one string per top-level key of
// the game and only the keys that changed. The guest also simulates locally so
// its own character reacts instantly (see index.js for how the two are merged).
//
//   doors/match                the lobby's record of who plays which character
//   doors/state/{key}          the host's game state, JSON per key (+ hb: a heartbeat)
//   doors/input/{uid}          one player's current input mask (+ a counter)
//   doors/cmds/{pushId}        guest -> host one-off commands
import { get, onChildAdded, onValue, push, ref, remove, set, update } from 'firebase/database'
import { rtdb } from '../firebase'

export async function fetchState() {
  const snap = await get(ref(rtdb, 'doors/state'))
  return snap.val()
}

export function createCoopNet({ uid, partnerUid, isHost }) {
  const offs = []
  let remote = { mask: 0, at: performance.now() }
  let commandHandler = null
  let stateHandler = null
  let seq = 0

  if (isHost) {
    offs.push(
      onValue(ref(rtdb, `doors/input/${partnerUid}`), (snap) => {
        const value = snap.val()
        if (value) remote = { mask: value.m | 0, at: performance.now() }
      }),
    )
    offs.push(
      onChildAdded(ref(rtdb, 'doors/cmds'), (snap) => {
        const command = snap.val()
        remove(snap.ref).catch(() => {})
        if (command && command.from === partnerUid) commandHandler?.(command)
      }),
    )
  } else {
    offs.push(onValue(ref(rtdb, 'doors/state'), (snap) => stateHandler?.(snap.val() || {})))
  }

  return {
    // host: the guest's latest input, and when it last arrived
    remote: () => remote,
    onCommand(handler) {
      commandHandler = handler
    },
    onState(handler) {
      stateHandler = handler
    },
    sendInput(mask) {
      set(ref(rtdb, `doors/input/${uid}`), { m: mask, n: ++seq }).catch(() => {})
    },
    sendCommand(command) {
      push(ref(rtdb, 'doors/cmds'), { ...command, from: uid }).catch(() => {})
    },
    publish(changed) {
      update(ref(rtdb, 'doors/state'), changed).catch(() => {})
    },
    dispose() {
      offs.forEach((off) => off())
    },
  }
}
