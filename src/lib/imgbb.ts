const UPLOAD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imgbb-upload`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1])
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

export async function uploadImageToImgBB(file: File): Promise<string> {
  const base64Image = await fileToBase64(file)

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ image: base64Image, name: file.name }),
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.error ?? "Upload failed")
  }

  return payload.url as string
}
