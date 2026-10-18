use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const KEYRING_SERVICE: &str = "com.yeying.chat.tool-runtime";
const MCP_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolConfig {
    #[serde(default)]
    pub tool_servers: BTreeMap<String, ServerConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub secret_env_keys: Vec<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub status: String,
    pub error_msg: Option<String>,
}

struct RuntimeInner {
    servers: HashMap<String, McpProcess>,
    errors: HashMap<String, String>,
}

impl Default for RuntimeInner {
    fn default() -> Self {
        Self {
            servers: HashMap::new(),
            errors: HashMap::new(),
        }
    }
}

#[derive(Clone, Default)]
pub struct RuntimeState(Arc<Mutex<RuntimeInner>>);

struct McpProcess {
    child: Child,
    stdin: ChildStdin,
    responses: mpsc::Receiver<String>,
    secrets: Vec<String>,
    next_id: u64,
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl McpProcess {
    fn send_notification(&mut self, method: &str) -> Result<(), String> {
        let message = json!({"jsonrpc":"2.0", "method":method});
        writeln!(self.stdin, "{message}").map_err(|_| "Failed to write to MCP server".to_string())?;
        self.stdin
            .flush()
            .map_err(|_| "Failed to flush MCP server input".to_string())
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = Value::from(self.next_id);
        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        writeln!(self.stdin, "{message}").map_err(|_| "Failed to write to MCP server".to_string())?;
        self.stdin
            .flush()
            .map_err(|_| "Failed to flush MCP server input".to_string())?;

        loop {
            if let Some(status) = self.child.try_wait().map_err(|_| "Failed to inspect MCP server process".to_string())? {
                return Err(format!("MCP server exited with status {status}"));
            }
            let line = self
                .responses
                .recv_timeout(MCP_REQUEST_TIMEOUT)
                .map_err(|_| "MCP server did not respond within 60 seconds".to_string())?;
            let response: Value = serde_json::from_str(&line)
                .map_err(|_| "MCP server returned invalid JSON-RPC data".to_string())?;
            if response.get("id") != Some(&id) {
                continue;
            }
            if let Some(error) = response.get("error") {
                let message = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("MCP server request failed");
                return Err(redact_secrets(message, &self.secrets));
            }
            return response
                .get("result")
                .cloned()
                .ok_or_else(|| "MCP server response did not contain a result".to_string());
        }
    }
}

fn redact_secrets(message: &str, secrets: &[String]) -> String {
    secrets
        .iter()
        .filter(|secret| secret.len() >= 4)
        .fold(message.to_string(), |result, secret| {
            result.replace(secret, "[redacted]")
        })
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|_| "Could not resolve Chat application data directory".to_string())?;
    std::fs::create_dir_all(&path)
        .map_err(|_| "Could not create Chat application data directory".to_string())?;
    path.push("tool_config.json");
    Ok(path)
}

fn read_config(app: &AppHandle) -> Result<ToolConfig, String> {
    let path = config_path(app)?;
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|_| "Desktop tool configuration is invalid JSON".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ToolConfig::default()),
        Err(_) => Err("Could not read desktop tool configuration".to_string()),
    }
}

fn write_config(app: &AppHandle, config: &ToolConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let contents = serde_json::to_vec_pretty(config)
        .map_err(|_| "Could not serialize desktop tool configuration".to_string())?;
    let mut temporary = path.clone();
    temporary.set_extension("json.tmp");
    std::fs::write(&temporary, contents)
        .map_err(|_| "Could not write desktop tool configuration".to_string())?;
    std::fs::rename(&temporary, &path)
        .map_err(|_| "Could not save desktop tool configuration".to_string())
}

fn validate_server_id(server_id: &str) -> Result<(), String> {
    if server_id.is_empty()
        || server_id.len() > 80
        || !server_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err("Tool server id is invalid".to_string());
    }
    Ok(())
}

fn validate_config(config: &ServerConfig) -> Result<(), String> {
    let command_name = std::path::Path::new(&config.command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let allowed_commands = [
        "node",
        "npm",
        "npx",
        "pnpm",
        "python",
        "python3",
        "uv",
        "uvx",
        "mcp-server-git",
        "mcp-server-fetch",
        "mcp-server-time",
    ];
    if config.command.trim().is_empty()
        || config.command.len() > 256
        || !allowed_commands.contains(&command_name.as_str())
    {
        return Err("Tool server command is invalid".to_string());
    }
    if config.args.len() > 256 || config.args.iter().any(|arg| arg.len() > 8192) {
        return Err("Tool server arguments exceed the supported size".to_string());
    }
    if config.env.iter().any(|(key, value)| {
        key.is_empty()
            || key.len() > 128
            || !key
                .bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
            || value.len() > 32768
    }) {
        return Err("Tool server environment configuration is invalid".to_string());
    }
    Ok(())
}

fn credential_entry(server_id: &str, env_key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &format!("{server_id}:{env_key}"))
        .map_err(|_| "Could not access the operating system credential store".to_string())
}

fn save_secrets(
    server_id: &str,
    config: &mut ServerConfig,
    previous: Option<&ServerConfig>,
) -> Result<(), String> {
    let secret_keys = config
        .secret_env_keys
        .iter()
        .filter(|key| config.env.contains_key(*key) || previous.is_some_and(|old| old.secret_env_keys.contains(key)))
        .cloned()
        .collect::<HashSet<_>>();

    for key in &secret_keys {
        let value = config.env.get(key).map(String::as_str).unwrap_or_default();
        if !value.is_empty() {
            credential_entry(server_id, key)?
                .set_password(value)
                .map_err(|_| "Could not save a credential to the operating system credential store".to_string())?;
        }
    }

    let old_keys = previous
        .map(|old| old.secret_env_keys.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();
    for key in old_keys.difference(&secret_keys) {
        delete_secret(server_id, key)?;
    }

    config.secret_env_keys = secret_keys.into_iter().collect();
    config.secret_env_keys.sort();
    for key in &config.secret_env_keys {
        config.env.remove(key);
    }
    Ok(())
}

fn delete_secret(server_id: &str, env_key: &str) -> Result<(), String> {
    match credential_entry(server_id, env_key)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove a credential from the operating system credential store".to_string()),
    }
}

fn spawn_server(server_id: &str, config: &ServerConfig) -> Result<McpProcess, String> {
    validate_server_id(server_id)?;
    validate_config(config)?;

    let mut command = Command::new(&config.command);
    command
        .args(&config.args)
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    for (key, value) in std::env::vars() {
        if matches!(
            key.as_str(),
            "PATH" | "HOME" | "USER" | "LOGNAME" | "TMPDIR" | "TMP" | "TEMP" | "LANG"
                | "LC_ALL" | "SYSTEMROOT" | "WINDIR" | "USERPROFILE" | "APPDATA"
                | "LOCALAPPDATA" | "COMSPEC" | "PATHEXT"
        ) {
            command.env(key, value);
        }
    }

    let mut secrets = Vec::new();
    for key in &config.secret_env_keys {
        match credential_entry(server_id, key)?.get_password() {
            Ok(value) => {
                command.env(key, &value);
                secrets.push(value);
            }
            Err(KeyringError::NoEntry) => {}
            Err(_) => return Err("Could not read a credential from the operating system credential store".to_string()),
        }
    }
    command.envs(&config.env);

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!("Command '{}' was not found. Install its runtime yourself and make it available on PATH.", config.command)
        } else {
            format!("Could not start tool server command '{}'. Check its permissions and dependencies.", config.command)
        }
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not open MCP server input".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not open MCP server output".to_string())?;
    let (sender, responses) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) => {
                    if sender.send(line).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let mut process = McpProcess {
        child,
        stdin,
        responses,
        secrets,
        next_id: 0,
    };
    process.request(
        "initialize",
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name":"chat-desktop", "version": env!("CARGO_PKG_VERSION")}
        }),
    )?;
    process.send_notification("notifications/initialized")?;
    Ok(process)
}

fn start_server(
    app: &AppHandle,
    state: &RuntimeState,
    server_id: &str,
    config: &ServerConfig,
) -> Result<(), String> {
    {
        let inner = state
            .0
            .lock()
            .map_err(|_| "Tool runtime state is unavailable".to_string())?;
        if inner.servers.contains_key(server_id) {
            return Ok(());
        }
    }
    match spawn_server(server_id, config) {
        Ok(process) => {
            let mut inner = state
                .0
                .lock()
                .map_err(|_| "Tool runtime state is unavailable".to_string())?;
            inner.errors.remove(server_id);
            inner.servers.insert(server_id.to_string(), process);
            Ok(())
        }
        Err(error) => {
            if let Ok(mut inner) = state.0.lock() {
                inner.errors.insert(server_id.to_string(), error.clone());
            }
            let mut config = read_config(app)?;
            if let Some(server) = config.tool_servers.get_mut(server_id) {
                server.status = Some("error".to_string());
                let _ = write_config(app, &config);
            }
            Err(error)
        }
    }
}

fn stop_server(state: &RuntimeState, server_id: &str) -> Result<(), String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "Tool runtime state is unavailable".to_string())?;
    inner.errors.remove(server_id);
    inner.servers.remove(server_id);
    Ok(())
}

async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| "Tool runtime worker failed".to_string())?
}

#[tauri::command]
pub async fn tool_get_config(app: AppHandle) -> Result<ToolConfig, String> {
    run_blocking(move || read_config(&app)).await
}

#[tauri::command]
pub async fn tool_initialize(app: AppHandle, state: State<'_, RuntimeState>) -> Result<ToolConfig, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let config = read_config(&app)?;
        for (server_id, server_config) in &config.tool_servers {
            if server_config.status.as_deref() == Some("paused") {
                continue;
            }
            let _ = start_server(&app, &state, server_id, server_config);
        }
        read_config(&app)
    })
    .await
}

#[tauri::command]
pub async fn tool_get_status(app: AppHandle, state: State<'_, RuntimeState>) -> Result<HashMap<String, ServerStatus>, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let config = read_config(&app)?;
        let mut inner = state
            .0
            .lock()
            .map_err(|_| "Tool runtime state is unavailable".to_string())?;
        let dead_servers = inner
            .servers
            .iter_mut()
            .filter_map(|(id, process)| match process.child.try_wait() {
                Ok(Some(status)) => Some((id.clone(), format!("MCP server exited with status {status}"))),
                Ok(None) => None,
                Err(_) => Some((id.clone(), "Could not inspect MCP server process".to_string())),
            })
            .collect::<Vec<_>>();
        for (id, error) in dead_servers {
            inner.servers.remove(&id);
            inner.errors.insert(id, error);
        }
        Ok(config
            .tool_servers
            .iter()
            .map(|(id, server)| {
                let status = if inner.servers.contains_key(id) {
                    ServerStatus { status: "active".to_string(), error_msg: None }
                } else if server.status.as_deref() == Some("paused") {
                    ServerStatus { status: "paused".to_string(), error_msg: None }
                } else if let Some(error) = inner.errors.get(id) {
                    ServerStatus { status: "error".to_string(), error_msg: Some(error.clone()) }
                } else {
                    ServerStatus { status: "undefined".to_string(), error_msg: None }
                };
                (id.clone(), status)
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn tool_add_server(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    server_id: String,
    mut config: ServerConfig,
    confirmed: bool,
) -> Result<ToolConfig, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        if !confirmed {
            return Err("Adding a local tool server requires explicit confirmation".to_string());
        }
        validate_server_id(&server_id)?;
        validate_config(&config)?;
        let mut current = read_config(&app)?;
        let previous = current.tool_servers.get(&server_id).cloned();
        save_secrets(&server_id, &mut config, previous.as_ref())?;
        config.status = Some("active".to_string());
        current.tool_servers.insert(server_id.clone(), config.clone());
        write_config(&app, &current)?;
        stop_server(&state, &server_id)?;
        start_server(&app, &state, &server_id, &config)?;
        read_config(&app)
    })
    .await
}

#[tauri::command]
pub async fn tool_pause_server(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    server_id: String,
) -> Result<ToolConfig, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let mut config = read_config(&app)?;
        let server = config
            .tool_servers
            .get_mut(&server_id)
            .ok_or_else(|| format!("Tool server '{server_id}' is not configured"))?;
        server.status = Some("paused".to_string());
        write_config(&app, &config)?;
        stop_server(&state, &server_id)?;
        read_config(&app)
    })
    .await
}

#[tauri::command]
pub async fn tool_resume_server(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    server_id: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let mut config = read_config(&app)?;
        let server = config
            .tool_servers
            .get_mut(&server_id)
            .ok_or_else(|| format!("Tool server '{server_id}' is not configured"))?;
        server.status = Some("active".to_string());
        let server = server.clone();
        write_config(&app, &config)?;
        start_server(&app, &state, &server_id, &server)
    })
    .await
}

#[tauri::command]
pub async fn tool_remove_server(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    server_id: String,
) -> Result<ToolConfig, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let mut config = read_config(&app)?;
        let server = config
            .tool_servers
            .remove(&server_id)
            .ok_or_else(|| format!("Tool server '{server_id}' is not configured"))?;
        write_config(&app, &config)?;
        stop_server(&state, &server_id)?;
        for key in server.secret_env_keys {
            delete_secret(&server_id, &key)?;
        }
        read_config(&app)
    })
    .await
}

#[tauri::command]
pub async fn tool_restart_all(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<ToolConfig, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let mut config = read_config(&app)?;
        let ids = config.tool_servers.keys().cloned().collect::<Vec<_>>();
        for id in &ids {
            stop_server(&state, id)?;
        }
        for id in ids {
            if let Some(server) = config.tool_servers.get_mut(&id) {
                if server.status.as_deref() != Some("paused") {
                    server.status = Some("active".to_string());
                    let server = server.clone();
                    write_config(&app, &config)?;
                    let _ = start_server(&app, &state, &id, &server);
                }
            }
        }
        read_config(&app)
    })
    .await
}

#[tauri::command]
pub async fn tool_get_client_tools(
    state: State<'_, RuntimeState>,
    server_id: String,
) -> Result<Value, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        let mut inner = state
            .0
            .lock()
            .map_err(|_| "Tool runtime state is unavailable".to_string())?;
        let process = inner
            .servers
            .get_mut(&server_id)
            .ok_or_else(|| format!("Tool server '{server_id}' is not running"))?;
        process.request("tools/list", json!({}))
    })
    .await
}

#[tauri::command]
pub async fn tool_execute_request(
    state: State<'_, RuntimeState>,
    server_id: String,
    request: Value,
) -> Result<Value, String> {
    let state = state.inner().clone();
    run_blocking(move || {
        if request.get("method").and_then(Value::as_str) != Some("tools/call") {
            return Err("Only MCP tools/call requests are supported".to_string());
        }
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let mut inner = state
            .0
            .lock()
            .map_err(|_| "Tool runtime state is unavailable".to_string())?;
        let process = inner
            .servers
            .get_mut(&server_id)
            .ok_or_else(|| format!("Tool server '{server_id}' is not running"))?;
        process.request("tools/call", params)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::redact_secrets;

    #[test]
    fn redacts_credentials_from_server_errors() {
        let message = redact_secrets(
            "request failed for token abcdef123456",
            &["abcdef123456".to_string()],
        );
        assert_eq!(message, "request failed for token [redacted]");
    }
}
