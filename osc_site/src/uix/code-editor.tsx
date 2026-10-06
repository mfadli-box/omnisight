"use client"

import CodeMirror from "@uiw/react-codemirror"
import { yaml } from "@codemirror/lang-yaml"
import { cn } from "@/lib/utility"

export interface CodeEditorProps {
  value?: string
  onChange?: (value: string) => void
  language?: "yaml" | "plain"
  placeholder?: string
  minHeight?: string
  disabled?: boolean
  ariaInvalid?: boolean
  className?: string
}

function CodeEditor({
  value = "",
  onChange,
  language = "yaml",
  placeholder,
  minHeight = "12rem",
  disabled,
  ariaInvalid,
  className,
}: CodeEditorProps) {
  const ext = language === "yaml" ? yaml() : null
  return (
    <div
      data-slot="code-editor"
      data-invalid={ariaInvalid || undefined}
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-transparent transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={ext ? [ext] : []}
        placeholder={placeholder}
        height={minHeight}
        editable={!disabled}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
        theme="light"
        className="[&_.cm-editor]:rounded-lg [&_.cm-editor]:text-sm [&_.cm-editor]:outline-none"
      />
    </div>
  )
}

export { CodeEditor }
