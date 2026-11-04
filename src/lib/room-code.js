/**
 * Canonical room-code boundary helper.
 *
 * Room codes are generated as six uppercase alphanumerics. Every HTTP route
 * and every Socket.IO handler must go through this function so that a link
 * typed in lowercase (or pasted with whitespace) resolves to the same room.
 *
 * Non-strings and blank strings return "" so callers can treat them as
 * "no room code" without throwing.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonicalizeRoomCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

module.exports = { canonicalizeRoomCode };
