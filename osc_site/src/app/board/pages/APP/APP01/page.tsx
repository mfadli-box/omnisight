"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { type APP01Module } from "./api";
import ModuleTable from "./components/module-table";

export default function APP01Page() {
  const [selectedModule, setSelectedModule] = useState<APP01Module | null>(null);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">APP01 - Module & Access</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ModuleTable
          onSelectModule={setSelectedModule}
          selectedModuleId={selectedModule?.id}
        />
      </CardContent>
    </Card>
  );
}
