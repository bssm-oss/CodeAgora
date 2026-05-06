use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandResult {
    ok: bool,
    message: String,
    session_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewRunEvent {
    kind: String,
    message: String,
    timestamp: String,
    payload: Option<Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewRunSnapshot {
    run_id: String,
    staged: bool,
    status: String,
    message: String,
    session_id: Option<String>,
    started_at: String,
    completed_at: Option<String>,
    events: Vec<ReviewRunEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    raw: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigValidation {
    valid: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatus {
    name: String,
    kind: String,
    env_var: Option<String>,
    configured: bool,
    redacted_value: Option<String>,
    binary: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpStatus {
    command: String,
    tools: Vec<String>,
    client_snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowStatus {
    path: String,
    mentions_codeagora: bool,
    has_pull_request_trigger: bool,
    has_permissions: bool,
    has_config_path: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubActionStatus {
    workflow_count: usize,
    codeagora_workflow_count: usize,
    workflows: Vec<WorkflowStatus>,
    recommended_snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceStatus {
    release_evidence_path: Option<String>,
    benchmark_report_path: Option<String>,
    evidence_manifest_path: Option<String>,
    has_release_evidence: bool,
    has_benchmark_report: bool,
    has_evidence_manifest: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoInfo {
    path: String,
    git_root: Option<String>,
    is_git_repo: bool,
    branch: Option<String>,
    head_sha: Option<String>,
    dirty_file_count: usize,
    has_config: bool,
    config_path: Option<String>,
    review_ignore_path: Option<String>,
    review_rules_path: Option<String>,
    sessions_root: String,
    session_count: usize,
    trusted: bool,
    trust_reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCommandContract {
    name: &'static str,
    classification: &'static str,
    reads_project: bool,
    mutates_project: bool,
    spawns_process: bool,
    notes: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionExport {
    format: String,
    file_name: String,
    content: String,
}

struct WorkspaceState {
    repo_root: Mutex<Option<PathBuf>>,
    review_runs: Mutex<HashMap<String, Arc<ReviewRunHandle>>>,
}

struct ReviewRunHandle {
    snapshot: Mutex<ReviewRunSnapshot>,
    child: Mutex<Option<Child>>,
}

fn default_repo_root() -> Result<PathBuf, String> {
    let start = match std::env::var("CODEAGORA_DESKTOP_REPO") {
        Ok(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => std::env::current_dir().map_err(|error| error.to_string())?,
    };

    let start = start.canonicalize().unwrap_or(start);
    Ok(find_git_root(&start).unwrap_or(start))
}

fn active_repo_root(state: &WorkspaceState) -> Result<PathBuf, String> {
    let selected = state
        .repo_root
        .lock()
        .map_err(|_| "Workspace state lock failed".to_string())?
        .clone();
    selected.map_or_else(default_repo_root, Ok)
}

fn resolve_workspace_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Repository path is required.".to_string());
    }
    let input = PathBuf::from(trimmed);
    let canonical = input
        .canonicalize()
        .map_err(|error| format!("Cannot open repository path {trimmed}: {error}"))?;
    let start = if canonical.is_file() {
        canonical
            .parent()
            .ok_or_else(|| format!("Repository path has no parent: {trimmed}"))?
            .to_path_buf()
    } else {
        canonical
    };
    Ok(find_git_root(&start).unwrap_or(start))
}

fn now_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn review_run_id() -> String {
    format!("desktop-{}", now_millis())
}

fn review_event(kind: &str, message: impl Into<String>, payload: Option<Value>) -> ReviewRunEvent {
    ReviewRunEvent {
        kind: kind.to_string(),
        message: message.into(),
        timestamp: now_millis(),
        payload,
    }
}

fn push_review_event(handle: &Arc<ReviewRunHandle>, event: ReviewRunEvent) {
    if let Ok(mut snapshot) = handle.snapshot.lock() {
        snapshot.events.push(event);
        if snapshot.events.len() > 500 {
            let drop_count = snapshot.events.len() - 500;
            snapshot.events.drain(0..drop_count);
        }
    }
}

fn update_review_snapshot(
    handle: &Arc<ReviewRunHandle>,
    status: Option<&str>,
    message: Option<String>,
    session_id: Option<String>,
    completed_at: Option<String>,
) {
    if let Ok(mut snapshot) = handle.snapshot.lock() {
        if let Some(status) = status {
            snapshot.status = status.to_string();
        }
        if let Some(message) = message {
            snapshot.message = message;
        }
        if let Some(session_id) = session_id {
            snapshot.session_id = Some(session_id);
        }
        if let Some(completed_at) = completed_at {
            snapshot.completed_at = Some(completed_at);
        }
    }
}

fn review_snapshot(handle: &Arc<ReviewRunHandle>) -> Result<ReviewRunSnapshot, String> {
    handle
        .snapshot
        .lock()
        .map_err(|_| "Review run lock failed".to_string())
        .map(|snapshot| snapshot.clone())
}

fn spawn_agora(root: &Path, args: &[&str]) -> io::Result<Child> {
    let mut command = Command::new("agora");
    command
        .args(args)
        .current_dir(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    match command.spawn() {
        Ok(child) => Ok(child),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let mut fallback = Command::new("pnpm");
            fallback
                .args(["exec", "agora"])
                .args(args)
                .current_dir(root)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            fallback.spawn()
        }
        Err(error) => Err(error),
    }
}

fn parse_review_stream_line(line: &str) -> (String, String, Option<String>, Option<Value>) {
    let redacted_line = redact_sensitive(line);
    let Ok(payload) = serde_json::from_str::<Value>(line) else {
        return ("stdout".to_string(), redacted_line, None, None);
    };

    let kind = payload
        .get("type")
        .or_else(|| payload.get("event"))
        .or_else(|| payload.get("stage"))
        .and_then(Value::as_str)
        .unwrap_or("event")
        .to_string();
    let message = payload
        .get("message")
        .or_else(|| payload.get("status"))
        .or_else(|| payload.get("phase"))
        .and_then(Value::as_str)
        .map(redact_sensitive)
        .unwrap_or(redacted_line);
    let session_id = payload
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);

    (kind, message, session_id, None)
}

fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };

    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn command_stdout(program: &str, args: &[&str], cwd: &Path) -> Option<String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn git_stdout(args: &[&str], cwd: &Path) -> Option<String> {
    command_stdout("git", args, cwd)
}

fn config_path(root: &Path) -> Option<PathBuf> {
    ["config.json", "config.yml", "config.yaml"]
        .iter()
        .map(|name| root.join(".ca").join(name))
        .find(|path| path.is_file())
}

fn review_ignore_path(root: &Path) -> Option<PathBuf> {
    let path = root.join(".reviewignore");
    path.is_file().then_some(path)
}

fn review_rules_path(root: &Path) -> Option<PathBuf> {
    let path = root.join(".reviewrules");
    path.is_file().then_some(path)
}

fn session_count(root: &Path) -> usize {
    let sessions = root.join(".ca").join("sessions");
    let Ok(date_dirs) = fs::read_dir(sessions) else {
        return 0;
    };

    date_dirs
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| fs::read_dir(entry.path()).ok())
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| entry.path().is_dir())
                .count()
        })
        .sum()
}

fn dirty_file_count(root: &Path) -> usize {
    git_stdout(&["status", "--short"], root)
        .map(|value| value.lines().filter(|line| !line.trim().is_empty()).count())
        .unwrap_or(0)
}

fn desktop_command_contracts() -> Vec<DesktopCommandContract> {
    vec![
        DesktopCommandContract {
            name: "open_repository",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: true,
            notes: "Resolves and trusts the selected workspace for subsequent desktop commands.",
        },
        DesktopCommandContract {
            name: "get_repo_info",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: true,
            notes: "Reads git metadata, config/session presence, and review helper file presence.",
        },
        DesktopCommandContract {
            name: "list_sessions",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Reads canonical .ca/sessions artifacts without migration.",
        },
        DesktopCommandContract {
            name: "get_session_detail",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Validates session ids before reading session files.",
        },
        DesktopCommandContract {
            name: "export_session",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Exports canonical session artifacts as markdown, JSON, or SARIF text.",
        },
        DesktopCommandContract {
            name: "run_review",
            classification: "process-execution",
            reads_project: true,
            mutates_project: true,
            spawns_process: true,
            notes:
                "Runs the existing agora CLI and lets the CLI write canonical session artifacts.",
        },
        DesktopCommandContract {
            name: "start_review_run",
            classification: "process-execution",
            reads_project: true,
            mutates_project: true,
            spawns_process: true,
            notes: "Starts an async CLI review run and stores progress events for polling.",
        },
        DesktopCommandContract {
            name: "get_review_run",
            classification: "read-only",
            reads_project: false,
            mutates_project: false,
            spawns_process: false,
            notes: "Reads current progress for a desktop-started review run.",
        },
        DesktopCommandContract {
            name: "cancel_review_run",
            classification: "process-control",
            reads_project: false,
            mutates_project: false,
            spawns_process: false,
            notes: "Terminates the spawned CLI review process for a desktop-started run.",
        },
        DesktopCommandContract {
            name: "read_config",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Reads .ca/config.json, .ca/config.yml, or .ca/config.yaml when present.",
        },
        DesktopCommandContract {
            name: "write_config",
            classification: "project-mutation",
            reads_project: true,
            mutates_project: true,
            spawns_process: false,
            notes: "Validates JSON and writes atomically to the current CodeAgora config path.",
        },
        DesktopCommandContract {
            name: "validate_config",
            classification: "read-only",
            reads_project: false,
            mutates_project: false,
            spawns_process: false,
            notes: "Validates desktop config edits before atomic writes.",
        },
        DesktopCommandContract {
            name: "get_provider_status",
            classification: "read-only",
            reads_project: false,
            mutates_project: false,
            spawns_process: true,
            notes: "Detects provider environment variables and local CLI backend binaries without exposing secrets.",
        },
        DesktopCommandContract {
            name: "get_mcp_status",
            classification: "read-only",
            reads_project: false,
            mutates_project: false,
            spawns_process: false,
            notes: "Reports MCP command, advertised tools, and client config snippet.",
        },
        DesktopCommandContract {
            name: "get_github_action_status",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Reads workflow files and detects CodeAgora Action setup signals.",
        },
        DesktopCommandContract {
            name: "get_evidence_status",
            classification: "read-only",
            reads_project: true,
            mutates_project: false,
            spawns_process: false,
            notes: "Detects local release evidence, benchmark report, and evidence manifest files.",
        },
        DesktopCommandContract {
            name: "get_command_contract",
            classification: "read-only",
            reads_project: false,
            mutates_project: false,
            spawns_process: false,
            notes: "Reports this desktop bridge contract for UI and release evidence.",
        },
    ]
}

fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
}

fn read_optional_text(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .filter(|raw| !raw.trim().is_empty())
}

fn read_session_verdict(dir: &Path) -> Option<Value> {
    read_json(&dir.join("head-verdict.json")).or_else(|| read_json(&dir.join("result.json")))
}

fn session_parts(id: &str) -> Result<(&str, &str), String> {
    let mut parts = id.split('/');
    let date = parts.next().unwrap_or_default();
    let session_id = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || !date
            .chars()
            .all(|char| char.is_ascii_digit() || char == '-')
        || !session_id
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
        || date.is_empty()
        || session_id.is_empty()
    {
        return Err(format!("Invalid session id: {id}"));
    }
    Ok((date, session_id))
}

fn sessions_root_for(root: &Path) -> PathBuf {
    root.join(".ca").join("sessions")
}

fn session_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    let (date, session_id) = session_parts(id)?;
    Ok(sessions_root_for(root).join(date).join(session_id))
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
        .and_then(|value| {
            value
                .get("completedAt")
                .or_else(|| value.get("startedAt"))
                .or_else(|| value.get("timestamp"))
        })
        .and_then(Value::as_i64)?;
    Some(millis.to_string())
}

fn summary_object(verdict: Option<&Value>) -> Option<&serde_json::Map<String, Value>> {
    verdict
        .and_then(|value| value.get("summary"))
        .and_then(Value::as_object)
}

fn issue_objects(verdict: Option<&Value>) -> Vec<Value> {
    let Some(verdict) = verdict else {
        return Vec::new();
    };
    ["issues", "findings", "items"]
        .iter()
        .find_map(|key| verdict.get(key).and_then(Value::as_array))
        .or_else(|| {
            verdict
                .get("summary")
                .and_then(|summary| summary.get("topIssues"))
                .and_then(Value::as_array)
        })
        .or_else(|| verdict.get("evidenceDocs").and_then(Value::as_array))
        .cloned()
        .unwrap_or_default()
}

fn severity_counts(verdict: Option<&Value>, issues: &[Value]) -> Value {
    if let Some(counts) = summary_object(verdict)
        .and_then(|summary| summary.get("severityCounts"))
        .and_then(Value::as_object)
    {
        return Value::Object(counts.clone());
    }

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

fn text_field<'a>(value: Option<&'a Value>, keys: &[&str]) -> Option<&'a str> {
    let value = value?;
    for key in keys {
        if let Some(found) = value.get(*key).and_then(Value::as_str) {
            return Some(found);
        }
    }
    None
}

fn verdict_decision(verdict: Option<&Value>) -> Option<&str> {
    text_field(verdict, &["decision", "verdict"]).or_else(|| {
        summary_object(verdict)
            .and_then(|summary| summary.get("decision"))
            .and_then(Value::as_str)
    })
}

fn verdict_reasoning(verdict: Option<&Value>) -> Option<&str> {
    text_field(verdict, &["reasoning", "summary"]).or_else(|| {
        summary_object(verdict)
            .and_then(|summary| summary.get("reasoning"))
            .and_then(Value::as_str)
    })
}

fn issue_view(issue: &Value) -> Value {
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
        "confidence": issue.get("confidence").cloned().unwrap_or(Value::Null),
        "raw": issue,
    })
}

fn finding_views(verdict: Option<&Value>, issues: &[Value], limit: Option<usize>) -> Vec<Value> {
    let source = summary_object(verdict)
        .and_then(|summary| summary.get("topIssues"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| issues.to_vec());

    let iter = source.iter().map(issue_view);
    match limit {
        Some(limit) => iter.take(limit).collect(),
        None => iter.collect(),
    }
}

fn top_issues(verdict: Option<&Value>, issues: &[Value]) -> Vec<Value> {
    finding_views(verdict, issues, Some(5))
}

fn all_findings(verdict: Option<&Value>, issues: &[Value]) -> Vec<Value> {
    if issues.is_empty() {
        finding_views(verdict, issues, None)
    } else {
        issues.iter().map(issue_view).collect()
    }
}

fn session_entry(
    date: &str,
    session_id: &str,
    dir: &Path,
    metadata: Option<&Value>,
    verdict: Option<&Value>,
) -> Value {
    let id = format!("{date}/{session_id}");
    let issues = issue_objects(verdict);
    json!({
        "id": id,
        "date": date,
        "sessionId": session_id,
        "status": status_from_metadata(metadata),
        "dirPath": dir.display().to_string(),
        "decision": verdict_decision(verdict),
        "reasoning": verdict_reasoning(verdict),
        "severityCounts": severity_counts(verdict, &issues),
        "topIssues": top_issues(verdict, &issues),
        "updatedAt": updated_at_from_metadata(metadata),
    })
}

fn session_detail_value(root: &Path, id: &str) -> Result<Value, String> {
    let dir = session_dir(root, id)?;
    if !dir.is_dir() {
        return Err(format!("Session not found: {id}"));
    }

    let (date, session_id) = session_parts(id)?;
    let metadata = read_json(&dir.join("metadata.json"));
    let verdict = read_session_verdict(&dir);
    let markdown = read_optional_text(&dir.join("report.md"))
        .or_else(|| read_optional_text(&dir.join("result.md")))
        .or_else(|| read_optional_text(&dir.join("suggestions.md")));
    let evidence_count = fs::read_dir(dir.join("reviews"))
        .map(|entries| entries.count())
        .unwrap_or(0);
    let discussions_count = fs::read_dir(dir.join("discussions"))
        .map(|entries| entries.count())
        .unwrap_or(0);
    let findings = all_findings(verdict.as_ref(), &issue_objects(verdict.as_ref()));

    Ok(json!({
        "entry": session_entry(date, session_id, &dir, metadata.as_ref(), verdict.as_ref()),
        "metadata": metadata,
        "verdict": verdict,
        "findings": findings,
        "markdown": markdown,
        "evidenceCount": evidence_count,
        "discussionsCount": discussions_count,
    }))
}

fn sarif_for_session(id: &str, detail: &Value) -> Value {
    let findings = detail
        .get("findings")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let results = findings
        .iter()
        .map(|finding| {
            let file_path = finding
                .get("filePath")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let line = finding
                .get("lineRange")
                .and_then(Value::as_array)
                .and_then(|range| range.first())
                .and_then(Value::as_i64)
                .unwrap_or(1)
                .max(1);
            json!({
                "ruleId": finding.get("severity").and_then(Value::as_str).unwrap_or("CODEAGORA"),
                "level": "warning",
                "message": {
                    "text": finding.get("title").and_then(Value::as_str).unwrap_or("CodeAgora finding")
                },
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": { "uri": file_path },
                        "region": { "startLine": line }
                    }
                }]
            })
        })
        .collect::<Vec<_>>();
    json!({
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "CodeAgora Desktop",
                    "informationUri": "https://github.com/bssm-oss/CodeAgora"
                }
            },
            "invocations": [{
                "executionSuccessful": true,
                "properties": { "sessionId": id }
            }],
            "results": results
        }]
    })
}

fn export_session_value(root: &Path, id: &str, format: &str) -> Result<SessionExport, String> {
    let detail = session_detail_value(root, id)?;
    let normalized = format.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "markdown" | "md" => {
            let content = detail
                .get("markdown")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| {
                    serde_json::to_string_pretty(&detail).unwrap_or_else(|_| "{}".to_string())
                });
            Ok(SessionExport {
                format: "markdown".to_string(),
                file_name: format!("codeagora-session-{}.md", id.replace('/', "-")),
                content,
            })
        }
        "json" => Ok(SessionExport {
            format: "json".to_string(),
            file_name: format!("codeagora-session-{}.json", id.replace('/', "-")),
            content: serde_json::to_string_pretty(&detail).map_err(|error| error.to_string())?,
        }),
        "sarif" => Ok(SessionExport {
            format: "sarif".to_string(),
            file_name: format!("codeagora-session-{}.sarif", id.replace('/', "-")),
            content: serde_json::to_string_pretty(&sarif_for_session(id, &detail))
                .map_err(|error| error.to_string())?,
        }),
        _ => Err(format!("Unsupported export format: {format}")),
    }
}

fn validate_config_value(value: &Value) -> ConfigValidation {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let Some(object) = value.as_object() else {
        return ConfigValidation {
            valid: false,
            errors: vec!["Config must be a JSON object.".to_string()],
            warnings,
        };
    };

    match object.get("language") {
        Some(language) if !language.is_string() => {
            errors.push("language must be a string when present.".to_string());
        }
        None => warnings.push("language is not set; CLI defaults may apply.".to_string()),
        _ => {}
    }

    if let Some(reviewers) = object.get("reviewers") {
        let Some(reviewers) = reviewers.as_array() else {
            errors.push("reviewers must be an array when present.".to_string());
            return ConfigValidation {
                valid: false,
                errors,
                warnings,
            };
        };
        let enabled_count = reviewers
            .iter()
            .filter(|reviewer| {
                reviewer
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
            })
            .count();
        if enabled_count > 10 {
            warnings.push(format!(
                "{enabled_count} reviewers enabled; high counts increase latency and cost."
            ));
        }
        for (index, reviewer) in reviewers.iter().enumerate() {
            let label = reviewer
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("reviewers[{index}]"));
            let backend = reviewer.get("backend").and_then(Value::as_str);
            let model = reviewer.get("model").and_then(Value::as_str);
            if backend.is_none() {
                errors.push(format!("{label}: backend is required."));
            }
            if matches!(model, Some("")) {
                errors.push(format!("{label}: model must not be empty."));
            }
            if matches!(backend, Some("api" | "opencode"))
                && reviewer.get("provider").and_then(Value::as_str).is_none()
            {
                errors.push(format!(
                    "{label}: provider is required when backend is {}.",
                    backend.unwrap_or_default()
                ));
            }
        }
    } else {
        warnings.push("reviewers is not set; generated defaults may be needed.".to_string());
    }

    if let Some(discussion) = object.get("discussion").and_then(Value::as_object) {
        if let Some(max_rounds) = discussion.get("maxRounds").and_then(Value::as_u64) {
            if max_rounds > 5 {
                warnings.push(format!(
                    "discussion.maxRounds={max_rounds}; high round counts increase latency."
                ));
            }
        }
    }

    ConfigValidation {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn validate_config_raw(raw: &str) -> ConfigValidation {
    match serde_json::from_str::<Value>(raw) {
        Ok(value) => validate_config_value(&value),
        Err(error) => ConfigValidation {
            valid: false,
            errors: vec![error.to_string()],
            warnings: Vec::new(),
        },
    }
}

fn redact_secret(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= 4 {
        return "set".to_string();
    }
    let suffix = chars[chars.len().saturating_sub(4)..]
        .iter()
        .collect::<String>();
    format!("***{suffix}")
}

fn redact_sensitive(raw: &str) -> String {
    let mut redacted = raw.to_string();
    for (key, value) in std::env::vars() {
        let upper = key.to_ascii_uppercase();
        let sensitive_name = upper.contains("KEY")
            || upper.contains("TOKEN")
            || upper.contains("SECRET")
            || upper.contains("AUTH");
        if sensitive_name && value.len() >= 4 && redacted.contains(&value) {
            redacted = redacted.replace(&value, &redact_secret(&value));
        }
    }
    redacted
}

fn provider_statuses() -> Vec<ProviderStatus> {
    let api_providers = [
        ("openai", "OPENAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("google", "GOOGLE_GENERATIVE_AI_API_KEY"),
        ("groq", "GROQ_API_KEY"),
        ("openrouter", "OPENROUTER_API_KEY"),
        ("cohere", "COHERE_API_KEY"),
        ("deepinfra", "DEEPINFRA_API_KEY"),
        ("fireworks", "FIREWORKS_API_KEY"),
        ("perplexity", "PERPLEXITY_API_KEY"),
        ("huggingface", "HUGGINGFACE_API_KEY"),
    ];
    let mut statuses = api_providers
        .iter()
        .map(|(name, env_var)| {
            let value = std::env::var(env_var)
                .ok()
                .filter(|value| !value.is_empty());
            ProviderStatus {
                name: (*name).to_string(),
                kind: "api".to_string(),
                env_var: Some((*env_var).to_string()),
                configured: value.is_some(),
                redacted_value: value.as_deref().map(redact_secret),
                binary: None,
            }
        })
        .collect::<Vec<_>>();

    for (name, binary) in [
        ("opencode", "opencode"),
        ("codex", "codex"),
        ("gemini", "gemini"),
        ("claude", "claude"),
        ("copilot", "gh"),
    ] {
        let configured = command_stdout("which", &[binary], Path::new("/")).is_some();
        statuses.push(ProviderStatus {
            name: name.to_string(),
            kind: "cli".to_string(),
            env_var: None,
            configured,
            redacted_value: None,
            binary: Some(binary.to_string()),
        });
    }

    statuses
}

fn mcp_status() -> McpStatus {
    let tools = [
        "review_quick",
        "review_full",
        "review_pr",
        "dry_run",
        "explain_session",
        "leaderboard",
        "stats",
        "config_get",
        "config_set",
    ]
    .iter()
    .map(|tool| (*tool).to_string())
    .collect::<Vec<_>>();
    McpStatus {
        command: "codeagora-mcp".to_string(),
        tools,
        client_snippet: json!({
            "mcpServers": {
                "codeagora": {
                    "command": "codeagora-mcp",
                    "args": []
                }
            }
        })
        .to_string(),
    }
}

fn github_action_status(root: &Path) -> GitHubActionStatus {
    let workflow_root = root.join(".github").join("workflows");
    let mut workflows = Vec::new();
    if let Ok(entries) = fs::read_dir(&workflow_root) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
                continue;
            };
            if !matches!(extension, "yml" | "yaml") {
                continue;
            }
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let lower = raw.to_ascii_lowercase();
            workflows.push(WorkflowStatus {
                path: path.display().to_string(),
                mentions_codeagora: lower.contains("codeagora")
                    || lower.contains("@codeagora/review"),
                has_pull_request_trigger: lower.contains("pull_request"),
                has_permissions: lower.contains("permissions:"),
                has_config_path: lower.contains("config-path") || lower.contains("config_path"),
            });
        }
    }
    let codeagora_workflow_count = workflows
        .iter()
        .filter(|workflow| workflow.mentions_codeagora)
        .count();
    GitHubActionStatus {
        workflow_count: workflows.len(),
        codeagora_workflow_count,
        workflows,
        recommended_snippet: [
            "name: CodeAgora Review",
            "on:",
            "  pull_request:",
            "permissions:",
            "  contents: read",
            "  pull-requests: write",
            "jobs:",
            "  review:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - uses: actions/checkout@v4",
            "      - uses: bssm-oss/CodeAgora@v0.1.0-beta.1",
        ]
        .join("\n"),
    }
}

fn existing_path(path: PathBuf) -> Option<String> {
    path.is_file().then(|| path.display().to_string())
}

fn evidence_status(root: &Path) -> EvidenceStatus {
    let release_evidence_path = existing_path(root.join("docs").join("RELEASE_EVIDENCE.md"));
    let benchmark_report_path = existing_path(root.join("docs").join("live-benchmark-report.md"));
    let evidence_manifest_path = existing_path(
        root.join(".sisyphus")
            .join("evidence")
            .join("evidence-manifest.json"),
    );
    EvidenceStatus {
        has_release_evidence: release_evidence_path.is_some(),
        has_benchmark_report: benchmark_report_path.is_some(),
        has_evidence_manifest: evidence_manifest_path.is_some(),
        release_evidence_path,
        benchmark_report_path,
        evidence_manifest_path,
    }
}

fn write_config_for_root(raw: &str, root: &Path) -> Result<DesktopConfig, String> {
    let validation = validate_config_raw(raw);
    if !validation.valid {
        return Err(format!("Invalid config: {}", validation.errors.join("; ")));
    }
    let path = match config_path(root) {
        Some(path) if path.extension().and_then(|value| value.to_str()) == Some("json") => path,
        Some(path) => {
            return Err(format!(
                "Desktop config writes currently support JSON only. Existing config is {}.",
                path.display()
            ))
        }
        None => root.join(".ca").join("config.json"),
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp_path = path.with_file_name(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("config.json")
    ));
    fs::write(&tmp_path, raw).map_err(|error| error.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|error| error.to_string())?;
    Ok(DesktopConfig {
        raw: raw.to_string(),
        path: path.display().to_string(),
    })
}

fn run_agora(root: &Path, args: &[&str]) -> io::Result<std::process::Output> {
    match Command::new("agora").args(args).current_dir(root).output() {
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
fn get_repo_info(state: State<'_, WorkspaceState>) -> Result<RepoInfo, String> {
    let root = active_repo_root(&state)?;
    repo_info_for_root(&root)
}

fn repo_info_for_root(root: &Path) -> Result<RepoInfo, String> {
    let git_root = git_stdout(&["rev-parse", "--show-toplevel"], &root).map(PathBuf::from);
    let config = config_path(&root);
    let review_ignore = review_ignore_path(&root);
    let review_rules = review_rules_path(&root);
    let is_git_repo = git_root.is_some();

    Ok(RepoInfo {
        path: root.display().to_string(),
        git_root: git_root.as_ref().map(|path| path.display().to_string()),
        is_git_repo,
        branch: git_stdout(&["branch", "--show-current"], &root)
            .or_else(|| git_stdout(&["rev-parse", "--abbrev-ref", "HEAD"], &root)),
        head_sha: git_stdout(&["rev-parse", "--short=12", "HEAD"], &root),
        dirty_file_count: dirty_file_count(&root),
        has_config: config.is_some(),
        config_path: config.as_ref().map(|path| path.display().to_string()),
        review_ignore_path: review_ignore
            .as_ref()
            .map(|path| path.display().to_string()),
        review_rules_path: review_rules.as_ref().map(|path| path.display().to_string()),
        sessions_root: root.join(".ca").join("sessions").display().to_string(),
        session_count: session_count(&root),
        trusted: is_git_repo,
        trust_reason: if is_git_repo {
            "Git repository detected from the current workspace root.".to_string()
        } else {
            "No git repository detected; review execution should remain disabled until a trusted repo is selected.".to_string()
        },
    })
}

#[tauri::command]
fn open_repository(path: String, state: State<'_, WorkspaceState>) -> Result<RepoInfo, String> {
    let root = resolve_workspace_path(&path)?;
    let info = repo_info_for_root(&root)?;
    *state
        .repo_root
        .lock()
        .map_err(|_| "Workspace state lock failed".to_string())? = Some(root);
    Ok(info)
}

#[tauri::command]
fn get_command_contract() -> Result<Vec<DesktopCommandContract>, String> {
    Ok(desktop_command_contracts())
}

#[tauri::command]
fn list_sessions(state: State<'_, WorkspaceState>) -> Result<Value, String> {
    let workspace_root = active_repo_root(&state)?;
    let root = sessions_root_for(&workspace_root);
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
        if !date
            .chars()
            .all(|char| char.is_ascii_digit() || char == '-')
        {
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
            let verdict = read_session_verdict(&dir);
            sessions.push(session_entry(
                &date,
                &session_id,
                &dir,
                metadata.as_ref(),
                verdict.as_ref(),
            ));
            if sessions.len() >= 25 {
                return Ok(json!({ "schemaVersion": "codeagora.review.v1", "sessions": sessions }));
            }
        }
    }

    Ok(json!({ "schemaVersion": "codeagora.review.v1", "sessions": sessions }))
}

#[tauri::command]
fn get_session_detail(id: String, state: State<'_, WorkspaceState>) -> Result<Value, String> {
    let root = active_repo_root(&state)?;
    session_detail_value(&root, &id)
}

#[tauri::command]
fn export_session(
    id: String,
    format: String,
    state: State<'_, WorkspaceState>,
) -> Result<SessionExport, String> {
    let root = active_repo_root(&state)?;
    export_session_value(&root, &id, &format)
}

#[tauri::command]
fn run_review(
    app: tauri::AppHandle,
    staged: bool,
    state: State<'_, WorkspaceState>,
) -> Result<CommandResult, String> {
    let mut args = vec!["review", "--json-stream"];
    if staged {
        args.push("--staged");
    }

    let root = active_repo_root(&state)?;
    let output = run_agora(&root, &args).map_err(|error| error.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let session_id = stdout.lines().rev().find_map(|line| {
        serde_json::from_str::<Value>(line).ok().and_then(|value| {
            value
                .get("sessionId")
                .and_then(|id| id.as_str())
                .map(str::to_owned)
        })
    });

    let result = CommandResult {
        ok: output.status.success(),
        message: if output.status.success() {
            "Review completed.".to_string()
        } else {
            redact_sensitive(&String::from_utf8_lossy(&output.stderr))
        },
        session_id,
    };

    notify_review_finished(&app, &result);

    Ok(result)
}

#[tauri::command]
fn start_review_run(
    app: tauri::AppHandle,
    staged: bool,
    state: State<'_, WorkspaceState>,
) -> Result<ReviewRunSnapshot, String> {
    let root = active_repo_root(&state)?;
    let mut args = vec!["review", "--json-stream"];
    if staged {
        args.push("--staged");
    }

    let mut child = spawn_agora(&root, &args).map_err(|error| error.to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let run_id = review_run_id();
    let handle = Arc::new(ReviewRunHandle {
        snapshot: Mutex::new(ReviewRunSnapshot {
            run_id: run_id.clone(),
            staged,
            status: "running".to_string(),
            message: "Review started.".to_string(),
            session_id: None,
            started_at: now_millis(),
            completed_at: None,
            events: vec![review_event(
                "start",
                format!("Started review in {}", root.display()),
                None,
            )],
        }),
        child: Mutex::new(Some(child)),
    });

    state
        .review_runs
        .lock()
        .map_err(|_| "Review run registry lock failed".to_string())?
        .insert(run_id.clone(), Arc::clone(&handle));

    if let Some(stdout) = stdout {
        let output_handle = Arc::clone(&handle);
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let (kind, message, session_id, payload) = parse_review_stream_line(&line);
                if let Some(session_id) = session_id {
                    update_review_snapshot(&output_handle, None, None, Some(session_id), None);
                }
                push_review_event(&output_handle, review_event(&kind, message, payload));
            }
        });
    }

    if let Some(stderr) = stderr {
        let error_handle = Arc::clone(&handle);
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let line = redact_sensitive(&line);
                update_review_snapshot(&error_handle, None, Some(line.clone()), None, None);
                push_review_event(&error_handle, review_event("stderr", line, None));
            }
        });
    }

    let monitor_handle = Arc::clone(&handle);
    thread::spawn(move || loop {
        let status = {
            let mut child = match monitor_handle.child.lock() {
                Ok(child) => child,
                Err(_) => {
                    update_review_snapshot(
                        &monitor_handle,
                        Some("failed"),
                        Some("Review child lock failed.".to_string()),
                        None,
                        Some(now_millis()),
                    );
                    break;
                }
            };
            match child.as_mut() {
                Some(child) => child.try_wait(),
                None => break,
            }
        };

        match status {
            Ok(Some(status)) => {
                if let Ok(mut child) = monitor_handle.child.lock() {
                    *child = None;
                }
                let was_cancelling = review_snapshot(&monitor_handle)
                    .map(|snapshot| snapshot.status == "cancelling")
                    .unwrap_or(false);
                let final_status = if was_cancelling {
                    "cancelled"
                } else if status.success() {
                    "completed"
                } else {
                    "failed"
                };
                let message = if was_cancelling {
                    "Review cancelled.".to_string()
                } else if status.success() {
                    "Review completed.".to_string()
                } else {
                    format!("Review exited with status {status}.")
                };
                update_review_snapshot(
                    &monitor_handle,
                    Some(final_status),
                    Some(message.clone()),
                    None,
                    Some(now_millis()),
                );
                push_review_event(&monitor_handle, review_event(final_status, &message, None));
                let snapshot = review_snapshot(&monitor_handle).ok();
                notify_review_finished(
                    &app,
                    &CommandResult {
                        ok: final_status == "completed",
                        message,
                        session_id: snapshot.and_then(|snapshot| snapshot.session_id),
                    },
                );
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(150)),
            Err(error) => {
                update_review_snapshot(
                    &monitor_handle,
                    Some("failed"),
                    Some(error.to_string()),
                    None,
                    Some(now_millis()),
                );
                push_review_event(
                    &monitor_handle,
                    review_event("failed", error.to_string(), None),
                );
                break;
            }
        }
    });

    let stored = state
        .review_runs
        .lock()
        .map_err(|_| "Review run registry lock failed".to_string())?
        .get(&run_id)
        .cloned()
        .ok_or_else(|| format!("Review run not found after start: {run_id}"))?;
    review_snapshot(&stored)
}

#[tauri::command]
fn get_review_run(
    run_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<ReviewRunSnapshot, String> {
    let handle = state
        .review_runs
        .lock()
        .map_err(|_| "Review run registry lock failed".to_string())?
        .get(&run_id)
        .cloned()
        .ok_or_else(|| format!("Review run not found: {run_id}"))?;
    review_snapshot(&handle)
}

#[tauri::command]
fn cancel_review_run(
    run_id: String,
    state: State<'_, WorkspaceState>,
) -> Result<ReviewRunSnapshot, String> {
    let handle = state
        .review_runs
        .lock()
        .map_err(|_| "Review run registry lock failed".to_string())?
        .get(&run_id)
        .cloned()
        .ok_or_else(|| format!("Review run not found: {run_id}"))?;

    update_review_snapshot(
        &handle,
        Some("cancelling"),
        Some("Cancelling review...".to_string()),
        None,
        None,
    );
    push_review_event(
        &handle,
        review_event("cancel", "Cancellation requested.", None),
    );

    let mut child = handle
        .child
        .lock()
        .map_err(|_| "Review child lock failed".to_string())?;
    if let Some(child) = child.as_mut() {
        child.kill().map_err(|error| error.to_string())?;
    }

    review_snapshot(&handle)
}

#[tauri::command]
fn read_config(state: State<'_, WorkspaceState>) -> Result<DesktopConfig, String> {
    let root = active_repo_root(&state)?;
    let path = config_path(&root).unwrap_or_else(|| root.join(".ca").join("config.json"));
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|_| "{\n  \"language\": \"en\",\n  \"reviewers\": []\n}\n".to_string());
    Ok(DesktopConfig {
        raw,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn validate_config(raw: String) -> Result<ConfigValidation, String> {
    Ok(validate_config_raw(&raw))
}

#[tauri::command]
fn get_provider_status() -> Result<Vec<ProviderStatus>, String> {
    Ok(provider_statuses())
}

#[tauri::command]
fn get_mcp_status() -> Result<McpStatus, String> {
    Ok(mcp_status())
}

#[tauri::command]
fn get_github_action_status(
    state: State<'_, WorkspaceState>,
) -> Result<GitHubActionStatus, String> {
    let root = active_repo_root(&state)?;
    Ok(github_action_status(&root))
}

#[tauri::command]
fn get_evidence_status(state: State<'_, WorkspaceState>) -> Result<EvidenceStatus, String> {
    let root = active_repo_root(&state)?;
    Ok(evidence_status(&root))
}

#[tauri::command]
fn write_config(raw: String, state: State<'_, WorkspaceState>) -> Result<DesktopConfig, String> {
    let root = active_repo_root(&state)?;
    write_config_for_root(&raw, &root)
}

fn main() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());

    #[cfg(all(debug_assertions, feature = "webdriver-automation"))]
    let builder = {
        let mut builder = builder;
        if std::env::var("CODEAGORA_DESKTOP_WEBDRIVER").as_deref() == Ok("1") {
            builder = builder.plugin(tauri_plugin_webdriver_automation::init());
        }
        builder
    };

    builder
        .manage(WorkspaceState {
            repo_root: Mutex::new(None),
            review_runs: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            get_session_detail,
            export_session,
            run_review,
            start_review_run,
            get_review_run,
            cancel_review_run,
            read_config,
            validate_config,
            get_provider_status,
            get_mcp_status,
            get_github_action_status,
            get_evidence_status,
            write_config,
            get_repo_info,
            open_repository,
            get_command_contract
        ])
        .run(tauri::generate_context!())
        .expect("failed to run CodeAgora desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_workspace(name: &str) -> PathBuf {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
            "codeagora-desktop-{name}-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create temp workspace");
        root
    }

    fn write_file(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, content).expect("write fixture file");
    }

    fn init_git(root: &Path) {
        let status = Command::new("git")
            .args(["init", "--initial-branch", "main"])
            .current_dir(root)
            .status()
            .expect("run git init");
        assert!(status.success(), "git init should succeed");
    }

    fn fixture_workspace() -> PathBuf {
        let root = temp_workspace("e2e");
        init_git(&root);
        write_file(&root, "README.md", "# Desktop E2E\n");
        write_file(
            &root,
            ".ca/config.json",
            r#"{
  "language": "en",
  "reviewers": [
    { "id": "codex", "backend": "opencode", "provider": "openai", "model": "gpt-5" }
  ],
  "discussion": { "maxRounds": 2 }
}
"#,
        );
        write_file(
            &root,
            ".ca/sessions/2026-05-06/e2e-001/metadata.json",
            r#"{ "status": "completed", "startedAt": 1778040000000, "completedAt": 1778040060000 }"#,
        );
        write_file(
            &root,
            ".ca/sessions/2026-05-06/e2e-001/head-verdict.json",
            r#"{
  "decision": "REJECT",
  "reasoning": "Desktop E2E caught a blocking issue.",
  "issues": [
    {
      "severity": "CRITICAL",
      "filePath": "src/app.ts",
      "lineRange": [12, 18],
      "title": "Blocking desktop E2E finding",
      "confidence": 93
    }
  ]
}
"#,
        );
        write_file(
            &root,
            ".ca/sessions/2026-05-06/e2e-001/report.md",
            "# Desktop E2E report\n\nDecision: REJECT\n",
        );
        write_file(
            &root,
            ".ca/sessions/2026-05-06/e2e-001/reviews/model-a.md",
            "review evidence",
        );
        write_file(
            &root,
            ".ca/sessions/2026-05-06/e2e-001/discussions/critical.md",
            "discussion evidence",
        );
        write_file(
            &root,
            ".github/workflows/codeagora.yml",
            "name: CodeAgora Review\non:\n  pull_request:\npermissions:\n  contents: read\n  pull-requests: write\njobs:\n  review:\n    steps:\n      - uses: bssm-oss/CodeAgora@v0.1.0-beta.1\n        with:\n          config-path: .ca/config.json\n",
        );
        write_file(&root, "docs/RELEASE_EVIDENCE.md", "# Release Evidence\n");
        write_file(&root, "docs/live-benchmark-report.md", "# Live Benchmark\n");
        write_file(
            &root,
            ".sisyphus/evidence/evidence-manifest.json",
            r#"{ "schemaVersion": "codeagora.release-evidence.v1" }"#,
        );
        root
    }

    #[test]
    fn desktop_app_e2e_reads_sessions_exports_and_setup_state() {
        let root = fixture_workspace();

        let info = repo_info_for_root(&root).expect("repo info");
        assert!(info.trusted);
        assert!(info.is_git_repo);
        assert!(info.has_config);
        assert_eq!(info.session_count, 1);

        let detail = session_detail_value(&root, "2026-05-06/e2e-001").expect("session detail");
        assert_eq!(
            detail.pointer("/entry/decision").and_then(Value::as_str),
            Some("REJECT")
        );
        assert_eq!(
            detail.pointer("/findings/0/title").and_then(Value::as_str),
            Some("Blocking desktop E2E finding")
        );
        assert!(detail
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Desktop E2E report"));

        let markdown =
            export_session_value(&root, "2026-05-06/e2e-001", "markdown").expect("markdown export");
        assert_eq!(
            markdown.file_name,
            "codeagora-session-2026-05-06-e2e-001.md"
        );
        assert!(markdown.content.contains("Decision: REJECT"));

        let sarif =
            export_session_value(&root, "2026-05-06/e2e-001", "sarif").expect("sarif export");
        assert!(sarif.content.contains("\"ruleId\": \"CRITICAL\""));
        assert!(sarif.content.contains("\"uri\": \"src/app.ts\""));

        let action = github_action_status(&root);
        assert_eq!(action.workflow_count, 1);
        assert_eq!(action.codeagora_workflow_count, 1);
        assert!(action.workflows[0].has_pull_request_trigger);
        assert!(action.workflows[0].has_permissions);
        assert!(action.workflows[0].has_config_path);

        let evidence = evidence_status(&root);
        assert!(evidence.has_release_evidence);
        assert!(evidence.has_benchmark_report);
        assert!(evidence.has_evidence_manifest);
    }

    #[test]
    fn desktop_app_e2e_validates_and_writes_json_config_atomically() {
        let root = fixture_workspace();
        let invalid = validate_config_raw(r#"{ "reviewers": "codex" }"#);
        assert!(!invalid.valid);
        assert!(invalid
            .errors
            .iter()
            .any(|error| error.contains("reviewers must be an array")));

        let updated = r#"{
  "language": "ko",
  "reviewers": [
    { "id": "codex", "backend": "opencode", "provider": "openai", "model": "gpt-5" }
  ]
}
"#;
        let written = write_config_for_root(updated, &root).expect("write config");
        assert!(written.path.ends_with(".ca/config.json"));
        assert_eq!(written.raw, updated);
        assert_eq!(
            fs::read_to_string(root.join(".ca/config.json")).unwrap(),
            updated
        );
        assert!(!root.join(".ca/config.json.tmp").exists());
    }

    #[test]
    fn desktop_app_e2e_blocks_session_path_traversal() {
        let root = fixture_workspace();
        let error = session_detail_value(&root, "../outside").expect_err("invalid session id");
        assert!(error.contains("Invalid session id"));
    }
}
