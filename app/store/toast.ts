// store/toast.ts
import { create } from "zustand";

type ToastStore = {
  pendingError: string | null;
  setPendingError: (msg: string | null) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  pendingError: null,
  setPendingError: (msg) => set({ pendingError: msg }),
}));
