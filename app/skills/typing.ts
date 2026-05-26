import { ModelConfig } from "../store";
import { type Mask } from "../store/mask";

export type BuiltinSkill = Omit<Mask, "id" | "modelConfig"> & {
  builtin: Boolean;
  modelConfig: Partial<ModelConfig>;
};

export type BuiltinMask = BuiltinSkill;
