// SPDX-License-Identifier: MPL-2.0
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::{Path, PathBuf}, process::Command, sync::{Arc, Mutex}};
use std::os::windows::process::CommandExt;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const PAYLOAD: &[u8] = include_bytes!(env!("OID_NSIS_PAYLOAD"));
const APP_HASH: &str = env!("OID_APP_SHA256");
const APP_EXE: &str = "open-industrial-design-desktop.exe";
const OWNER: &str = "Open Industrial Design installation v1\n";
#[derive(Default)]
struct Run { busy: bool, cancelled: bool, can_cancel: bool, id: String, verified: Option<PathBuf> }
type Shared = Arc<Mutex<Run>>;

fn target(path: &str) -> Result<PathBuf, String> {
    if path.chars().any(|c| "\"\r\n|<>?*".contains(c)) || path.starts_with("\\\\") {
        return Err("invalid-target".into());
    }
    let path = PathBuf::from(path);
    if !path.is_absolute() || path.file_name().is_none() || path.parent().is_none() {
        return Err("invalid-target".into());
    }
    for part in path.ancestors() {
        if let Ok(meta) = fs::symlink_metadata(part) {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 { return Err("invalid-target".into()); }
        }
    }
    if path.exists() && fs::read_dir(&path).map_err(|_| "permission-denied")?.next().is_some()
        && fs::read_to_string(path.join(".oid-install")).ok().as_deref() != Some(OWNER) {
        return Err("unowned-target".into());
    }
    Ok(path)
}

fn verified(path: &Path) -> bool {
    fs::read(path.join(APP_EXE)).map(|bytes| format!("{:x}", Sha256::digest(bytes)) == APP_HASH).unwrap_or(false)
}

#[tauri::command]
fn configuration(app: tauri::AppHandle) -> Result<(String, String), String> {
    let path = app.path().app_local_data_dir().map_err(|_| "permission-denied")?
        .with_file_name("Open Industrial Design");
    Ok((path.to_string_lossy().into_owned(), env!("CARGO_PKG_VERSION").into()))
}

#[tauri::command]
fn cancel_install(state: tauri::State<'_, Shared>) -> bool {
    let mut state = state.lock().unwrap();
    if state.busy && state.can_cancel { state.cancelled = true; true } else { false }
}

fn execute(app: &tauri::AppHandle, shared: &Shared, id: &str, destination: &Path) -> Result<(), String> {
    let mut sequence = 0u64;
    let mut progress = |stage: &str, done: usize, total: usize| {
        sequence += 1;
        let _ = app.emit("installer-progress", (id, sequence, stage, done, total));
    };
    progress("preparing", 0, 0);
    let temporary = std::env::temp_dir().join(format!("oid-setup-{}-{}", std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir(&temporary).map_err(|_| "permission-denied")?;
    let engine = temporary.join("setup.exe");
    let result = (|| {
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&engine).map_err(|_| "permission-denied")?;
        let mut completed = 0;
        for chunk in PAYLOAD.chunks(1024 * 1024) {
            if shared.lock().unwrap().cancelled { return Err("cancelled".into()); }
            output.write_all(chunk).map_err(|_| "disk-full")?;
            completed += chunk.len();
            progress("extracting", completed, PAYLOAD.len());
        }
        output.sync_all().map_err(|_| "disk-full")?;
        drop(output);
        let extracted = fs::read(&engine).map_err(|_| "verification-failed")?;
        if Sha256::digest(&extracted) != Sha256::digest(PAYLOAD) { return Err("verification-failed".into()); }
        {
            let mut state = shared.lock().unwrap();
            if state.cancelled { return Err("cancelled".into()); }
            state.can_cancel = false;
        }
        // Recheck ownership immediately before the engine can write files.
        target(&destination.to_string_lossy())?;
        fs::create_dir_all(destination).map_err(|_| "permission-denied")?;
        let marker = destination.join(".oid-install");
        if !marker.exists() {
            fs::OpenOptions::new().write(true).create_new(true).open(&marker)
                .and_then(|mut file| file.write_all(OWNER.as_bytes())).map_err(|_| "permission-denied")?;
        }
        progress("installing", 0, 0);
        // NSIS requires /D to be the final, unquoted argument. There is no shell;
        // quotes/newlines are rejected above and no command text is accepted.
        let status = Command::new(&engine).arg("/S")
            .raw_arg(format!("/D={}", destination.display()))
            .creation_flags(0x08000000).status().map_err(|_| "engine-failed")?;
        if !status.success() { return Err("engine-failed".into()); }
        progress("verifying", 0, 0);
        if !verified(destination) { return Err("verification-failed".into()); }
        fs::write(destination.join(".oid-install"), OWNER).map_err(|_| "permission-denied")?;
        shared.lock().unwrap().verified = Some(destination.to_owned());
        Ok(())
    })();
    // Only files created by this invocation are cleaned; never recurse or touch
    // the destination, user projects, API settings or previous installations.
    let _ = fs::remove_file(&engine);
    let _ = fs::remove_dir(&temporary);
    result
}

#[tauri::command]
async fn install(app: tauri::AppHandle, state: tauri::State<'_, Shared>, run_id: String, destination: String) -> Result<(), String> {
    if run_id.len() < 8 || run_id.len() > 80 || !run_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') { return Err("invalid-run".into()); }
    let destination = target(&destination)?;
    let shared = state.inner().clone();
    {
        let mut state = shared.lock().unwrap();
        if state.busy || state.id == run_id { return Err("already-running".into()); }
        *state = Run { busy: true, cancelled: false, can_cancel: true, id: run_id.clone(), verified: None };
    }
    let worker_state = shared.clone();
    let result = tauri::async_runtime::spawn_blocking(move || execute(&app, &worker_state, &run_id, &destination)).await;
    shared.lock().unwrap().busy = false;
    result.map_err(|_| "engine-failed".to_string())?
}

#[tauri::command]
fn launch_installed(state: tauri::State<'_, Shared>) -> Result<(), String> {
    let state = state.lock().unwrap();
    let path = state.verified.as_ref().ok_or("verification-failed")?;
    if state.busy || !verified(path) { return Err("verification-failed".into()); }
    Command::new(path.join(APP_EXE)).spawn().map_err(|_| "launch-failed")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_roots_network_paths_and_argument_injection() {
        for value in ["C:\\", "relative", "\\\\server\\share", "C:\\app\" /evil", "C:\\app\n/evil"] {
            assert!(target(value).is_err(), "{value}");
        }
    }
    #[test]
    fn refuses_foreign_contents_and_accepts_owned_retry_without_deleting_data() {
        let root = std::env::temp_dir().join(format!("oid-installer-test-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        assert!(target(&root.to_string_lossy()).is_ok());
        fs::write(root.join("sentinel"), b"keep").unwrap();
        assert!(target(&root.to_string_lossy()).is_err());
        fs::write(root.join(".oid-install"), OWNER).unwrap();
        assert!(target(&root.to_string_lossy()).is_ok());
        assert!(!verified(&root));
        assert_eq!(fs::read(root.join("sentinel")).unwrap(), b"keep");
        for name in ["sentinel", ".oid-install"] { fs::remove_file(root.join(name)).unwrap(); }
        fs::remove_dir(root).unwrap();
    }
}

fn main() {
    let shared: Shared = Arc::new(Mutex::new(Run::default()));
    let closing = shared.clone();
    tauri::Builder::default().manage(shared)
        .invoke_handler(tauri::generate_handler![configuration, install, cancel_install, launch_installed])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("index.html".into()))
                .title("Open Industrial Design Setup").inner_size(1200.0, 780.0).min_inner_size(900.0, 650.0)
                .on_navigation(|url| url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny).build()?;
            Ok(())
        })
        .on_window_event(move |_, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if closing.lock().unwrap().busy { api.prevent_close(); }
            }
        })
        .run(tauri::generate_context!("installer.conf.json"))
        .expect("Installer could not start; use the standard installer if WebView2 is unavailable");
}
