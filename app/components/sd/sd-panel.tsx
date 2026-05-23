import styles from "./sd-panel.module.scss";
import React from "react";
import { Select } from "@/app/components/ui-lib";
import Locale from "@/app/locales";
import { useSdStore } from "@/app/store/sd";
import clsx from "clsx";
import { useAllModels } from "@/app/utils/hooks";
import { resolveImageModels } from "./image-registry";

export function ControlParamItem(props: {
  title: string;
  subTitle?: string;
  required?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(styles["ctrl-param-item"], props.className)}>
      <div className={styles["ctrl-param-item-header"]}>
        <div className={styles["ctrl-param-item-title"]}>
          <div>
            {props.title}
            {props.required && <span style={{ color: "red" }}>*</span>}
          </div>
        </div>
      </div>
      {props.children}
      {props.subTitle && (
        <div className={styles["ctrl-param-item-sub-title"]}>
          {props.subTitle}
        </div>
      )}
    </div>
  );
}

export function ControlParam(props: {
  columns: any[];
  data: any;
  onChange: (field: string, val: any) => void;
}) {
  return (
    <>
      {props.columns?.map((item) => {
        let element: null | React.ReactNode;
        switch (item.type) {
          case "textarea":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <textarea
                  rows={item.rows || 3}
                  style={{ maxWidth: "100%", width: "100%", padding: "10px" }}
                  placeholder={item.placeholder}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                  value={props.data[item.value]}
                ></textarea>
              </ControlParamItem>
            );
            break;
          case "select":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <Select
                  aria-label={item.name}
                  value={props.data[item.value]}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                >
                  {item.options.map((opt: any) => {
                    return (
                      <option value={opt.value} key={opt.value}>
                        {opt.name}
                      </option>
                    );
                  })}
                </Select>
              </ControlParamItem>
            );
            break;
          case "number":
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <input
                  aria-label={item.name}
                  type="number"
                  min={item.min}
                  max={item.max}
                  value={props.data[item.value] || 0}
                  onChange={(e) => {
                    props.onChange(item.value, parseInt(e.currentTarget.value));
                  }}
                />
              </ControlParamItem>
            );
            break;
          default:
            element = (
              <ControlParamItem
                title={item.name}
                subTitle={item.sub}
                required={item.required}
              >
                <input
                  aria-label={item.name}
                  type="text"
                  value={props.data[item.value]}
                  style={{ maxWidth: "100%", width: "100%" }}
                  onChange={(e) => {
                    props.onChange(item.value, e.currentTarget.value);
                  }}
                />
              </ControlParamItem>
            );
        }
        return <div key={item.value}>{element}</div>;
      })}
    </>
  );
}

export const getModelParamBasicData = (
  columns: any[],
  data: any,
  clearText?: boolean,
) => {
  const newParams: any = {};
  columns.forEach((item: any) => {
    if (clearText && ["text", "textarea", "number"].includes(item.type)) {
      newParams[item.value] = item.default || "";
    } else {
      // @ts-ignore
      newParams[item.value] = data[item.value] || item.default || "";
    }
  });
  return newParams;
};

export const getParams = (model: any, params: any) => {
  return model?.params?.(params) || [];
};

export function SdPanel() {
  const sdStore = useSdStore();
  const runtimeModels = useAllModels();
  const currentModel = sdStore.currentModel;
  const setCurrentModel = sdStore.setCurrentModel;
  const params = sdStore.currentParams;
  const setParams = sdStore.setCurrentParams;
  const imageModels = React.useMemo(
    () => resolveImageModels(runtimeModels),
    [runtimeModels],
  );

  React.useEffect(() => {
    if (imageModels.length === 0) return;
    const matched = imageModels.find(
      (item) => item.value === currentModel.value,
    );
    if (matched && matched !== currentModel) {
      setCurrentModel(matched);
      return;
    }
    if (!matched) {
      const fallbackModel = imageModels[0];
      setCurrentModel(fallbackModel);
      setParams(getModelParamBasicData(fallbackModel.params({}), {}));
    }
  }, [currentModel, imageModels, setCurrentModel, setParams]);

  const handleValueChange = (field: string, val: any) => {
    setParams({
      ...params,
      [field]: val,
    });
  };
  const handleModelChange = (model: any) => {
    setCurrentModel(model);
    setParams(getModelParamBasicData(model.params({}), params));
  };

  return (
    <>
      <ControlParamItem title={Locale.SdPanel.AIModel}>
        <Select
          aria-label={Locale.SdPanel.AIModel}
          value={currentModel.value}
          onChange={(e) => {
            const model = imageModels.find(
              (item) => item.value === e.currentTarget.value,
            );
            if (model) {
              handleModelChange(model);
            }
          }}
        >
          {imageModels.map((item) => (
            <option value={item.value} key={item.value}>
              {item.name}
            </option>
          ))}
        </Select>
      </ControlParamItem>
      <ControlParam
        columns={getParams?.(currentModel, params) as any[]}
        data={params}
        onChange={handleValueChange}
      ></ControlParam>
    </>
  );
}
