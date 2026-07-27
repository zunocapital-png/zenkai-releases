type Glyph = [string, string, string, string]

const LETTERS: Record<string, Glyph> = {
  Z: ["▀▀▀▀", "  ▄▀", " ▄▀ ", "▀▀▀▀"],
  E: ["█▀▀▀", "█▀▀ ", "█   ", "█▀▀▀"],
  N: ["█  █", "█▄ █", "█ ▀█", "█  █"],
  K: ["█  █", "█▄▀ ", "█▀▄ ", "█  █"],
  A: [" ██ ", "█▀▀█", "████", "█  █"],
  I: ["████", " ██ ", " ██ ", "████"],
}

function word(letters: string): Glyph {
  const rows: [string[], string[], string[], string[]] = [[], [], [], []]
  for (const letter of letters) {
    const glyph = LETTERS[letter]
    rows.forEach((row, i) => row.push(glyph[i]))
  }
  return rows.map((row) => row.join(" ")) as Glyph
}

export const logo = {
  left: word("ZEN"),
  right: word("KAI"),
}

export const go = {
  left: LETTERS.Z,
  right: LETTERS.K,
}

export const marks = "_^~,"
