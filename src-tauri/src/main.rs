// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod stream;
mod log;
mod tools;

fn main() {
    tauri::Builder::default()
        // Register this first so a second app launch is forwarded to the
        // existing process instead of opening a second window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(tools::RuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            stream::stream_fetch,
            log::append_log,
            tools::tool_get_config,
            tools::tool_initialize,
            tools::tool_get_status,
            tools::tool_add_server,
            tools::tool_pause_server,
            tools::tool_resume_server,
            tools::tool_remove_server,
            tools::tool_restart_all,
            tools::tool_get_client_tools,
            tools::tool_execute_request
        ])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
