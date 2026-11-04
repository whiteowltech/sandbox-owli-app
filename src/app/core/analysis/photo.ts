// Compresión en el teléfono antes de subir (CLAUDE.md): menos datos, más rápido
// y más barato. La foto nunca se guarda: se sube, se analiza y se descarta.

const MAX_SIDE_PX = 1024;
const JPEG_QUALITY = 0.8;

/** Reduce la foto a ≤ 1024 px y la pasa a JPEG. Si no se puede decodificar, se envía tal cual. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // formato que el navegador no decodifica: que decida el servidor
  }
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  return blob ?? file;
}
