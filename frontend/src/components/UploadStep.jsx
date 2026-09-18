import { useState } from 'react'
import { uploadVideo } from '../api'

export default function UploadStep({ onUploaded }) {
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file) {
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

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <label
      htmlFor="clip-input"
      className={`upload-dropzone${dragging ? ' upload-dropzone--dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        id="clip-input"
        type="file"
        accept="video/*"
        onChange={(e) => handleFile(e.target.files[0])}
        disabled={uploading}
      />
      {uploading ? (
        <span className="spinner spinner--lg" aria-hidden="true" />
      ) : (
        <span className="upload-dropzone__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <p className="upload-dropzone__title">
        {uploading ? 'Uploading your video…' : 'Drop a video here'}
      </p>
      {!uploading && (
        <p className="upload-dropzone__subtitle">
          or click to browse — MP4, MOV, AVI, MKV
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </label>
  )
}
