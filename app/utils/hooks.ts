import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";

export function useAllModels() {
  const config = useAppConfig();
  const accessStore = useAccessStore();

  return useMemo(() => {
    const customModels = [config.customModels, accessStore.customModels]
      .filter((item) => !!item && item.length > 0)
      .join(",");

    return collectModelsWithDefaultModel(
      config.models,
      customModels,
      accessStore.defaultModel,
    );
  }, [
    config.models,
    config.customModels,
    accessStore.customModels,
    accessStore.defaultModel,
  ]);
}
