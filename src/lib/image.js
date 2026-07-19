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
