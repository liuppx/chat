import styles from "./sd-panel.module.scss";
import React from "react";
import { Select, showModal, showToast } from "@/app/components/ui-lib";
import Locale from "@/app/locales";
import { useSdStore } from "@/app/store/sd";
import clsx from "clsx";
import { useAllModels } from "@/app/utils/hooks";
import { resolveImageModels } from "./image-registry";
import { ImageFormMode } from "./image-endpoint-schemas";
import { IconButton } from "@/app/components/button";
import DeleteIcon from "@/app/icons/delete.svg";

function MaskPainter(props: {
  sourceImage: string;
  onSave: (maskDataUrl: string) => void;
  onDone?: () => void;
}) {
  const imageRef = React.useRef<HTMLImageElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const drawingRef = React.useRef(false);
  const panningRef = React.useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [brushSize, setBrushSize] = React.useState(36);
  const [zoom, setZoom] = React.useState(1);
  const [brushMode, setBrushMode] = React.useState<"erase" | "restore">(
    "erase",
  );
  const [interactionMode, setInteractionMode] = React.useState<"draw" | "pan">(
    "draw",
  );
  const [isPanning, setIsPanning] = React.useState(false);

  const syncCanvasSize = React.useCallback(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const width = image.clientWidth;
    const height = image.clientHeight;
    if (!width || !height) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
  }, []);

  React.useEffect(() => {
    syncCanvasSize();
    window.addEventListener("resize", syncCanvasSize);
    return () => window.removeEventListener("resize", syncCanvasSize);
  }, [syncCanvasSize]);

  const paintAtPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.globalCompositeOperation =
        brushMode === "erase" ? "destination-out" : "source-over";
      if (brushMode === "restore") {
        ctx.fillStyle = "#ffffff";
      }
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [brushMode, brushSize],
  );

  const exportMask = React.useCallback(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const output = document.createElement("canvas");
    output.width = image.naturalWidth;
    output.height = image.naturalHeight;
    const ctx = output.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    props.onSave(output.toDataURL("image/png"));
    props.onDone?.();
  }, [props]);

  return (
    <div className={styles["mask-editor"]}>
      <div className={styles["mask-editor-toolbar"]}>
        <label>
          {Locale.SdPanel.MaskInteractionMode}
          <Select
            aria-label={Locale.SdPanel.MaskInteractionMode}
            value={interactionMode}
            onChange={(e) =>
              setInteractionMode(e.currentTarget.value as "draw" | "pan")
            }
          >
            <option value="draw">
              {Locale.SdPanel.MaskInteractionModes.Draw}
            </option>
            <option value="pan">
              {Locale.SdPanel.MaskInteractionModes.Pan}
            </option>
          </Select>
        </label>
        <label>
          {Locale.SdPanel.MaskBrushMode}
          <Select
            aria-label={Locale.SdPanel.MaskBrushMode}
            value={brushMode}
            disabled={interactionMode === "pan"}
            onChange={(e) =>
              setBrushMode(e.currentTarget.value as "erase" | "restore")
            }
          >
            <option value="erase">{Locale.SdPanel.MaskBrushModes.Erase}</option>
            <option value="restore">
              {Locale.SdPanel.MaskBrushModes.Restore}
            </option>
          </Select>
        </label>
        <label>
          {Locale.SdPanel.MaskZoom}
          <input
            type="range"
            min={1}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.currentTarget.value))}
          />
          <span>{Math.round(zoom * 100)}%</span>
        </label>
        <button type="button" onClick={() => setZoom(1)}>
          {Locale.SdPanel.ResetZoom}
        </button>
        <label>
          {Locale.SdPanel.MaskBrushSize}
          <input
            type="range"
            min={8}
            max={120}
            step={2}
            value={brushSize}
            disabled={interactionMode === "pan"}
            onChange={(e) => setBrushSize(Number(e.currentTarget.value))}
          />
          <span>{brushSize}px</span>
        </label>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }}
        >
          {Locale.SdPanel.ClearMask}
        </button>
        <button type="button" onClick={exportMask}>
          {Locale.SdPanel.SaveMask}
        </button>
      </div>
      <div
        ref={stageRef}
        className={clsx(styles["mask-editor-stage"], {
          [styles["mask-editor-stage-pan"]]: interactionMode === "pan",
          [styles["mask-editor-stage-pan-active"]]: isPanning,
        })}
      >
        <div
          className={styles["mask-editor-stage-inner"]}
          style={{ width: `${zoom * 100}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={props.sourceImage}
            alt="mask-source"
            onLoad={syncCanvasSize}
          />
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              if (interactionMode === "pan") {
                const stage = stageRef.current;
                if (!stage) return;
                panningRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  scrollLeft: stage.scrollLeft,
                  scrollTop: stage.scrollTop,
                };
                setIsPanning(true);
                return;
              }
              drawingRef.current = true;
              paintAtPoint(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (interactionMode === "pan") {
                const stage = stageRef.current;
                const pan = panningRef.current;
                if (!stage || !pan) return;
                stage.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
                stage.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
                return;
              }
              if (!drawingRef.current) return;
              paintAtPoint(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              drawingRef.current = false;
              panningRef.current = null;
              setIsPanning(false);
            }}
            onPointerLeave={() => {
              drawingRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
              panningRef.current = null;
              setIsPanning(false);
            }}
          />
        </div>
      </div>
      <div className={styles["ctrl-param-item-sub-title"]}>
        {Locale.SdPanel.MaskDrawSubTitle}
      </div>
    </div>
  );
}

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
  const currentMode = sdStore.currentMode;
  const setCurrentMode = sdStore.setCurrentMode;
  const editSourceType = sdStore.editSourceType;
  const setEditSourceType = sdStore.setEditSourceType;
  const editSourceImage = sdStore.editSourceImage;
  const editSourceName = sdStore.editSourceName;
  const setEditSourceImage = sdStore.setEditSourceImage;
  const editMaskImage = sdStore.editMaskImage;
  const editMaskName = sdStore.editMaskName;
  const setEditMaskImage = sdStore.setEditMaskImage;
  const currentModel = sdStore.currentModel;
  const setCurrentModel = sdStore.setCurrentModel;
  const params = sdStore.currentParams;
  const setParams = sdStore.setCurrentParams;
  const successfulImages = React.useMemo(
    () =>
      sdStore.draw
        .filter((item: any) => item.status === "success" && !!item.img_data)
        .map((item: any) => ({
          value: item.id,
          name: `${item.model_name} · ${item.created_at}`,
          image: item.img_data,
        })),
    [sdStore.draw],
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const maskFileInputRef = React.useRef<HTMLInputElement>(null);
  const imageModels = React.useMemo(
    () => resolveImageModels(runtimeModels, currentMode),
    [runtimeModels, currentMode],
  );
  const hasImageModels = imageModels.length > 0;

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
  const handleModeChange = (mode: ImageFormMode) => {
    setCurrentMode(mode);
  };
  const handleUploadImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditSourceImage(reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  };
  const handleUploadMask = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditMaskImage(reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  };
  const openMaskPainter = () => {
    if (!editSourceImage) {
      showToast(Locale.Sd.SelectImageFirst);
      return;
    }
    let closeModal = () => {};
    closeModal = showModal({
      title: Locale.SdPanel.DrawMask,
      defaultMax: true,
      children: (
        <MaskPainter
          sourceImage={editSourceImage}
          onSave={(maskDataUrl) =>
            setEditMaskImage(maskDataUrl, Locale.SdPanel.DrawMask)
          }
          onDone={() => closeModal()}
        />
      ),
    });
  };

  return (
    <>
      <ControlParamItem title={Locale.SdPanel.Mode}>
        <Select
          aria-label={Locale.SdPanel.Mode}
          value={currentMode}
          onChange={(e) =>
            handleModeChange(e.currentTarget.value as ImageFormMode)
          }
        >
          <option value="generation">{Locale.SdPanel.Modes.Generation}</option>
          <option value="editing">{Locale.SdPanel.Modes.Editing}</option>
        </Select>
      </ControlParamItem>
      <ControlParamItem title={Locale.SdPanel.AIModel}>
        <Select
          aria-label={Locale.SdPanel.AIModel}
          value={currentModel.value}
          disabled={!hasImageModels}
          onChange={(e) => {
            const model = imageModels.find(
              (item) => item.value === e.currentTarget.value,
            );
            if (model) {
              handleModelChange(model);
            }
          }}
        >
          {hasImageModels ? (
            imageModels.map((item) => (
              <option value={item.value} key={item.value}>
                {item.name}
              </option>
            ))
          ) : (
            <option value="">{Locale.Sd.EmptyRecord}</option>
          )}
        </Select>
      </ControlParamItem>
      {currentMode === "editing" && (
        <ControlParamItem title={Locale.SdPanel.SourceType}>
          <Select
            aria-label={Locale.SdPanel.SourceType}
            value={editSourceType}
            onChange={(e) =>
              setEditSourceType(e.currentTarget.value as "history" | "upload")
            }
          >
            <option value="history">
              {Locale.SdPanel.SourceTypes.History}
            </option>
            <option value="upload">{Locale.SdPanel.SourceTypes.Upload}</option>
          </Select>
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceType === "history" && (
        <ControlParamItem title={Locale.SdPanel.SelectHistory}>
          <Select
            aria-label={Locale.SdPanel.SelectHistory}
            value={
              successfulImages.find((item) => item.image === editSourceImage)
                ?.value || ""
            }
            onChange={(e) => {
              const selected = successfulImages.find(
                (item) => item.value === e.currentTarget.value,
              );
              if (selected) {
                setEditSourceImage(selected.image, selected.name);
              }
            }}
          >
            <option value="">{Locale.Sd.SelectImageFirst}</option>
            {successfulImages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.name}
              </option>
            ))}
          </Select>
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceType === "upload" && (
        <ControlParamItem title={Locale.SdPanel.UploadImage}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleUploadImage(e.target.files?.[0])}
          />
        </ControlParamItem>
      )}
      {currentMode === "editing" && editSourceImage && (
        <ControlParamItem title={editSourceName || Locale.SdPanel.UploadImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={editSourceImage}
            alt={editSourceName || "edit-source"}
            style={{
              width: "100%",
              maxHeight: 180,
              objectFit: "contain",
              borderRadius: 8,
              border: "var(--border-in-light)",
            }}
          />
        </ControlParamItem>
      )}
      {currentMode === "editing" && (
        <ControlParamItem
          title={Locale.SdPanel.MaskImage}
          subTitle={Locale.SdPanel.MaskImageSubTitle}
        >
          <input
            ref={maskFileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleUploadMask(e.target.files?.[0])}
          />
          <div className={styles["mask-actions"]}>
            <button type="button" onClick={openMaskPainter}>
              {Locale.SdPanel.DrawMask}
            </button>
            {editMaskImage && (
              <button
                type="button"
                onClick={() => {
                  setEditMaskImage("", "");
                  if (maskFileInputRef.current) {
                    maskFileInputRef.current.value = "";
                  }
                }}
              >
                {Locale.SdPanel.ClearMask}
              </button>
            )}
          </div>
          {editMaskImage && (
            <div className={styles["mask-preview"]}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={editMaskImage} alt={editMaskName || "edit-mask"} />
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div className={styles["ctrl-param-item-sub-title"]}>
                  {editMaskName || Locale.SdPanel.MaskImage}
                </div>
                <IconButton
                  icon={<DeleteIcon />}
                  bordered
                  title={Locale.Sd.Actions.Delete}
                  onClick={() => {
                    setEditMaskImage("", "");
                    if (maskFileInputRef.current) {
                      maskFileInputRef.current.value = "";
                    }
                  }}
                />
              </div>
            </div>
          )}
        </ControlParamItem>
      )}
      {hasImageModels && (
        <ControlParamItem title={Locale.Sd.SourceLabel}>
          <div>{currentModel.providerName || currentModel.provider || "-"}</div>
          <div className={styles["ctrl-param-item-sub-title"]}>
            {Locale.Sd.EndpointLabel}:{" "}
            {currentMode === "editing"
              ? "/v1/images/edits"
              : "/v1/images/generations"}
          </div>
        </ControlParamItem>
      )}
      {!hasImageModels && (
        <ControlParamItem title={Locale.Sd.NoModelsTitle}>
          <div className={styles["ctrl-param-item-sub-title"]}>
            {Locale.Sd.NoModelsDesc}
          </div>
        </ControlParamItem>
      )}
      {hasImageModels && (
        <ControlParam
          columns={getParams?.(currentModel, params) as any[]}
          data={params}
          onChange={handleValueChange}
        ></ControlParam>
      )}
    </>
  );
}
