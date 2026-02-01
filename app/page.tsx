import { Analytics } from "@vercel/analytics/react";
import { Home } from "./components/home";
import { getServerSideConfig } from "./config/server";
import { Toaster } from "sonner";

export const runtime = "nodejs";

const serverConfig = getServerSideConfig();

export default async function App() {
  return (
    <>
      <Home />
      {serverConfig?.isVercel && (
        <>
          <Analytics />
          <Toaster position="top-right" richColors /> {/* 👈 必须在这里 */}
        </>
      )}
    </>
  );
}
