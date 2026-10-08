"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/uix/tabs";
import { Badge } from "@/uix/badge";
import { type APP02Company } from "./api";
import CompanyTable from "./components/company-table";
import ModulesTab from "./components/modules-tab";
import AreasTab from "./components/areas-tab";

export default function APP02Page() {
  const [selectedCompany, setSelectedCompany] = useState<APP02Company | null>(null);
  const [tab, setTab] = useState("companies");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">APP02 - Company Management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">
            Selected company:{" "}
            {selectedCompany ? (
              <Badge variant="default" className="w-fit">
                {selectedCompany.code} - {selectedCompany.name}
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                None - pick a row to manage modules/areas
              </Badge>
            )}
          </span>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList variant="line">
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="modules" disabled={!selectedCompany}>Modules</TabsTrigger>
            <TabsTrigger value="areas" disabled={!selectedCompany}>Areas</TabsTrigger>
          </TabsList>
          <TabsContent value="companies">
            <CompanyTable
              onSelectCompany={setSelectedCompany}
              selectedCompanyId={selectedCompany?.id}
            />
          </TabsContent>
          <TabsContent value="modules">
            {selectedCompany ? (
              <ModulesTab company={selectedCompany} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a company first.</p>
            )}
          </TabsContent>
          <TabsContent value="areas">
            {selectedCompany ? (
              <AreasTab company={selectedCompany} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a company first.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
