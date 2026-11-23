// The one place that decides "which of the two of us is this?" — every game
// label, push body and in-app notification used to repeat its own inline
// `user.displayName === 'Cristina' ? ... : ...` check, and the copies
// disagreed (some defaulted unknown names to Scott, others to Cristina), so a
// name that wasn't exactly 'Scott'/'Cristina' made the two of us swap places
// between screens. Matching loosely on displayName, then email, and always
// falling back the same way keeps every screen in agreement.
export function myNameFor(user) {
  const source = `${user?.displayName || ''} ${user?.email || ''}`
  if (/cristina/i.test(source)) return 'Cristina'
  return 'Scott'
}

export function partnerNameFor(user) {
  return myNameFor(user) === 'Scott' ? 'Cristina' : 'Scott'
}
