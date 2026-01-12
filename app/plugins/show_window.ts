import { toast } from "sonner";
export const notifyError = (msg: string) => {
  console.log(`toast.error`);
  toast.error("❌错误", {
    description: `❌${msg}`,
    duration: 3000,
  });
};

export const notifyInfo = (msg: string) => {
  console.log(`toast.info`);
  toast.info("🎉消息", {
    description: `🧶${msg}`,
  });
};

export const notifySuccess = (msg: string) => {
  console.log(`toast.success`);
  toast.success("✅成功", {
    description: `🌿${msg}`,
  });
};
