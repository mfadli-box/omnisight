import packageJson from "../../package.json";

const WS_YEAR = new Date().getFullYear();

const getWsUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_WS_POOL;
  if (envUrl) return envUrl;
  const httpUrl = process.env.BE_POOL ?? "http://osc_rest:37772";
  return httpUrl.replace(/^http/, "ws");
};

export const BE_POOL = process.env.BE_POOL ?? "http://osc_rest:37772";
export const WS_POOL = getWsUrl();
export const WS_CONF = {
  name: process.env.WS_NAME ?? "OmniSight",
  version: packageJson.version,
  copyright: `© ${WS_YEAR}, ${process.env.WS_NAME ?? "OmniSight"}.`,
  meta: {
    title: process.env.WS_NAME ?? "OmniSight",
    description: process.env.WS_DESC ?? "OmniSight",
  },
};
