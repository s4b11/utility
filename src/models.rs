use serde::{Deserialize, Serialize};

/// A saved quick-access command. `command` maps to the `command_text` column.
#[derive(Serialize)]
pub struct Command {
    pub id: i64,
    pub title: String,
    pub command: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct CommandInput {
    pub title: String,
    pub command: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// A saved site link.
#[derive(Serialize)]
pub struct Link {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct LinkInput {
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
pub struct SetupInput {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub remember: bool,
    #[serde(default)]
    pub totp: Option<String>,
    #[serde(default)]
    pub recovery: Option<String>,
}

#[derive(Deserialize)]
pub struct TotpEnableInput {
    pub code: String,
}

#[derive(Deserialize)]
pub struct TotpDisableInput {
    pub password: String,
    pub code: String,
}

#[derive(Deserialize)]
pub struct MarkdownInput {
    pub markdown: String,
}

// ============================ Productivity ============================

/// Recurrence rule shared by tasks and events (byday: 0=Mon .. 6=Sun, weekly only).
#[derive(Serialize, Deserialize, Clone)]
pub struct Recurrence {
    #[serde(default = "freq_none")]
    pub freq: String,
    #[serde(default = "one")]
    pub interval: i64,
    #[serde(default)]
    pub until: Option<i64>,
    #[serde(default)]
    pub count: Option<i64>,
    #[serde(default)]
    pub byday: Vec<i64>,
}
fn freq_none() -> String {
    "none".to_string()
}
fn one() -> i64 {
    1
}
impl Default for Recurrence {
    fn default() -> Self {
        Recurrence {
            freq: "none".to_string(),
            interval: 1,
            until: None,
            count: None,
            byday: Vec::new(),
        }
    }
}

// ---- Reminders (cross-cutting) ----
#[derive(Serialize, Clone)]
pub struct Reminder {
    pub id: i64,
    pub parent_type: String,
    pub parent_id: i64,
    pub lead_minutes: i64,
    pub remind_at: Option<i64>,
    pub status: String,
    pub snooze_until: Option<i64>,
    pub dismissed_through: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Deserialize)]
pub struct ReminderInput {
    pub parent_type: String,
    pub parent_id: i64,
    #[serde(default)]
    pub lead_minutes: i64,
    #[serde(default)]
    pub remind_at: Option<i64>,
}
#[derive(Deserialize)]
pub struct SnoozeInput {
    pub minutes: i64,
}
#[derive(Serialize)]
pub struct DueReminder {
    pub reminder_id: i64,
    pub parent_type: String,
    pub parent_id: i64,
    pub parent_title: String,
    pub fire_at: i64,
    pub occurrence_at: i64,
}

// ---- Notes ----
#[derive(Serialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub reminder: Option<Reminder>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Deserialize)]
pub struct NoteInput {
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

// ---- Tasks ----
#[derive(Serialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub done: bool,
    pub priority: String,
    pub tags: Vec<String>,
    pub due_at: Option<i64>,
    pub scheduled_at: Option<i64>,
    pub recurrence: Recurrence,
    pub reminder: Option<Reminder>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Deserialize)]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default = "prio_med")]
    pub priority: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub due_at: Option<i64>,
    #[serde(default)]
    pub scheduled_at: Option<i64>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
}
fn prio_med() -> String {
    "med".to_string()
}
#[derive(Deserialize)]
pub struct DoneInput {
    pub done: bool,
}

// ---- Events ----
#[derive(Serialize)]
pub struct Event {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub location: String,
    pub start_at: i64,
    pub end_at: i64,
    pub all_day: bool,
    pub tags: Vec<String>,
    pub recurrence: Recurrence,
    pub reminder: Option<Reminder>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Deserialize)]
pub struct EventInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub location: String,
    pub start_at: i64,
    pub end_at: i64,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
}

// ============================ Wallet ============================

#[derive(Serialize)]
pub struct Card {
    pub id: i64,
    pub card_name: String,
    pub holder_name: String,
    pub card_number: String,
    pub expiry: String,
    pub cvv: String,
    pub card_type: String,
    pub bank_name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct CardInput {
    #[serde(default)]
    pub card_name: String,
    #[serde(default)]
    pub holder_name: String,
    pub card_number: String,
    #[serde(default)]
    pub expiry: String,
    #[serde(default)]
    pub cvv: String,
    #[serde(default)]
    pub card_type: String,
    #[serde(default)]
    pub bank_name: String,
}

#[derive(Serialize)]
pub struct BankAccount {
    pub id: i64,
    pub holder_name: String,
    pub account_number: String,
    pub ifsc: String,
    pub branch_name: String,
    pub bank_name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct BankAccountInput {
    #[serde(default)]
    pub holder_name: String,
    pub account_number: String,
    #[serde(default)]
    pub ifsc: String,
    #[serde(default)]
    pub branch_name: String,
    #[serde(default)]
    pub bank_name: String,
}

// ---- Unified calendar item ----
#[derive(Serialize)]
pub struct CalendarItem {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: i64,
    pub title: String,
    pub when: i64,
    pub end: Option<i64>,
    pub all_day: bool,
    pub done: Option<bool>,
    pub recurring: bool,
}

// ---- Job models ----
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Job {
    pub id: i64,
    pub sl_no: Option<String>,
    pub job_title: String,
    pub company: String,
    pub salary_package: String,
    pub location: String,
    pub skills_required: Vec<String>,
    pub matched_skills: Vec<String>,
    pub job_type: String,
    pub experience: String,
    pub link_to_apply: String,
    pub status: String,
    pub notes: String,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug)]
pub struct JobInput {
    pub sl_no: Option<String>,
    pub job_title: String,
    pub company: String,
    #[serde(default)]
    pub salary_package: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub skills_required: Vec<String>,
    #[serde(default)]
    pub matched_skills: Vec<String>,
    #[serde(default)]
    pub job_type: String,
    #[serde(default)]
    pub experience: String,
    #[serde(default)]
    pub link_to_apply: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub notes: String,
}

/// Flexible model for parsing jobs payload incoming from Google Apps Script.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IncomingJob {
    #[serde(alias = "slNo", alias = "sl_no", alias = "slno", alias = "id")]
    pub sl_no: Option<serde_json::Value>,

    #[serde(alias = "jobTitle", alias = "job_title", alias = "title", alias = "role")]
    pub job_title: Option<String>,

    #[serde(alias = "company", alias = "companyName", alias = "company_name")]
    pub company: Option<String>,

    #[serde(alias = "salaryPackage", alias = "salary_package", alias = "salary", alias = "package", alias = "ctc")]
    pub salary_package: Option<serde_json::Value>,

    #[serde(alias = "location", alias = "jobLocation", alias = "job_location")]
    pub location: Option<serde_json::Value>,

    #[serde(alias = "skillsRequired", alias = "skills_required", alias = "skills", alias = "requiredSkills")]
    pub skills_required: Option<serde_json::Value>,

    #[serde(alias = "matchedSkills", alias = "matched_skills", alias = "matched")]
    pub matched_skills: Option<serde_json::Value>,

    #[serde(alias = "type", alias = "jobType", alias = "job_type", alias = "employmentType")]
    pub job_type: Option<serde_json::Value>,

    #[serde(alias = "experience", alias = "exp", alias = "experienceRequired")]
    pub experience: Option<serde_json::Value>,

    #[serde(alias = "linkToApply", alias = "link_to_apply", alias = "applyLink", alias = "apply_link", alias = "link", alias = "url")]
    pub link_to_apply: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct WebhookConfigResponse {
    pub webhook_url: String,
    pub webhook_secret: String,
    pub curl_sample: String,
    pub gas_code_sample: String,
}

#[derive(Deserialize)]
pub struct UpdateWebhookConfigInput {
    pub webhook_secret: Option<String>,
}
