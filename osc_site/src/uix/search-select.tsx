"use client"

import * as React from "react"
import { cn } from "@/lib/utility"
import { ChevronDownIcon, XIcon, CheckIcon } from "lucide-react"

interface SearchSelectItem {
  id: string
  name: string
}

interface SearchSelectProps {
  items: SearchSelectItem[]
  value?: string | null
  onValueChange?: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  error?: boolean
  id?: string
}

export function SearchSelect({
  items,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  className,
  error = false,
  id,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const selectedItem = items.find((item) => item.id === value)

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const lower = search.toLowerCase()
    return items.filter((item) => item.name.toLowerCase().includes(lower))
  }, [items, search])

  const isOpen = open && !disabled

  const handleSelect = (item: SearchSelectItem) => {
    onValueChange?.(item.id)
    setSearch("")
    setOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange?.(null)
    setSearch("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        if (!disabled) {
          setOpen(true)
        }
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        )
        break
      case "Enter":
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          handleSelect(filteredItems[highlightedIndex])
        }
        break
      case "Escape":
        e.preventDefault()
        setOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHighlightedIndex(-1)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [isOpen])

  React.useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: "nearest" })
      }
    }
  }, [highlightedIndex, isOpen])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setHighlightedIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedItem ? selectedItem.name : placeholder}
          className={cn(
            "flex h-11 w-full rounded-md border bg-transparent px-2 py-1 pr-14 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm",
            error ? "border-destructive focus-visible:ring-destructive" : "border-input focus-visible:ring-ring",
            className
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-full items-center px-2 py-1 touch-manipulation hover:bg-accent/50 active:bg-accent"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (disabled) return
              setOpen((prev) => !prev)
              setHighlightedIndex(-1)
            }}
            className="flex h-full items-center px-2 py-1 touch-manipulation hover:bg-accent/50 active:bg-accent"
            tabIndex={-1}
          >
            <ChevronDownIcon className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )} />
          </button>
        </div>
      </div>
      {isOpen && (
        <div
          className="absolute left-0 top-full z-[60] mt-0 w-full min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg max-h-[min(18rem,50dvh)] sm:max-h-[min(15rem,40vh)]"
        >
          <div
            ref={listRef}
            className="max-h-full overflow-y-auto overscroll-contain"
          >
            {filteredItems.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">No results</div>
            ) : (
              filteredItems.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  onClick={() => handleSelect(item)}
                  onTouchStart={() => setHighlightedIndex(index)}
                  className={cn(
                    "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm select-none touch-manipulation sm:py-1",
                    index === highlightedIndex && "bg-accent text-accent-foreground",
                    item.id === value && "bg-accent text-accent-foreground font-medium"
                  )}
                >
                  {item.name}
                  {item.id === value && (
                    <CheckIcon className="pointer-events-none absolute right-2 h-4 w-4" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { SearchSelect as default }
