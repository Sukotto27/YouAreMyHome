// Small regex-based Open Graph tag extractor — not a full HTML parser (no
// new dependency for it), matches this repo's existing "hand-roll small
// parsers" convention (see ics.js). Attribute order in a real <meta> tag
// varies (`property` before or after `content`), so the tag is matched as a
// whole first, then `content=` is pulled out of that matched substring.

function extractMetaTag(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagRegex = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  const match = html.match(tagRegex)
  if (!match) return null
  const contentMatch = match[0].match(/content=["']([^"']*)["']/i)
  return contentMatch ? decodeEntities(contentMatch[1]) : null
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? decodeEntities(match[1].trim()) : null
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

exports.extractOgTags = function extractOgTags(html, baseUrl) {
  const title = extractMetaTag(html, 'og:title') || extractTitleTag(html)
  const description = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description')
  let image = extractMetaTag(html, 'og:image')
  if (image) {
    try {
      image = new URL(image, baseUrl).href
    } catch {
      image = null
    }
  }
  return { title, description, image }
}
