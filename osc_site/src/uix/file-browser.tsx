"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { Button } from "./button"
import { Spinner } from "./spinner"
import { Badge } from "./badge"
import { Progress } from "./progress"
import { Input } from "./input"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "./empty"
import { formatBytes } from "@/lib/format"
import {
  ArrowUpIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  HardDriveIcon,
  HomeIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  FileTextIcon,
  ImageIcon,
  ArchiveIcon,
  XIcon,
} from "lucide-react"

export interface FileBrowserEntry {
  name: string
  path: string
  type: "file" | "dir"
  size?: number
  modified?: string
  mode?: string
  owner?: string
  group?: string
  linkTarget?: string
}

export interface FileBrowserHandle {
  refresh: () => void
  navigateTo: (path: string) => void
}

export interface FileBrowserProps extends React.ComponentProps<"div"> {
  entries: FileBrowserEntry[]
  currentPath?: string
  rootPath?: string
  loading?: boolean
  error?: string | null
  onNavigate?: (path: string) => void
  onRefresh?: (path: string) => void
  onDownload?: (entry: FileBrowserEntry) => void
  onDelete?: (entry: FileBrowserEntry) => Promise<void> | void
  onUpload?: (files: File[]) => Promise<void> | void
  onMkdir?: (path: string, name: string) => Promise<void> | void
  selected?: string[]
  onSelectionChange?: (paths: string[]) => void
  showToolbar?: boolean
  readOnly?: boolean
  uploadSupported?: boolean
  title?: string
  className?: string
}

const FileBrowser = React.forwardRef<FileBrowserHandle, FileBrowserProps>(function FileBrowser(
  {
    entries,
    currentPath = "/",
    rootPath = "/",
    loading = false,
    error = null,
    onNavigate,
    onRefresh,
    onDownload,
    onDelete,
    onUpload,
    onMkdir,
    selected,
    onSelectionChange,
    showToolbar = true,
    readOnly = false,
    uploadSupported = true,
    className,
    ...props
  },
  ref,
) {
  const [selectedInternal, setSelectedInternal] = React.useState<string[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null)
  const [showMkdir, setShowMkdir] = React.useState(false)
  const [mkdirName, setMkdirName] = React.useState("")
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const activePathRef = React.useRef(currentPath)
  activePathRef.current = currentPath

  const selection = selected ?? selectedInternal

  React.useImperativeHandle(ref, () => ({
    refresh: () => onRefresh?.(activePathRef.current),
    navigateTo: (path) => onNavigate?.(path),
  }), [onRefresh, onNavigate])

  const setSelection = React.useCallback(
    (paths: string[]) => {
      if (selected === undefined) setSelectedInternal(paths)
      onSelectionChange?.(paths)
    },
    [selected, onSelectionChange],
  )

  const handleEntryClick = (entry: FileBrowserEntry) => {
    if (entry.type === "dir") {
      onNavigate?.(entry.path)
      setSelection([])
    } else if (!readOnly) {
      setSelection(
        selection.includes(entry.path)
          ? selection.filter((p) => p !== entry.path)
          : [...selection, entry.path],
      )
    }
  }

  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0 || !onUpload) return
    setUploadProgress(0)
    try {
      await onUpload(fileArray)
    } finally {
      setUploadProgress(null)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!readOnly && uploadSupported && e.dataTransfer.files.length > 0) {
      await handleUpload(e.dataTransfer.files)
    }
  }

  const handleMkdir = async () => {
    const name = mkdirName.trim()
    if (!name || !onMkdir) return
    await onMkdir(currentPath, name)
    setMkdirName("")
    setShowMkdir(false)
  }

  const getParentPath = (path: string) => {
    const parts = path.split("/").filter(Boolean)
    parts.pop()
    return parts.length === 0 ? rootPath : "/" + parts.join("/")
  }

  const isRoot = currentPath === rootPath || currentPath === "/"

  return (
    <div
      data-slot="file-browser"
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-md border", className)}
      onDragOver={(e) => {
        if (!readOnly && uploadSupported) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={handleDrop}
      {...props}
    >
      {showToolbar && (
        <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate?.(rootPath)}
            disabled={isRoot || loading}
            className="h-7 px-2 text-muted-foreground"
          >
            <HomeIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate?.(getParentPath(currentPath))}
            disabled={isRoot || loading}
            className="h-7 px-2 text-muted-foreground"
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefresh?.(currentPath)}
            disabled={loading}
            className="h-7 px-2 text-muted-foreground"
          >
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <div className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {buildCrumbSegments(currentPath, rootPath).map((seg, i, arr) => (
              <React.Fragment key={seg.path}>
                {i > 0 && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/50" />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate?.(seg.path)}
                  disabled={i === arr.length - 1}
                  className={cn(
                    "h-7 shrink-0 px-1.5 text-xs",
                    i === arr.length - 1 ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {i === 0 ? <HardDriveIcon className="mr-1 size-3.5" /> : null}
                  {seg.label}
                </Button>
              </React.Fragment>
            ))}
          </div>
          {!readOnly && uploadSupported && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 px-2 text-muted-foreground"
              disabled={loading}
            >
              <UploadIcon className="size-3.5" />
            </Button>
          )}
          {!readOnly && onMkdir && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMkdir((v) => !v)}
              className="h-7 px-2 text-muted-foreground"
            >
              {showMkdir ? <XIcon className="size-3.5" /> : <FolderOpenIcon className="size-3.5" />}
            </Button>
          )}
          {selection.length > 0 && !readOnly && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                for (const path of selection) {
                  const entry = entries.find((e) => e.path === path)
                  if (entry) void onDelete(entry)
                }
                setSelection([])
              }}
              className="h-7 px-2 text-red-500 hover:text-red-600"
            >
              <Trash2Icon className="size-3.5" />
              <span className="ml-1 hidden sm:inline">{selection.length}</span>
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleUpload(e.target.files)
                e.target.value = ""
              }
            }}
          />
        </div>
      )}

      {showMkdir && onMkdir && (
        <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
          <Input
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleMkdir()
            }}
            placeholder="New folder name"
            className="h-7 flex-1"
            autoFocus
          />
          <Button size="sm" onClick={() => void handleMkdir()} className="h-7">
            Create
          </Button>
        </div>
      )}

      {uploadProgress !== null && (
        <div className="flex items-center gap-2 border-b px-2 py-1">
          <Progress value={uploadProgress} className="h-1 flex-1" />
          <span className="text-xs text-muted-foreground">{Math.round(uploadProgress)}%</span>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto" data-slot="file-browser-list">
        {error ? (
          <Empty>
            <EmptyMedia variant="icon">
              <FileIcon className="size-4" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Failed to load directory</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : loading && entries.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <FolderIcon className="size-4" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Empty directory</EmptyTitle>
              <EmptyDescription>
                {uploadSupported && !readOnly
                  ? "Drop files here to upload, or create a folder."
                  : "This directory is empty."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="hidden w-28 px-3 py-1.5 font-medium sm:table-cell">Size</th>
                <th className="hidden w-40 px-3 py-1.5 font-medium md:table-cell">Modified</th>
                {!readOnly && <th className="w-16 px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isSelected = selection.includes(entry.path)
                return (
                  <tr
                    key={entry.path}
                    data-slot="file-browser-row"
                    className={cn(
                      "cursor-pointer border-b border-muted/40 last:border-0",
                      isSelected && "bg-primary/10",
                      entry.type === "dir" && "hover:bg-muted/40",
                      entry.type === "file" && !readOnly && "hover:bg-muted/30",
                      entry.type === "file" && readOnly && "hover:bg-muted/30",
                    )}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => {
                      if (entry.type === "file" && !readOnly) onDownload?.(entry)
                    }}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-muted-foreground">
                          {entry.type === "dir" ? (
                            <FolderIcon className="size-4 text-blue-500" />
                          ) : (
                            getFileTypeIcon(entry.name)
                          )}
                        </span>
                        <span className="truncate">{entry.name}</span>
                        {entry.linkTarget && (
                          <span className="truncate text-xs text-muted-foreground">
                            → {entry.linkTarget}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-1.5 text-xs text-muted-foreground sm:table-cell">
                      {entry.type === "dir" ? "—" : entry.size != null ? formatBytes(entry.size) : "—"}
                    </td>
                    <td className="hidden px-3 py-1.5 text-xs text-muted-foreground md:table-cell">
                      {entry.modified ?? "—"}
                    </td>
                    {!readOnly && (
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {entry.type === "file" && onDownload && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDownload?.(entry)
                              }}
                            >
                              <DownloadIcon className="size-3.5" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-red-500"
                              onClick={(e) => {
                                e.stopPropagation()
                                void onDelete(entry)
                              }}
                            >
                              <Trash2Icon className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!readOnly && uploadSupported && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5",
            dragging ? "opacity-100" : "opacity-0",
          )}
        >
          <Badge variant="secondary" className="gap-1.5">
            <UploadIcon className="size-3.5" />
            Drop to upload
          </Badge>
        </div>
      )}
    </div>
  )
})

function buildCrumbSegments(path: string, rootPath: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "/").replace(/\/+$/, "") || "/"
  const parts = normalized.split("/").filter(Boolean)
  const segments: { label: string; path: string }[] = []
  if (rootPath && rootPath !== "/") {
    segments.push({ label: "root", path: rootPath })
  }
  let acc = ""
  for (const part of parts) {
    acc += "/" + part
    if (!(rootPath && rootPath !== "/" && acc === rootPath)) {
      segments.push({ label: part, path: acc })
    }
  }
  if (segments.length === 0) segments.push({ label: "/", path: "/" })
  return segments
}

function getFileTypeIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) {
    return <ImageIcon className="size-4 text-purple-500" />
  }
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar"].includes(ext)) {
    return <ArchiveIcon className="size-4 text-yellow-500" />
  }
  if (["txt", "md", "log", "csv", "json", "yml", "yaml", "xml", "conf", "sh", "go", "ts", "js", "py"].includes(ext)) {
    return <FileTextIcon className="size-4 text-sky-500" />
  }
  return <FileIcon className="size-4 text-muted-foreground" />
}

export { FileBrowser, buildCrumbSegments }
export default FileBrowser
