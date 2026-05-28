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

export async function uploadImageToImgBB(file: File): Promise<string> {
  const imgbbKey = localStorage.getItem(LS_IMGBB_KEY)
  if (!imgbbKey) throw new Error("ImgBB API key not configured")

  const base64Data = await fileToBase64(file)

  const formData = new URLSearchParams()
  formData.append("image", base64Data)

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? payload?.error ?? "Upload failed")
  }

  const imageUrl = payload.data?.url
  if (!imageUrl) throw new Error("Upload succeeded without an image URL")

  return imageUrl as string
}
