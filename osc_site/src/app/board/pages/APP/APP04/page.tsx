"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/uix/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/uix/tabs";
import { Badge } from "@/uix/badge";
import { type SignatureType, type ApprovalStep, type SignatureForm } from "./api";
import TypesTable from "./components/types-table";
import StepsTab from "./components/steps-tab";
import SignersTab from "./components/signers-tab";
import FormsTable from "./components/forms-table";
import FlagsTab from "./components/flags-tab";

export default function APP04Page() {
  const [selectedType, setSelectedType] = useState<SignatureType | null>(null);
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const [selectedForm, setSelectedForm] = useState<SignatureForm | null>(null);
  const [tab, setTab] = useState("types");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">APP04 - Signature Management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-muted-foreground">
            Selected type:{" "}
            {selectedType ? (
              <Badge variant="default" className="w-fit">
                {selectedType.code} - {selectedType.name}
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                None - pick a row in Types tab to manage steps
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground">
            Selected step:{" "}
            {selectedStep ? (
              <Badge variant="outline" className="w-fit">
                Step {selectedStep.step} ({selectedStep.condition})
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                None - pick a row in Steps tab to manage signers
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground">
            Selected form:{" "}
            {selectedForm ? (
              <Badge variant="default" className="w-fit">
                {selectedForm.request_id}
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">
                None - pick a row in Forms tab to manage flags
              </Badge>
            )}
          </span>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList variant="line">
            <TabsTrigger value="types">Types</TabsTrigger>
            <TabsTrigger value="steps" disabled={!selectedType}>Steps</TabsTrigger>
            <TabsTrigger value="signers" disabled={!selectedType || !selectedStep}>Signers</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="flags" disabled={!selectedForm}>Flags</TabsTrigger>
          </TabsList>
          <TabsContent value="types">
            <TypesTable
              onSelectType={(st) => {
                setSelectedType(st);
                setSelectedStep(null);
              }}
              selectedTypeId={selectedType?.id}
            />
          </TabsContent>
          <TabsContent value="steps">
            {selectedType ? (
              <StepsTab
                signatureType={selectedType}
                onSelectStep={(step) => setSelectedStep(step)}
                selectedStepId={selectedStep?.id}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a signature type first.</p>
            )}
          </TabsContent>
          <TabsContent value="signers">
            {selectedType && selectedStep ? (
              <SignersTab signatureType={selectedType} step={selectedStep} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a signature type and a step first to manage signers.
              </p>
            )}
          </TabsContent>
          <TabsContent value="forms">
            <FormsTable
              onSelectForm={(form) => {
                setSelectedForm(form);
                if (form) {
                  setTab("forms");
                }
              }}
              selectedFormId={selectedForm?.id}
            />
          </TabsContent>
          <TabsContent value="flags">
            {selectedForm ? (
              <FlagsTab signatureForm={selectedForm} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a signature form first.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}