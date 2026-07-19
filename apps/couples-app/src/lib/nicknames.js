const NICKNAMES = [
  { match: /scott/i, nickname: 'meu pôr do sol' },
  { match: /cristina/i, nickname: 'minha estrela distante' },
]

export function nicknameFor(user) {
  const name = user?.displayName || user?.email || ''
  const found = NICKNAMES.find((entry) => entry.match.test(name))
  return found?.nickname ?? null
}
