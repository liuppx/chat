import { useMemo } from "react";
import { DEFAULT_MODELS } from "../constant";

export function useAllModels() {
  // Force router model list; downstream selection still updates providerName/model
  return useMemo(() => {
    const list = DEFAULT_MODELS.map((m) => ({ ...m })) as any;
    console.log("[Models][useAllModels] returning", list.length, "items", list);
    return list;
  }, []);
}
