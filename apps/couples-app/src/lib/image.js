// Resize + re-encode an image file client-side so it fits comfortably inside
// a Firestore document (1MiB limit) instead of needing Cloud Storage.
export function resizeImageFile(file, { maxDimension = 1600, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension)
          width = maxDimension
        } else {
          width = Math.round((width / height) * maxDimension)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl)
      reject(error)
    }

    img.src = objectUrl
  })
}

// Shrinks an already-loaded image (e.g. a gallery photo, already up to
// 1600px) down to a small square crop — used when someone picks a gallery
// photo as their avatar, so it stays tiny inside the shared settings doc
// instead of duplicating the full-size photo there.
export function squareThumbnailFromUrl(url, { size = 128, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2

      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }

    img.onerror = reject
    img.src = url
  })
}
