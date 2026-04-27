use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
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

#[derive(Serialize)]
struct RepoInfo {
    path: String,
}

fn repo_root() -> Result<PathBuf, String> {
    std::env::current_dir().map_err(|error| error.to_string())
}

fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
}

fn read_optional_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok().filter(|raw| !raw.trim().is_empty())
}

fn session_parts(id: &str) -> Result<(&str, &str), String> {
    let mut parts = id.split('/');
    let date = parts.next().unwrap_or_default();
    let session_id = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || !date.chars().all(|char| char.is_ascii_digit() || char == '-')
        || !session_id.chars().all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
        || date.is_empty()
        || session_id.is_empty()
    {
        return Err(format!("Invalid session id: {id}"));
    }
    Ok((date, session_id))
}

fn sessions_root() -> Result<PathBuf, String> {
    Ok(repo_root()?.join(".ca").join("sessions"))
}

fn session_dir(id: &str) -> Result<PathBuf, String> {
    let (date, session_id) = session_parts(id)?;
    Ok(sessions_root()?.join(date).join(session_id))
}

fn status_from_metadata(metadata: Option<&Value>) -> String {
    metadata
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string()
}

fn updated_at_from_metadata(metadata: Option<&Value>) -> Option<String> {
    let millis = metadata
        .and_then(|value| value.get("completedAt").or_else(|| value.get("startedAt")).or_else(|| value.get("timestamp")))
        .and_then(Value::as_i64)?;
    Some(millis.to_string())
}

fn issue_objects(verdict: Option<&Value>) -> Vec<Value> {
    let Some(verdict) = verdict else {
        return Vec::new();
    };
    ["issues", "findings", "items"]
        .iter()
        .find_map(|key| verdict.get(key).and_then(Value::as_array))
        .cloned()
        .unwrap_or_default()
}

fn severity_counts(issues: &[Value]) -> Value {
    let mut counts = serde_json::Map::new();
    for issue in issues {
        let severity = issue
            .get("severity")
            .and_then(Value::as_str)
            .unwrap_or("SUGGESTION");
        let current = counts.get(severity).and_then(Value::as_u64).unwrap_or(0);
        counts.insert(severity.to_string(), json!(current + 1));
    }
    Value::Object(counts)
}

fn top_issues(issues: &[Value]) -> Vec<Value> {
    issues
        .iter()
        .take(5)
        .map(|issue| {
            let line = issue
                .get("line")
                .and_then(Value::as_i64)
                .or_else(|| issue.get("lineNumber").and_then(Value::as_i64))
                .unwrap_or(0);
            let line_range = issue
                .get("lineRange")
                .and_then(Value::as_array)
                .and_then(|range| {
                    let start = range.first().and_then(Value::as_i64)?;
                    let end = range.get(1).and_then(Value::as_i64).unwrap_or(start);
                    Some(json!([start, end]))
                })
                .unwrap_or_else(|| json!([line, line]));
            json!({
                "severity": issue.get("severity").and_then(Value::as_str).unwrap_or("SUGGESTION"),
                "filePath": issue.get("filePath")
                    .or_else(|| issue.get("file"))
                    .or_else(|| issue.get("path"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                "lineRange": line_range,
                "title": issue.get("title")
                    .or_else(|| issue.get("description"))
                    .or_else(|| issue.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("Untitled finding"),
                "confidence": issue.get("confidence").cloned().unwrap_or(Value::Null)
            })
        })
        .collect()
}

fn session_entry(date: &str, session_id: &str, dir: &Path, metadata: Option<&Value>, verdict: Option<&Value>) -> Value {
    let id = format!("{date}/{session_id}");
    let issues = issue_objects(verdict);
    json!({
        "id": id,
        "date": date,
        "sessionId": session_id,
        "status": status_from_metadata(metadata),
        "dirPath": dir.display().to_string(),
        "decision": verdict
            .and_then(|value| value.get("decision").or_else(|| value.get("verdict")))
            .and_then(Value::as_str),
        "reasoning": verdict
            .and_then(|value| value.get("reasoning").or_else(|| value.get("summary")))
            .and_then(Value::as_str),
        "severityCounts": severity_counts(&issues),
        "topIssues": top_issues(&issues),
        "updatedAt": updated_at_from_metadata(metadata),
    })
}

fn session_detail_value(id: &str) -> Result<Value, String> {
    let dir = session_dir(id)?;
    if !dir.is_dir() {
        return Err(format!("Session not found: {id}"));
    }

    let (date, session_id) = session_parts(id)?;
    let metadata = read_json(&dir.join("metadata.json"));
    let verdict = read_json(&dir.join("head-verdict.json"));
    let markdown = read_optional_text(&dir.join("report.md"))
        .or_else(|| read_optional_text(&dir.join("result.md")))
        .or_else(|| read_optional_text(&dir.join("suggestions.md")));
    let evidence_count = fs::read_dir(dir.join("reviews")).map(|entries| entries.count()).unwrap_or(0);
    let discussions_count = fs::read_dir(dir.join("discussions")).map(|entries| entries.count()).unwrap_or(0);

    Ok(json!({
        "entry": session_entry(date, session_id, &dir, metadata.as_ref(), verdict.as_ref()),
        "metadata": metadata,
        "verdict": verdict,
        "markdown": markdown,
        "evidenceCount": evidence_count,
        "discussionsCount": discussions_count,
    }))
}

fn run_agora(args: &[&str]) -> io::Result<std::process::Output> {
    let root = repo_root().map_err(io::Error::other)?;
    match Command::new("agora").args(args).current_dir(&root).output() {
        Ok(output) => Ok(output),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Command::new("pnpm")
            .args(["exec", "agora"])
            .args(args)
            .current_dir(root)
            .output(),
        Err(error) => Err(error),
    }
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
fn get_repo_info() -> Result<RepoInfo, String> {
    Ok(RepoInfo {
        path: repo_root()?.display().to_string(),
    })
}

#[tauri::command]
fn list_sessions() -> Result<Value, String> {
    let root = sessions_root()?;
    if !root.exists() {
        return Ok(json!({ "schemaVersion": "codeagora.review.v1", "sessions": [] }));
    }

    let mut sessions = Vec::new();
    let mut date_dirs = fs::read_dir(&root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();
    date_dirs.sort_by_key(|entry| entry.file_name());
    date_dirs.reverse();

    for date_entry in date_dirs {
        let date = date_entry.file_name().to_string_lossy().to_string();
        if !date.chars().all(|char| char.is_ascii_digit() || char == '-') {
            continue;
        }
        let mut session_dirs = fs::read_dir(date_entry.path())
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .collect::<Vec<_>>();
        session_dirs.sort_by_key(|entry| entry.file_name());
        session_dirs.reverse();

        for session_entry_dir in session_dirs {
            let session_id = session_entry_dir.file_name().to_string_lossy().to_string();
            let dir = session_entry_dir.path();
            let metadata = read_json(&dir.join("metadata.json"));
            let verdict = read_json(&dir.join("head-verdict.json"));
            sessions.push(session_entry(&date, &session_id, &dir, metadata.as_ref(), verdict.as_ref()));
            if sessions.len() >= 25 {
                return Ok(json!({ "schemaVersion": "codeagora.review.v1", "sessions": sessions }));
            }
        }
    }

    Ok(json!({ "schemaVersion": "codeagora.review.v1", "sessions": sessions }))
}

#[tauri::command]
fn get_session_detail(id: String) -> Result<Value, String> {
    session_detail_value(&id)
}

#[tauri::command]
fn run_review(app: tauri::AppHandle, staged: bool) -> Result<CommandResult, String> {
    let mut args = vec!["review", "--json-stream"];
    if staged {
        args.push("--staged");
    }

    let output = run_agora(&args).map_err(|error| error.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let session_id = stdout.lines().rev().find_map(|line| {
        serde_json::from_str::<Value>(line)
            .ok()
            .and_then(|value| value.get("sessionId").and_then(|id| id.as_str()).map(str::to_owned))
    });

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
    let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{\n  \"language\": \"en\",\n  \"reviewers\": []\n}\n".to_string());
    Ok(DesktopConfig {
        raw,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn write_config(raw: String) -> Result<DesktopConfig, String> {
    serde_json::from_str::<serde_json::Value>(&raw).map_err(|error| error.to_string())?;
    let path = repo_root()?.join(".ca").join("config.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
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
            write_config,
            get_repo_info
        ])
        .run(tauri::generate_context!())
        .expect("failed to run CodeAgora desktop app");
}
