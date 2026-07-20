// Each story is filled in blind by both of us separately (classic Mad Libs
// mechanic — you only see the blank prompts, never the template), then both
// completed versions are revealed together for comparison. `template` turns
// a finished `{ [blankId]: word }` answers map into the final story string.
export const MAD_LIBS_LIBRARY = [
  {
    id: 'date-night-disaster',
    title: 'Date Night Disaster',
    blanks: [
      { id: 'adjective1', label: 'An adjective' },
      { id: 'restaurant', label: 'A made-up restaurant name' },
      { id: 'food', label: 'A food' },
      { id: 'number1', label: 'A number' },
      { id: 'animal', label: 'An animal' },
      { id: 'verbIng', label: 'A verb ending in -ing' },
      { id: 'bodyPart', label: 'A body part' },
      { id: 'exclamation', label: 'An exclamation' },
      { id: 'adjective2', label: 'Another adjective' },
    ],
    template: (a) =>
      `Our date night started at a ${a.adjective1} little place called "${a.restaurant}." I ordered the ${a.food}, but when it arrived, ${a.number1} tiny ${a.animal}s were ${a.verbIng} on the plate! I screamed and grabbed my ${a.bodyPart}. "${a.exclamation}!" you shouted, laughing so hard you nearly fell off your chair. Somehow it turned into the most ${a.adjective2} date we've ever had.`,
  },
  {
    id: 'our-future-home',
    title: 'Our Future Home',
    blanks: [
      { id: 'roomType', label: 'A room in a house' },
      { id: 'color', label: 'A color' },
      { id: 'number1', label: 'A number' },
      { id: 'animal', label: 'An animal' },
      { id: 'verb', label: 'A verb' },
      { id: 'food', label: 'A food' },
      { id: 'adjective1', label: 'An adjective' },
      { id: 'place', label: 'A place' },
      { id: 'adjective2', label: 'Another adjective' },
    ],
    template: (a) =>
      `In our dream house, the ${a.roomType} is painted ${a.color} and has ${a.number1} pet ${a.animal}s running around. Every morning we ${a.verb} together in the kitchen before making ${a.food}. The whole house feels ${a.adjective1}, and the backyard looks out over ${a.place}. Honestly? It's ${a.adjective2}.`,
  },
  {
    id: 'the-road-trip',
    title: 'The Road Trip',
    blanks: [
      { id: 'place1', label: 'A place' },
      { id: 'number1', label: 'A number' },
      { id: 'food', label: 'A food' },
      { id: 'verbIng', label: 'A verb ending in -ing' },
      { id: 'animal', label: 'An animal' },
      { id: 'exclamation', label: 'An exclamation' },
      { id: 'bodyPart', label: 'A body part' },
      { id: 'adjective1', label: 'An adjective' },
      { id: 'place2', label: 'Another place' },
    ],
    template: (a) =>
      `We set off for ${a.place1} with ${a.number1} bags of ${a.food} in the back seat. Somewhere around mile 50, the car started ${a.verbIng} and a ${a.animal} ran across the road. "${a.exclamation}!" I yelled, grabbing your ${a.bodyPart}. It was ${a.adjective1}, but somehow we still made it to ${a.place2} in one piece.`,
  },
  {
    id: 'anniversary-surprise',
    title: 'Anniversary Surprise',
    blanks: [
      { id: 'adjective1', label: 'An adjective' },
      { id: 'place', label: 'A place' },
      { id: 'number1', label: 'A number' },
      { id: 'object', label: 'An object' },
      { id: 'verbIng', label: 'A verb ending in -ing' },
      { id: 'animal', label: 'An animal' },
      { id: 'exclamation', label: 'An exclamation' },
      { id: 'adjective2', label: 'Another adjective' },
      { id: 'food', label: 'A food' },
    ],
    template: (a) =>
      `For our anniversary, you planned a ${a.adjective1} surprise at ${a.place}. When I walked in, ${a.number1} ${a.object}s were ${a.verbIng} everywhere, and somehow a ${a.animal} was involved too. "${a.exclamation}!" I said, completely stunned. We ended the night ${a.adjective2}, sharing a plate of ${a.food} and laughing about how only we could pull off a night like that.`,
  },
  {
    id: 'a-day-in-our-life',
    title: 'A Day in Our Life',
    blanks: [
      { id: 'verb1', label: 'A verb' },
      { id: 'number1', label: 'A number' },
      { id: 'animal', label: 'An animal' },
      { id: 'adjective1', label: 'An adjective' },
      { id: 'food', label: 'A food' },
      { id: 'place', label: 'A place' },
      { id: 'verbIng', label: 'A verb ending in -ing' },
      { id: 'exclamation', label: 'An exclamation' },
      { id: 'adjective2', label: 'Another adjective' },
    ],
    template: (a) =>
      `A perfect day with you starts when we ${a.verb1} at some ungodly hour, usually because ${a.number1} ${a.animal}s are making noise outside. We're both ${a.adjective1}, so of course breakfast is ${a.food}. Later we head to ${a.place}, where we spend the afternoon ${a.verbIng} until one of us yells "${a.exclamation}!" By the end of the day, I'm just ${a.adjective2} to be doing life with you.`,
  },
]

export function madLibById(id) {
  return MAD_LIBS_LIBRARY.find((story) => story.id === id) || null
}
