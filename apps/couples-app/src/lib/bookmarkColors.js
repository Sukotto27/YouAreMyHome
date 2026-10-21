// Chat bookmark banner colors. Each bookmark stores the palette *index* it
// was given when added (see hooks/useChatBookmarks.js), so a banner keeps its
// color even after other bookmarks are removed.
export const BOOKMARK_COLORS = [
  '#d6567a', // rose
  '#2f9e8f', // teal
  '#e0a030', // amber
  '#7c5cc4', // violet
  '#4a90d9', // blue
  '#6aa84f', // green
  '#e8743b', // orange
  '#8a6d5a', // cocoa
]

export function bookmarkColor(index) {
  return BOOKMARK_COLORS[(Number.isInteger(index) ? index : 0) % BOOKMARK_COLORS.length]
}

// First palette color not already used by an existing bookmark, so a new one
// always looks different from the rest; once every color is taken it just
// cycles by count.
export function nextBookmarkColorIndex(bookmarks) {
  const used = new Set(Object.values(bookmarks).map((entry) => entry?.color))
  for (let i = 0; i < BOOKMARK_COLORS.length; i++) {
    if (!used.has(i)) return i
  }
  return Object.keys(bookmarks).length % BOOKMARK_COLORS.length
}
