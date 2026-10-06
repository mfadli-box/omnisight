import * as React from "react"
import { cn } from "@/lib/utility"

export interface MarkdownPreviewProps extends React.ComponentProps<"div"> {
  content: string
  className?: string
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/)
    const codeMatch = remaining.match(/`(.+?)`/)
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/)

    let firstMatch: { type: string; match: RegExpMatchArray } | null = null

    for (const [type, match] of [
      ["bold", boldMatch],
      ["italic", italicMatch],
      ["code", codeMatch],
      ["link", linkMatch],
    ] as const) {
      if (match && (!firstMatch || match.index! < firstMatch.match.index!)) {
        firstMatch = { type, match }
      }
    }

    if (!firstMatch) {
      parts.push(remaining)
      break
    }

    const { type, match } = firstMatch
    const before = remaining.slice(0, match.index!)
    if (before) parts.push(before)

    if (type === "bold") {
      parts.push(<strong key={key++}>{match[1]}</strong>)
    } else if (type === "italic") {
      parts.push(<em key={key++}>{match[1]}</em>)
    } else if (type === "code") {
      parts.push(
        <code key={key++} className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
          {match[1]}
        </code>
      )
    } else if (type === "link") {
      parts.push(
        <a
          key={key++}
          href={match[2]}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[1]}
        </a>
      )
    }

    remaining = remaining.slice(match.index! + match[0].length)
  }

  return parts
}

function parseMarkdown(content: string): React.ReactNode[] {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let key = 0
  let inCodeBlock = false
  let codeContent = ""

  let inTable = false
  let tableHeaders: string[] = []
  let tableRows: string[][] = []

  const flushTable = () => {
    if (tableHeaders.length > 0) {
      elements.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium">
                    {parseInlineMarkdown(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri} className="border-b">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2">
                      {parseInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    tableHeaders = []
    tableRows = []
    inTable = false
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++} className="my-4 overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-100">
            <code>{codeContent.trim()}</code>
          </pre>
        )
        codeContent = ""
        inCodeBlock = false
      } else {
        flushTable()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += line + "\n"
      continue
    }

    if (line.startsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())

      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue
      }

      if (!inTable) {
        tableHeaders = cells
        inTable = true
      } else {
        tableRows.push(cells)
      }
      continue
    } else if (inTable) {
      flushTable()
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={key++} className="text-3xl font-bold mt-6 mb-4">
          {parseInlineMarkdown(line.slice(2))}
        </h1>
      )
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-2xl font-semibold mt-5 mb-3">
          {parseInlineMarkdown(line.slice(3))}
        </h2>
      )
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-xl font-semibold mt-4 mb-2">
          {parseInlineMarkdown(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith("#### ")) {
      elements.push(
        <h4 key={key++} className="text-lg font-semibold mt-3 mb-2">
          {parseInlineMarkdown(line.slice(5))}
        </h4>
      )
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={key++} className="ml-4 list-disc">
          {parseInlineMarkdown(line.slice(2))}
        </li>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s/, "")
      elements.push(
        <li key={key++} className="ml-4 list-decimal">
          {parseInlineMarkdown(text)}
        </li>
      )
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={key++}
          className="my-2 border-l-4 border-primary/30 pl-4 text-muted-foreground italic"
        >
          {parseInlineMarkdown(line.slice(2))}
        </blockquote>
      )
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key++} className="my-4 border-t" />)
    } else if (line.trim() === "") {
      elements.push(<br key={key++} />)
    } else {
      elements.push(
        <p key={key++} className="my-1">
          {parseInlineMarkdown(line)}
        </p>
      )
    }
  }

  flushTable()

  return elements
}

function MarkdownPreview({ className, content, ...props }: MarkdownPreviewProps) {
  const parsed = React.useMemo(() => parseMarkdown(content), [content])

  return (
    <div
      data-slot="markdown-preview"
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      {...props}
    >
      {parsed}
    </div>
  )
}

export { MarkdownPreview }
