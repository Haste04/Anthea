export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a photo smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not prepare this photo.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .82);
    if (data.length > 2_800_000) throw new Error('This photo is too large. Try a smaller image.');
    return data;
  } finally { bitmap.close(); }
}
