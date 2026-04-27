use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
struct CommandResult {
    ok: bool,
    message: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

#[derive(Serialize)]
struct DesktopConfig {
    raw: String,
    path: String,
}

fn repo_root() -> Result<PathBuf, String> {
    std::env::current_dir().map_err(|error| error.to_string())
}

fn notify_review_finished(app: &tauri::AppHandle, result: &CommandResult) {
    let title = if result.ok {
        "CodeAgora review completed"
    } else {
        "CodeAgora review failed"
    };
    let body = match &result.session_id {
        Some(session_id) if result.ok => format!("Session {session_id} is ready to inspect."),
        Some(session_id) => format!("Session {session_id} ended with errors."),
        None if result.ok => "The review finished successfully.".to_string(),
        None => "The review ended with errors.".to_string(),
    };

    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
fn list_sessions() -> Result<serde_json::Value, String> {
    let output = Command::new("agora")
        .args(["sessions", "list", "--json"])
        .current_dir(repo_root()?)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_session_detail(id: String) -> Result<serde_json::Value, String> {
    let output = Command::new("agora")
        .args(["sessions", "show", &id, "--json"])
        .current_dir(repo_root()?)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[tauri::command]
fn run_review(app: tauri::AppHandle, staged: bool) -> Result<CommandResult, String> {
    let mut args = vec!["review", "--json-stream"];
    if staged {
        args.push("--staged");
    }

    let output = Command::new("agora")
        .args(args)
        .current_dir(repo_root()?)
        .output()
        .map_err(|error| error.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout.lines().last().unwrap_or("");
    let session_id = serde_json::from_str::<serde_json::Value>(last_line)
        .ok()
        .and_then(|value| value.get("sessionId").and_then(|id| id.as_str()).map(str::to_owned));

    let result = CommandResult {
        ok: output.status.success(),
        message: if output.status.success() {
            "Review completed.".to_string()
        } else {
            String::from_utf8_lossy(&output.stderr).to_string()
        },
        session_id,
    };

    notify_review_finished(&app, &result);

    Ok(result)
}

#[tauri::command]
fn read_config() -> Result<DesktopConfig, String> {
    let path = repo_root()?.join(".ca").join("config.json");
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(DesktopConfig {
        raw,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn write_config(raw: String) -> Result<DesktopConfig, String> {
    serde_json::from_str::<serde_json::Value>(&raw).map_err(|error| error.to_string())?;
    let path = repo_root()?.join(".ca").join("config.json");
    fs::write(&path, &raw).map_err(|error| error.to_string())?;
    Ok(DesktopConfig {
        raw,
        path: path.display().to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            get_session_detail,
            run_review,
            read_config,
            write_config
        ])
        .run(tauri::generate_context!())
        .expect("failed to run CodeAgora desktop app");
}
