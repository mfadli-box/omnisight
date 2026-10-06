"use client";

import { ReactNode } from "react";
import { Button } from "./button";
import { Spinner } from "./spinner";
import {
  Dialog, DialogTitle, DialogDescription,
  DialogContent, DialogFooter, DialogHeader
} from "./dialog";

interface ActionConfig {
  label: string;
  type?: "button" | "submit";
  variant?: string;
  disabled?: boolean;
}
interface DataDialogProps {
  isOpen: boolean;
  mode: "create" | "update" | "delete" | "detail" | "approve" | "reject";
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit?: () => void;
  loading?: boolean;
  children: ReactNode;
}
export default function DataDialog({
  isOpen,
  mode,
  title,
  description,
  onClose,
  onSubmit,
  loading,
  children,
}: DataDialogProps) {
  if (!isOpen) return null;
  const ContentWrapper = "div";
  const colorCreate = "bg-green-500 text-white hover:bg-green-600";
  const colorUpdate = "bg-blue-500 text-white hover:bg-blue-600";
  const colorDelete = "bg-red-500 text-white hover:bg-red-600";
  const colorApprove = "bg-emerald-500 text-white hover:bg-emerald-600";
  const colorReject = "bg-orange-500 text-white hover:bg-orange-600";
  const colorDetail = "bg-gray-500 text-white hover:bg-gray-600";
  const cancelAction: ActionConfig = {
    label: "Cancel",
    type: "button",
    variant: "bg-gray-200 text-gray-800 hover:bg-gray-300",
  };
  const submitAction: ActionConfig = {
    label: mode === "approve" ? "Approve" : mode === "reject" ? "Reject" : mode.charAt(0).toUpperCase() + mode.slice(1),
    type: "submit",
    variant: mode === "create" ? colorCreate
           : mode === "update" ? colorUpdate
           : mode === "delete" ? colorDelete
           : mode === "approve" ? colorApprove
           : mode === "reject" ? colorReject : colorDetail,
  };
  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="w-full h-full max-w-none max-h-none flex flex-col"
        showCloseButton={false}
      >
        <div className="m-0 flex flex-col gap-4 sm:gap-6 h-full overflow-hidden">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <ContentWrapper onSubmit={onSubmit} className="min-w-0 overflow-y-auto flex-1 min-h-0">
            {children}
          </ContentWrapper>
          <DialogFooter showCloseButton={false} className="px-2 py-1 gap-2 sm:gap-3 shrink-0">
            {mode !== "detail" && submitAction && (
              <Button
                type={submitAction.type || "submit"}
                disabled={loading || submitAction.disabled}
                onClick={loading ? undefined : onSubmit}
                className={`${submitAction.variant} touch-manipulation h-9 px-2`}
              >
                {loading && <Spinner className="size-4 mr-1.5" />}
                {submitAction.label}
              </Button>
            )}
            {cancelAction ? (
              <Button
                type={cancelAction.type || "button"}
                disabled={loading || cancelAction.disabled}
                onClick={loading ? undefined : onClose}
                className={`${cancelAction.variant} touch-manipulation h-9 px-2`}
              >
                {cancelAction.label}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
