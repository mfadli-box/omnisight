"use client";

import React from "react";
import { Column } from "./datatable";
import { Button } from "./button";
import { FileText, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "./alert-dialog";

interface DataTableCardProps<T> {
  row: T;
  columns: Column<T>[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onDetail?: (row: T) => void;
  hideDetail?: boolean;
  hideEdit?: boolean;
  hideDelete?: boolean;
}

export default function DataTableCard<T extends { id: string | number }>({
  row,
  columns,
  onEdit,
  onDelete,
  onDetail,
  hideDetail,
  hideEdit,
  hideDelete,
}: DataTableCardProps<T>) {
  const visibleColumns = columns.filter((col) => col.hidden !== true);
  const headerColumn = visibleColumns[0];
  const bodyColumns = visibleColumns.slice(1);

  const getCellValue = (col: Column<T>, row: T) => {
    if (typeof col.accessor === "function") {
      return col.accessor(row);
    }
    if (col.formatter) {
      return col.formatter(row[col.accessor], row);
    }
    return row[col.accessor] as React.ReactNode;
  };

  return (
    <div className="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <h3 className="font-medium text-gray-900 truncate">
          {getCellValue(headerColumn, row)}
        </h3>
      </div>
      <div className="p-3 space-y-2">
        {bodyColumns.map((col, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500 font-medium">{col.header}</span>
            <span className="text-sm text-gray-900 break-words">
              {getCellValue(col, row)}
            </span>
          </div>
        ))}
      </div>
      {(onDetail || onEdit || onDelete) && (
        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            {onDetail && !hideDetail && (
              <Button
                variant="outline"
                size="sm"
                className="touch-manipulation h-11 w-11"
                onClick={() => onDetail(row)}
              >
                <FileText className="size-4" />
              </Button>
            )}
            {onEdit && !hideEdit && (
              <Button
                variant="outline"
                size="sm"
                className="touch-manipulation h-11 w-11"
                onClick={() => onEdit(row)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
            {onDelete && !hideDelete && (
              <AlertDialog>
                <AlertDialogTrigger>
                  <Button variant="outline" size="sm" className="touch-manipulation h-11 w-11">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Record?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone for record {row.id}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(row)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
