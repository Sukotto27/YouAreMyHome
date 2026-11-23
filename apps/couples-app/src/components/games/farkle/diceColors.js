import white from '../../../assets/farkle/dice-pack/dice_white.png'
import red from '../../../assets/farkle/dice-pack/dice_red_color.png'
import blue from '../../../assets/farkle/dice-pack/dice_blue.png'
import navy from '../../../assets/farkle/dice-pack/dice_blueDark.png'
import green from '../../../assets/farkle/dice-pack/dice_green.png'
import orange from '../../../assets/farkle/dice-pack/dice_orange.png'
import purple from '../../../assets/farkle/dice-pack/dice_purple.png'
import yellow from '../../../assets/farkle/dice-pack/dice_yellow.png'
import black from '../../../assets/farkle/dice-pack/dice_black.png'

// The dice pack ships one texture per colour on the same model, so changing
// colour is just swapping the texture. `swatch` is only for the picker button.
export const DICE_COLORS = [
  { key: 'white', label: 'White', url: white, swatch: '#f4f1ea' },
  { key: 'red', label: 'Red', url: red, swatch: '#c93a31' },
  { key: 'orange', label: 'Orange', url: orange, swatch: '#ef8a25' },
  { key: 'yellow', label: 'Yellow', url: yellow, swatch: '#f1c232' },
  { key: 'green', label: 'Green', url: green, swatch: '#2f9e5b' },
  { key: 'blue', label: 'Blue', url: blue, swatch: '#3b82d6' },
  { key: 'navy', label: 'Navy', url: navy, swatch: '#1f3a8a' },
  { key: 'purple', label: 'Purple', url: purple, swatch: '#8a5cf0' },
  { key: 'black', label: 'Black', url: black, swatch: '#2a2a2a' },
]

export const DEFAULT_DICE_COLOR = 'white'
export const diceColorUrl = (key) => (DICE_COLORS.find((c) => c.key === key) || DICE_COLORS[0]).url
