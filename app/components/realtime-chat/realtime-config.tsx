import {
  DEFAULT_OPENAI_REALTIME_MODEL,
  DEFAULT_OPENAI_REALTIME_VOICE,
  DEFAULT_ROUTER_REALTIME_MODEL,
  DEFAULT_ROUTER_REALTIME_VOICE,
  REALTIME_ROUTER_PROVIDER,
  type RealtimeConfig,
  type RealtimeProvider,
  isRouterRealtimeProvider,
} from "@/app/store/realtime";

import Locale from "@/app/locales";
import { ListItem, Select, PasswordInput } from "@/app/components/ui-lib";

import { InputRange } from "@/app/components/input-range";
import { ServiceProvider } from "@/app/constant";

const providers = [
  REALTIME_ROUTER_PROVIDER,
  ServiceProvider.OpenAI,
  ServiceProvider.Azure,
];

const models = [
  DEFAULT_ROUTER_REALTIME_MODEL,
  "qwen3.5-omni-flash-realtime",
  "qwen3-omni-flash-realtime",
  "qwen-omni-turbo-realtime",
  DEFAULT_OPENAI_REALTIME_MODEL,
];

const voices = [
  DEFAULT_ROUTER_REALTIME_VOICE,
  "Cherry",
  "Serena",
  "Ethan",
  DEFAULT_OPENAI_REALTIME_VOICE,
  "shimmer",
  "echo",
];

function applyProviderDefaults(
  config: RealtimeConfig,
  provider: RealtimeProvider,
) {
  config.provider = provider;

  if (isRouterRealtimeProvider(provider)) {
    if (
      !config.model ||
      config.model === DEFAULT_OPENAI_REALTIME_MODEL ||
      config.model.startsWith("gpt-")
    ) {
      config.model = DEFAULT_ROUTER_REALTIME_MODEL;
    }
    if (!config.voice || ["alloy", "shimmer", "echo"].includes(config.voice)) {
      config.voice = DEFAULT_ROUTER_REALTIME_VOICE;
    }
    return;
  }

  if (provider === ServiceProvider.OpenAI) {
    if (!config.model || config.model.startsWith("qwen")) {
      config.model = DEFAULT_OPENAI_REALTIME_MODEL;
    }
    if (!config.voice || config.voice === DEFAULT_ROUTER_REALTIME_VOICE) {
      config.voice = DEFAULT_OPENAI_REALTIME_VOICE;
    }
  }
}

export function RealtimeConfigList(props: {
  realtimeConfig: RealtimeConfig;
  updateConfig: (updater: (config: RealtimeConfig) => void) => void;
  showEnable?: boolean;
}) {
  const isRouter = isRouterRealtimeProvider(props.realtimeConfig.provider);

  const azureConfigComponent = props.realtimeConfig.provider ===
    ServiceProvider.Azure && (
    <>
      <ListItem
        title={Locale.Settings.Realtime.Azure.Endpoint.Title}
        subTitle={Locale.Settings.Realtime.Azure.Endpoint.SubTitle}
      >
        <input
          value={props.realtimeConfig?.azure?.endpoint}
          type="text"
          placeholder={Locale.Settings.Realtime.Azure.Endpoint.Title}
          onChange={(e) => {
            props.updateConfig(
              (config) => (config.azure.endpoint = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Realtime.Azure.Deployment.Title}
        subTitle={Locale.Settings.Realtime.Azure.Deployment.SubTitle}
      >
        <input
          value={props.realtimeConfig?.azure?.deployment}
          type="text"
          placeholder={Locale.Settings.Realtime.Azure.Deployment.Title}
          onChange={(e) => {
            props.updateConfig(
              (config) => (config.azure.deployment = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  const routerConfigComponent = isRouter && (
    <>
      <ListItem
        title={Locale.Settings.Realtime.Router.Endpoint.Title}
        subTitle={Locale.Settings.Realtime.Router.Endpoint.SubTitle}
      >
        <input
          value={props.realtimeConfig?.router?.endpoint}
          type="text"
          placeholder={Locale.Settings.Realtime.Router.Endpoint.Placeholder}
          onChange={(e) => {
            props.updateConfig(
              (config) => (config.router.endpoint = e.currentTarget.value),
            );
          }}
        />
      </ListItem>
    </>
  );

  return (
    <>
      {props.showEnable !== false && (
        <ListItem
          title={Locale.Settings.Realtime.Enable.Title}
          subTitle={Locale.Settings.Realtime.Enable.SubTitle}
        >
          <input
            type="checkbox"
            checked={props.realtimeConfig.enabled}
            onChange={(e) =>
              props.updateConfig(
                (config) => (config.enabled = e.currentTarget.checked),
              )
            }
          ></input>
        </ListItem>
      )}

      {props.realtimeConfig.enabled && (
        <>
          <ListItem
            title={Locale.Settings.Realtime.Provider.Title}
            subTitle={Locale.Settings.Realtime.Provider.SubTitle}
          >
            <Select
              aria-label={Locale.Settings.Realtime.Provider.Title}
              value={props.realtimeConfig.provider}
              onChange={(e) => {
                props.updateConfig((config) =>
                  applyProviderDefaults(
                    config,
                    e.target.value as RealtimeProvider,
                  ),
                );
              }}
            >
              {providers.map((v, i) => (
                <option value={v} key={i}>
                  {v}
                </option>
              ))}
            </Select>
          </ListItem>
          <ListItem
            title={Locale.Settings.Realtime.Model.Title}
            subTitle={Locale.Settings.Realtime.Model.SubTitle}
          >
            <input
              list="realtime-model-options"
              aria-label={Locale.Settings.Realtime.Model.Title}
              value={props.realtimeConfig.model}
              onChange={(e) => {
                props.updateConfig(
                  (config) => (config.model = e.currentTarget.value),
                );
              }}
            />
            <datalist id="realtime-model-options">
              {models.map((v, i) => (
                <option value={v} key={i}>
                  {v}
                </option>
              ))}
            </datalist>
          </ListItem>
          <ListItem
            title={
              isRouter
                ? Locale.Settings.Realtime.Router.Token.Title
                : Locale.Settings.Realtime.ApiKey.Title
            }
            subTitle={
              isRouter
                ? Locale.Settings.Realtime.Router.Token.SubTitle
                : Locale.Settings.Realtime.ApiKey.SubTitle
            }
          >
            <PasswordInput
              aria={Locale.Settings.ShowPassword}
              aria-label={
                isRouter
                  ? Locale.Settings.Realtime.Router.Token.Title
                  : Locale.Settings.Realtime.ApiKey.Title
              }
              value={props.realtimeConfig.apiKey}
              type="text"
              placeholder={
                isRouter
                  ? Locale.Settings.Realtime.Router.Token.Placeholder
                  : Locale.Settings.Realtime.ApiKey.Placeholder
              }
              onChange={(e) => {
                props.updateConfig(
                  (config) => (config.apiKey = e.currentTarget.value),
                );
              }}
            />
          </ListItem>
          {routerConfigComponent}
          {azureConfigComponent}
          <ListItem
            title={Locale.Settings.TTS.Voice.Title}
            subTitle={Locale.Settings.TTS.Voice.SubTitle}
          >
            <input
              list="realtime-voice-options"
              value={props.realtimeConfig.voice}
              onChange={(e) => {
                props.updateConfig(
                  (config) => (config.voice = e.currentTarget.value),
                );
              }}
            />
            <datalist id="realtime-voice-options">
              {voices.map((v, i) => (
                <option value={v} key={i}>
                  {v}
                </option>
              ))}
            </datalist>
          </ListItem>
          <ListItem
            title={Locale.Settings.Realtime.Temperature.Title}
            subTitle={Locale.Settings.Realtime.Temperature.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.Temperature.Title}
              value={props.realtimeConfig?.temperature?.toFixed(1)}
              min="0.6"
              max="1"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.temperature = e.currentTarget.valueAsNumber),
                );
              }}
            ></InputRange>
          </ListItem>
        </>
      )}
    </>
  );
}
