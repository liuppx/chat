import { useMemo } from "react";
import { ModelCandidate } from "../client/api";
import {
  useAccessStore,
  useAppConfig,
  useMaskProviderModelsStore,
} from "../store";
import {
  collectModelsWithDefaultModel,
  filterModelsByCandidates,
  normalizeModels,
} from "./model";

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

export function useMaskProviderModels() {
  const models = useMaskProviderModelsStore((state) => state.models);

  return useMemo(() => normalizeModels(models), [models]);
}

export function useSessionModels(candidateModels?: readonly ModelCandidate[]) {
  const allModels = useAllModels();

  return useMemo(() => {
    const availableModels = allModels.filter((model) => model.available);
    return filterModelsByCandidates(availableModels, candidateModels);
  }, [allModels, candidateModels]);
}
