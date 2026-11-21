"use client";

import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { ResourcePanel, type Field } from "../shared/resource-panel";

const organization = { companies: "Company", areas: "Area", stores: "Store" } as const;
const organizationFields: Field[] = [{ key: "code", label: "Kode" }, { key: "name", label: "Nama" }];
const storeFields: Field[] = [
  ...organizationFields,
  { key: "network_ip_cidr", label: "CIDR jaringan" },
  { key: "area_id", label: "UUID area (opsional jika area aktif dipilih)", createOnly: true, optional: true },
];

export function Organization() {
  return <Tabs defaultValue="companies">
    <TabsList aria-label="Direktori organisasi">
      <TabsTrigger value="companies">{organization.companies}</TabsTrigger>
      <TabsTrigger value="areas">{organization.areas}</TabsTrigger>
      <TabsTrigger value="stores">{organization.stores}</TabsTrigger>
    </TabsList>
    <TabsPanel value="companies" className="mt-4">
      <ResourcePanel path="companies" title={organization.companies} columns={organizationFields} fields={organizationFields} archiveLabel="Nonaktifkan" />
    </TabsPanel>
    <TabsPanel value="areas" className="mt-4">
      <ResourcePanel path="areas" title={organization.areas} columns={[...organizationFields, { key: "id", label: "UUID area" }]}
        fields={organizationFields} archiveLabel="Nonaktifkan" />
    </TabsPanel>
    <TabsPanel value="stores" className="mt-4">
      <ResourcePanel path="stores" title={organization.stores} columns={organizationFields} fields={storeFields} archiveLabel="Nonaktifkan" />
    </TabsPanel>
  </Tabs>;
}
