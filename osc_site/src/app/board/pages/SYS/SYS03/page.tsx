"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import HistoryTable from "./components/history-table";

export default function SYS03Page() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">SYS03 - Login History</CardTitle>
      </CardHeader>
      <CardContent>
        <HistoryTable />
      </CardContent>
    </Card>
  );
}
