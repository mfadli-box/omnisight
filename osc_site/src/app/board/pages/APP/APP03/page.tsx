"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/uix/tabs";
import { Badge } from "@/uix/badge";
import { type APP03User, type UserCompanyRow } from "./api";
import UserTable from "./components/user-table";
import CompaniesTab from "./components/companies-tab";
import PrivilegesTab from "./components/privileges-tab";
import AreasTab from "./components/areas-tab";

export default function APP03Page() {
  const [selectedUser, setSelectedUser] = useState<APP03User | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<UserCompanyRow | null>(null);
  const [tab, setTab] = useState("users");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">APP03 - User Management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">
            Selected user:{" "}
            {selectedUser ? (
              <Badge variant="default" className="w-fit">
                {selectedUser.username} - {selectedUser.fullname}
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                None - pick a row to manage companies/areas
              </Badge>
            )}
          </span>
          {selectedCompany ? (
            <span className="text-muted-foreground">
              Selected company:{" "}
              <Badge variant="outline" className="w-fit">
                {selectedCompany.company_code} - {selectedCompany.company_name}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Selected company:{" "}
              <Badge variant="secondary" className="w-fit">
                None - pick a row in Companies tab to manage privileges
              </Badge>
            </span>
          )}
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList variant="line">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="companies" disabled={!selectedUser}>Companies</TabsTrigger>
            <TabsTrigger value="privileges" disabled={!selectedCompany}>Privileges</TabsTrigger>
            <TabsTrigger value="areas" disabled={!selectedUser}>Areas</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UserTable
              onSelectUser={(user) => {
                setSelectedUser(user);
                setSelectedCompany(null);
              }}
              selectedUserId={selectedUser?.id}
            />
          </TabsContent>
          <TabsContent value="companies">
            {selectedUser ? (
              <CompaniesTab
                user={selectedUser}
                onSelectCompany={(company) => {
                  setSelectedCompany(company);
                  if (company) {
                    setTab("companies");
                  }
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a user first.</p>
            )}
          </TabsContent>
          <TabsContent value="privileges">
            {selectedUser && selectedCompany ? (
              <PrivilegesTab user={selectedUser} userCompany={selectedCompany} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a user and a company first to manage privileges.
              </p>
            )}
          </TabsContent>
          <TabsContent value="areas">
            {selectedUser ? (
              <AreasTab user={selectedUser} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a user first.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}