import { create } from "zustand";
import { LLMModel } from "../client/api";

type MaskProviderModelsStore = {
  models: LLMModel[];
  setModels: (models: LLMModel[]) => void;
  clear: () => void;
};

export const useSkillProviderModelsStore = create<MaskProviderModelsStore>(
  (set) => ({
    models: [],
    setModels: (models) => set({ models }),
    clear: () => set({ models: [] }),
  }),
);

export const useMaskProviderModelsStore = useSkillProviderModelsStore;
