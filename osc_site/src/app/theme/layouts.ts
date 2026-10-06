const SidebarVariantOptions = [
  { label: "Sidebar", value: "sidebar" },
  { label: "Inset", value: "inset" },
  { label: "Floating", value: "floating" },
] as const;
export const SidebarVariantValues = SidebarVariantOptions.map((v) => v.value);
export type SidebarVariant = (typeof SidebarVariantValues)[number];

const SidebarCollapsibleOptions = [
  { label: "Icon", value: "icon" },
  { label: "Offcanvas", value: "offcanvas" },
] as const;
export const SidebarCollapsibleValues = SidebarCollapsibleOptions.map((v) => v.value);
export type SidebarCollapsible = (typeof SidebarCollapsibleValues)[number];

const ContentLayoutOptions = [
  { label: "Centered", value: "centered" },
  { label: "Full Width", value: "full-width" },
] as const;
export const ContentLayoutValues = ContentLayoutOptions.map((v) => v.value);
export type ContentLayout = (typeof ContentLayoutValues)[number];

const NavbarStyleOptions = [
  { label: "Sticky", value: "sticky" },
  { label: "Scroll", value: "scroll" },
] as const;
export const NavbarStyleValues = NavbarStyleOptions.map((v) => v.value);
export type NavbarStyle = (typeof NavbarStyleValues)[number];
