import { useState } from 'react'
import { uploadVideo } from '../api'

export default function UploadStep({ onUploaded }) {
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function handleChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const data = await uploadVideo(file)
      onUploaded(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload-step">
      <label htmlFor="clip-input">Upload a clip</label>
      <input
        id="clip-input"
        type="file"
        accept="video/*"
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading && <p role="status">Uploading…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
