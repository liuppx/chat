import { StoreKey, ApiPath, OpenaiPath, ServiceProvider } from "@/app/constant";
import { createPersistStore } from "@/app/utils/store";
import { nanoid } from "nanoid";
import { uploadImage, base64Image2Blob } from "@/app/utils/chat";
import { getModelParamBasicData } from "@/app/components/sd/sd-panel";
import { getImageEndpointSchema } from "@/app/components/sd/image-endpoint-schemas";
import { getDefaultImageModel } from "@/app/components/sd/image-registry";
import { getHeadersWithRouterUcan } from "@/app/client/platforms/openai";
import { useAccessStore } from "./access";

const defaultModel = getDefaultImageModel() || {
  name: "",
  value: "",
  provider: "",
  providerName: "",
  endpointType: "images-generation",
  supportsImage: true as const,
  params: () => [],
};

const defaultParams = getModelParamBasicData(defaultModel.params({}), {});

const DEFAULT_SD_STATE = {
  currentId: 0,
  draw: [],
  currentModel: defaultModel,
  currentParams: defaultParams,
};

export const useSdStore = createPersistStore<
  {
    currentId: number;
    draw: any[];
    currentModel: typeof defaultModel;
    currentParams: any;
  },
  {
    getNextId: () => number;
    sendTask: (data: any, okCall?: Function) => void;
    updateDraw: (draw: any) => void;
    setCurrentModel: (model: any) => void;
    setCurrentParams: (data: any) => void;
  }
>(
  DEFAULT_SD_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      getNextId() {
        const id = ++_get().currentId;
        set({ currentId: id });
        return id;
      },
      sendTask(data: any, okCall?: Function) {
        data = { ...data, id: nanoid(), status: "running" };
        set({ draw: [data, ..._get().draw] });
        this.getNextId();
        this.imageGenerationRequestCall(data);
        okCall?.();
      },
      imageGenerationRequestCall(data: any) {
        const accessStore = useAccessStore.getState();
        const prefix = (
          accessStore.useCustomConfig
            ? accessStore.openaiUrl || (ApiPath.OpenAI as string)
            : (ApiPath.OpenAI as string)
        ).replace(/\/+$/, "");
        const schema = getImageEndpointSchema("images-generation");
        const requestBody = schema.buildRequestBody({
          model: data.model,
          params: data.params,
        });

        const path = `${prefix}/${OpenaiPath.ImagePath}`;
        getHeadersWithRouterUcan(path, ServiceProvider.OpenAI)
          .then((headers) =>
            fetch(path, {
              method: "POST",
              headers,
              body: JSON.stringify(requestBody),
            }),
          )
          .then((response) => response.json())
          .then((resData) => {
            const errorMessage = schema.resolveErrorMessage(resData);
            if (errorMessage) {
              this.updateDraw({
                ...data,
                status: "error",
                error: errorMessage,
              });
              this.getNextId();
              return;
            }

            const imageData = schema.resolveImageData(resData);
            if (!imageData) {
              this.updateDraw({
                ...data,
                status: "error",
                error: JSON.stringify(resData),
              });
              this.getNextId();
              return;
            }

            uploadImage(base64Image2Blob(imageData, "image/png"))
              .then((img_data) => {
                this.updateDraw({
                  ...data,
                  status: "success",
                  img_data,
                });
              })
              .catch((e) => {
                this.updateDraw({
                  ...data,
                  status: "error",
                  error: JSON.stringify(e),
                });
              })
              .finally(() => {
                this.getNextId();
              });
          })
          .catch((error) => {
            this.updateDraw({ ...data, status: "error", error: error.message });
            console.error("Error:", error);
            this.getNextId();
          });
      },
      updateDraw(_draw: any) {
        const draw = _get().draw || [];
        draw.some((item, index) => {
          if (item.id === _draw.id) {
            draw[index] = _draw;
            set(() => ({ draw }));
            return true;
          }
        });
      },
      setCurrentModel(model: any) {
        set({ currentModel: model });
      },
      setCurrentParams(data: any) {
        set({
          currentParams: data,
        });
      },
    };

    return methods;
  },
  {
    name: StoreKey.SdList,
    version: 1.0,
  },
);
