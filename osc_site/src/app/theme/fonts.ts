type FontDescriptor = {
  variable: string;
};

const inter: FontDescriptor = { variable: "--font-inter" };
const notoSans: FontDescriptor = { variable: "--font-noto-sans" };
const roboto: FontDescriptor = { variable: "--font-roboto" };
const geist: FontDescriptor = { variable: "--font-geist" };
const outfit: FontDescriptor = { variable: "--font-outfit" };
const geistMono: FontDescriptor = { variable: "--font-geist-mono" };
const dmSans: FontDescriptor = { variable: "--font-dm-sans" };
const nunitoSans: FontDescriptor = { variable: "--font-nunito-sans" };
const figtree: FontDescriptor = { variable: "--font-figtree" };
const raleway: FontDescriptor = { variable: "--font-raleway" };
const publicSans: FontDescriptor = { variable: "--font-public-sans" };
const jetBrainsMono: FontDescriptor = { variable: "--font-jetbrains-mono" };
const notoSerif: FontDescriptor = { variable: "--font-noto-serif" };
const robotoSlab: FontDescriptor = { variable: "--font-roboto-slab" };
const merriweather: FontDescriptor = { variable: "--font-merriweather" };
const lora: FontDescriptor = { variable: "--font-lora" };
const playfairDisplay: FontDescriptor = { variable: "--font-playfair-display" };
const geistPixelSquare: FontDescriptor = { variable: "--font-geist-pixel-square" };

export const fontRegistry = {
  geist: {
    label: "Geist",
    font: geist,
  },
  inter: {
    label: "Inter",
    font: inter,
  },
  notoSans: {
    label: "Noto Sans",
    font: notoSans,
  },
  nunitoSans: {
    label: "Nunito Sans",
    font: nunitoSans,
  },
  figtree: {
    label: "Figtree",
    font: figtree,
  },
  roboto: {
    label: "Roboto",
    font: roboto,
  },
  raleway: {
    label: "Raleway",
    font: raleway,
  },
  dmSans: {
    label: "DM Sans",
    font: dmSans,
  },
  publicSans: {
    label: "Public Sans",
    font: publicSans,
  },
  outfit: {
    label: "Outfit",
    font: outfit,
  },
  geistMono: {
    label: "Geist Mono",
    font: geistMono,
  },
  geistPixelSquare: {
    label: "Geist Pixel Square",
    font: geistPixelSquare,
  },
  jetBrainsMono: {
    label: "JetBrains Mono",
    font: jetBrainsMono,
  },
  notoSerif: {
    label: "Noto Serif",
    font: notoSerif,
  },
  robotoSlab: {
    label: "Roboto Slab",
    font: robotoSlab,
  },
  merriweather: {
    label: "Merriweather",
    font: merriweather,
  },
  lora: {
    label: "Lora",
    font: lora,
  },
  playfairDisplay: {
    label: "Playfair Display",
    font: playfairDisplay,
  },
} as const;

export type FontKey = keyof typeof fontRegistry;
export const fontVars = (Object.values(fontRegistry) as Array<(typeof fontRegistry)[FontKey]>)
  .map((f) => f.font.variable)
  .join(" ");
export const fontOptions = (Object.entries(fontRegistry) as Array<[FontKey, (typeof fontRegistry)[FontKey]]>).map(
  ([key, f]) => ({
    key,
    label: f.label,
    variable: f.font.variable,
  }),
);
