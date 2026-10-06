"use client"

import * as React from "react"
import Image from "next/image"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utility"
import { UploadIcon, XIcon, FileIcon, ImageIcon, FileTextIcon } from "lucide-react"
import { Button } from "./button"

const fileUploadVariants = cva(
  "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
  {
    variants: {
      state: {
        idle: "border-muted-foreground/25 hover:border-muted-foreground/50",
        dragover: "border-primary bg-primary/5",
        uploading: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
        error: "border-red-500 bg-red-50 dark:bg-red-950/30",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  }
)

export interface FileUploadFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  preview?: string
  status: "pending" | "uploading" | "done" | "error"
  progress?: number
  error?: string
}

export interface FileUploadProps extends React.ComponentProps<"div">, VariantProps<typeof fileUploadVariants> {
  accept?: string
  multiple?: boolean
  maxSize?: number
  maxFiles?: number
  disabled?: boolean
  files?: FileUploadFile[]
  onFilesChange?: (files: FileUploadFile[]) => void
  onUpload?: (files: File[]) => Promise<void>
  showPreviews?: boolean
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="size-5" />
  if (type.includes("pdf") || type.includes("document")) return <FileTextIcon className="size-5" />
  return <FileIcon className="size-5" />
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function FileUpload({
  className,
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  disabled = false,
  files: controlledFiles,
  onFilesChange,
  showPreviews = true,
  state: controlledState,
  ...props
}: FileUploadProps) {
  const [internalFiles, setInternalFiles] = React.useState<FileUploadFile[]>([])
  const [dragState, setDragState] = React.useState<"idle" | "dragover">("idle")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const files = controlledFiles ?? internalFiles
  const state = controlledState ?? (dragState === "dragover" ? "dragover" : "idle")

  const addFiles = React.useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles)
      const currentCount = files.length

      const validFiles = fileArray
        .filter((file) => {
          if (maxFiles && currentCount + fileArray.indexOf(file) >= maxFiles) return false
          if (maxSize && file.size > maxSize) return false
          if (accept) {
            const acceptTypes = accept.split(",").map((t) => t.trim())
            const matches = acceptTypes.some((type) => {
              if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type.toLowerCase())
              if (type.endsWith("/*")) return file.type.startsWith(type.replace("/*", "/"))
              return file.type === type
            })
            if (!matches) return false
          }
          return true
        })
        .map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          status: "pending" as const,
        }))

      const updated = [...files, ...validFiles]
      setInternalFiles(updated)
      onFilesChange?.(updated)
    },
    [files, accept, maxSize, maxFiles, onFilesChange]
  )

  const removeFile = React.useCallback(
    (id: string) => {
      const updated = files.filter((f) => f.id !== id)
      setInternalFiles(updated)
      onFilesChange?.(updated)
    },
    [files, onFilesChange]
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState("dragover")
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState("idle")
  }, [])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragState("idle")
      if (!disabled && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [disabled, addFiles]
  )

  const handleClick = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
      e.target.value = ""
    }
  }

  return (
    <div data-slot="file-upload" className={cn("space-y-3", className)} {...props}>
      <div
        data-slot="file-upload-dropzone"
        className={cn(
          fileUploadVariants({ state }),
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <UploadIcon className="size-8 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-primary">Click to upload</span> or drag and drop
        </div>
        {accept && (
          <p className="text-xs text-muted-foreground">
            Accepted: {accept}
            {maxSize && ` • Max size: ${formatFileSize(maxSize)}`}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {files.length > 0 && (
        <div data-slot="file-upload-list" className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              data-slot="file-upload-item"
              className="flex items-center gap-3 rounded-md border p-2"
            >
              {showPreviews && file.preview ? (
                <Image
                  src={file.preview}
                  alt={file.name}
                  width={40}
                  height={40}
                  className="size-10 rounded object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded bg-muted">
                  {getFileIcon(file.type)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              {file.status === "uploading" && file.progress !== undefined && (
                <div className="w-16">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => removeFile(file.id)}
                disabled={disabled}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { FileUpload, fileUploadVariants, formatFileSize }
