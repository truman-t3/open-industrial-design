// SPDX-License-Identifier: MPL-2.0
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod storage;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let executable = std::env::current_exe()?;
            let folder = executable.parent().ok_or("Application folder unavailable")?;
            let portable = folder.join("portable.mode");
            let data = if portable.exists() {
                if std::fs::read_to_string(&portable)? != "Open Industrial Design portable v1\n" {
                    return Err("Invalid portable mode marker".into());
                }
                folder.join("Open Industrial Design Data")
            } else {
                app.path().app_local_data_dir()?.join("workspace")
            };
            let profile = storage::prepare(&data)?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Open Industrial Design")
                .inner_size(1440.0, 960.0)
                .min_inner_size(900.0, 650.0)
                .data_directory(profile)
                .disable_drag_drop_handler()
                .on_navigation(|url| {
                    (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                        || (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Open Industrial Design could not start; existing project data was not removed");
}
