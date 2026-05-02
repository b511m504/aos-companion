function normalizeUnit(u) {
  return {
    name: typeof u.name === "string" ? u.name.trim() : "",
    faction: typeof u.faction === "string" ? u.faction.trim() : "",
    warscroll: u.warscroll
  }
}

module.exports = { normalizeUnit }