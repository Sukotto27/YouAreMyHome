// Lazily loads the Bananagrams dictionary the first time it's needed, so the
// ~330 KB of text lives in its own chunk and is only downloaded when
// Bananagrams is actually opened.
//
// The list is the public-domain ENABLE Scrabble list (173k words) filtered
// down to everyday words: 4+ letter words must appear at least 250,000 times
// in Google's web-corpus counts (Norvig's count_1w.txt), the 3-letter words
// are the 400 most common minus abbreviations and names, and the 2-letter
// words are a hand-picked set of ordinary ones. That drops obscure
// Scrabble-only words like "qi", "aa" and "colchicine".
let wordsPromise = null

export function loadWords() {
  if (!wordsPromise) {
    wordsPromise = import('../assets/words/common.txt?raw').then(
      (module) => new Set(module.default.split(/\r?\n/).filter(Boolean)),
    )
  }
  return wordsPromise
}

export function isValidWord(words, word) {
  return words.has(word.toLowerCase())
}
