import { DomainResult, fail, ok } from '../../../core/utils/result';
import { PlayerPhotoRef } from '../../../shared/models/player-profile';

export const PLAYER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PLAYER_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function validatePlayerPhoto(
  blob: Blob,
): Promise<DomainResult<PlayerPhotoRef['mimeType']>> {
  if (!blob.size) return fail('El archivo de imagen está vacío.');
  if (blob.size > PLAYER_PHOTO_MAX_BYTES) return fail('La foto no puede superar los 5 MB.');
  if (!PLAYER_PHOTO_MIME_TYPES.includes(blob.type as PlayerPhotoRef['mimeType'])) {
    return fail('Selecciona una imagen JPEG, PNG o WebP.');
  }
  try {
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (!hasSignature(bytes, blob.type)) return fail('El archivo no contiene una imagen válida.');
  } catch {
    return fail('No se ha podido leer el archivo de imagen.');
  }
  return ok(blob.type as PlayerPhotoRef['mimeType']);
}

function hasSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png')
    return bytes
      .slice(0, 8)
      .every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  return (
    bytes[0] === 82 &&
    bytes[1] === 73 &&
    bytes[2] === 70 &&
    bytes[3] === 70 &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  );
}
