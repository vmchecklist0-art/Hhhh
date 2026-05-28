export const LS_IMGBB_KEY = "app_imgbb_api_key"

/**
 * Convert File to base64 string (without data URI prefix)
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove "data:image/...;base64," prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Upload image to backend (which securely uploads to ImgBB)
 * This keeps the API key server-side only
 */
export async function uploadImageToImgBB(file: File): Promise<string> {
  const imgbbKey = localStorage.getItem(LS_IMGBB_KEY)
  if (!imgbbKey) throw new Error("ImgBB API key not configured")

  // Convert file to base64
  const base64Data = await fileToBase64(file)

  // Send as JSON with base64 data
  const response = await fetch(`/api/upload?key=${encodeURIComponent(imgbbKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: base64Data }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? payload?.error?.message ?? "Upload failed")
  }

  const imageUrl = payload.data?.url
  if (!imageUrl) {
    throw new Error("Upload succeeded without an image URL")
  }

  return imageUrl as string
}
