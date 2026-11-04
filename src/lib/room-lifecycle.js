/**
 * Room lifecycle rules shared by the Next.js store and the Socket.IO server.
 *
 * `server.js` cannot import TypeScript, so this module is plain CommonJS and
 * is required by both sides. Keeping the TTL and the deletion rule here means
 * the timer in `server.js` and the room-creation cleanup in the HTTP route
 * cannot drift apart.
 */

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Delete every room whose last activity is older than the TTL.
 *
 * @param {Map<string, { lastActivity?: number }>} rooms
 * @param {number} [now]
 * @returns {number} number of removed rooms
 */
function cleanupExpiredRooms(rooms, now = Date.now()) {
  let removed = 0;
  for (const [code, room] of rooms.entries()) {
    if (!room || typeof room.lastActivity !== "number") continue;
    if (now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(code);
      removed += 1;
    }
  }
  return removed;
}

module.exports = { ROOM_TTL_MS, cleanupExpiredRooms };
