const GAMES = ['Age of Sigmar', '40k']

const FACTIONS_BY_GAME = {
  'Age of Sigmar': ['Stormcast', 'Seraphon'],
  '40k': ['Space Marines', 'Tyranids'],
}

const PACKAGES = ['Test Army Alpha', 'Test Army Beta']

export function getMockGames() {
  return GAMES
}

export function getMockFactionsByGame(gameName) {
  return FACTIONS_BY_GAME[gameName] || []
}

export function getMockPackages() {
  return PACKAGES
}
