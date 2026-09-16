const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const uuidPattern = new RegExp(`^${UUID}$`);
const pathPattern = new RegExp(`^teams/(${UUID})/players/(${UUID})/(profile(?:-${UUID})?)$`);

export interface PlayerPhotoPath {
  teamId: string;
  playerId: string;
}

export function buildPlayerPhotoPath(teamId: string, playerId: string, photoId: string): string {
  if (!uuidPattern.test(teamId))
    throw new Error('El identificador del equipo no es válido para la foto.');
  if (!uuidPattern.test(playerId))
    throw new Error('El identificador del jugador no es válido para la foto.');
  if (!uuidPattern.test(photoId)) throw new Error('El identificador de la foto no es válido.');
  return `teams/${teamId}/players/${playerId}/profile-${photoId}`;
}

export function parsePlayerPhotoPath(value: string): PlayerPhotoPath | null {
  const match = pathPattern.exec(value);
  return match ? { teamId: match[1]!, playerId: match[2]! } : null;
}
