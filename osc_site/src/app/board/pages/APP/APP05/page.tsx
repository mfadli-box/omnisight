"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/uix/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/uix/tabs";
import SessionsTable from "./components/sessions-table";
import TokensTable from "./components/tokens-table";

export default function APP05Page() {
  const [tab, setTab] = useState("sessions");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session</CardTitle>
        <CardDescription>
          Kelola sesi login pengguna dan token otentikasi (blokir / revoke).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList variant="line">
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
          </TabsList>
          <TabsContent value="sessions">
            <SessionsTable />
          </TabsContent>
          <TabsContent value="tokens">
            <TokensTable />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}