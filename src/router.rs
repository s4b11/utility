use spin_sdk::http::Router;

use crate::{handlers, static_files};

/// Build the route table. Internal routing for the single HTTP component.
pub fn build() -> Router {
    let mut r = Router::new();

    // Public auth endpoints.
    r.get("/api/setup-status", handlers::setup::status);
    r.post("/api/setup", handlers::setup::create_owner);
    r.post("/api/login", handlers::session::login);

    // Session endpoints (auth required).
    r.post("/api/logout", handlers::session::logout);
    r.get("/api/me", handlers::session::me);

    // Two-factor auth (TOTP).
    r.post("/api/2fa/setup", handlers::twofa::setup);
    r.post("/api/2fa/enable", handlers::twofa::enable);
    r.post("/api/2fa/disable", handlers::twofa::disable);

    // Commands CRUD.
    r.get("/api/commands", handlers::commands::list);
    r.post("/api/commands", handlers::commands::create);
    r.get("/api/commands/:id", handlers::commands::get);
    r.put("/api/commands/:id", handlers::commands::update);
    r.delete("/api/commands/:id", handlers::commands::delete);

    // Links CRUD.
    r.get("/api/links", handlers::links::list);
    r.post("/api/links", handlers::links::create);
    r.get("/api/links/:id", handlers::links::get);
    r.put("/api/links/:id", handlers::links::update);
    r.delete("/api/links/:id", handlers::links::delete);

    // Tools.
    r.post_async("/api/agent/chat", handlers::agent::chat);
    r.get("/api/agent/settings", handlers::agent::settings);
    r.post("/api/agent/settings", handlers::agent::configure);
    r.get("/api/agent/proposals", handlers::agent::proposals);
    r.post("/api/agent/proposals/:id/approve", handlers::agent::approve);
    r.post("/api/agent/proposals/:id/reject", handlers::agent::reject);
    r.post("/api/tools/markdown", handlers::markdown::render);

    // Email templates (sent through the owner's Google Apps Script Gmail relay).
    r.get("/api/email/settings", handlers::email::get_settings);
    r.put("/api/email/settings", handlers::email::update_settings);
    r.get("/api/email/templates", handlers::email::templates);
    r.post("/api/email/render", handlers::email::render);
    r.post_async("/api/email/send", handlers::email::send);
    r.post_async("/api/email/test", handlers::email::test);
    r.get("/api/email/history", handlers::email::history);
    r.delete("/api/email/history/:id", handlers::email::delete_history);

    // Notes CRUD.
    r.get("/api/notes", handlers::notes::list);
    r.post("/api/notes", handlers::notes::create);
    r.get("/api/notes/:id", handlers::notes::get);
    r.put("/api/notes/:id", handlers::notes::update);
    r.delete("/api/notes/:id", handlers::notes::delete);

    // Tasks CRUD + toggle done.
    r.get("/api/tasks", handlers::tasks::list);
    r.post("/api/tasks", handlers::tasks::create);
    r.get("/api/tasks/:id", handlers::tasks::get);
    r.put("/api/tasks/:id", handlers::tasks::update);
    r.put("/api/tasks/:id/done", handlers::tasks::toggle_done);
    r.delete("/api/tasks/:id", handlers::tasks::delete);

    // Events CRUD.
    r.get("/api/events", handlers::events::list);
    r.post("/api/events", handlers::events::create);
    r.get("/api/events/:id", handlers::events::get);
    r.put("/api/events/:id", handlers::events::update);
    r.delete("/api/events/:id", handlers::events::delete);

    // Reminders.
    r.get("/api/reminders", handlers::reminders::list);
    r.post("/api/reminders", handlers::reminders::create);
    r.get("/api/reminders/due", handlers::reminders::due);
    r.put("/api/reminders/:id/snooze", handlers::reminders::snooze);
    r.put("/api/reminders/:id/dismiss", handlers::reminders::dismiss);
    r.delete("/api/reminders/:id", handlers::reminders::cancel);

    // Unified calendar.
    r.get("/api/calendar/items", handlers::calendar::items);

    // In-app notifications
    r.get("/api/notifications", handlers::notifications::list);
    r.post("/api/notifications/read", handlers::notifications::read);
    r.post("/api/notifications/dismiss", handlers::notifications::dismiss);

    // Cards (wallet).
    r.get("/api/cards", handlers::wallet::cards_list);
    r.post("/api/cards", handlers::wallet::cards_create);
    r.get("/api/cards/:id", handlers::wallet::cards_get);
    r.put("/api/cards/:id", handlers::wallet::cards_update);
    r.delete("/api/cards/:id", handlers::wallet::cards_delete);

    // Bank accounts (wallet).
    r.get("/api/banks", handlers::wallet::banks_list);
    r.post("/api/banks", handlers::wallet::banks_create);
    r.get("/api/banks/:id", handlers::wallet::banks_get);
    r.put("/api/banks/:id", handlers::wallet::banks_update);
    r.delete("/api/banks/:id", handlers::wallet::banks_delete);

    // Jobs Webhook (Bearer token authenticated for Google Apps Script).
    r.post("/api/webhook", handlers::jobs::webhook);
    r.post("/api/webhook/jobs", handlers::jobs::webhook);

    // Jobs CRUD & Webhook Config (Dashboard session authenticated).
    r.get("/api/jobs", handlers::jobs::list);
    r.post("/api/jobs", handlers::jobs::create);
    r.delete("/api/jobs", handlers::jobs::clear_all);
    r.get("/api/jobs/webhook-config", handlers::jobs::get_webhook_config);
    r.post("/api/jobs/webhook-config", handlers::jobs::update_webhook_config);
    r.get("/api/jobs/:id", handlers::jobs::get);
    r.put("/api/jobs/:id", handlers::jobs::update);
    r.delete("/api/jobs/:id", handlers::jobs::delete);

    // PWA: service worker (must be at root scope) + web app manifest.
    r.get("/sw.js", static_files::serve_sw);
    r.get("/manifest.webmanifest", static_files::serve_manifest);

    // Static assets and SPA fallback.
    r.get("/assets/*", static_files::serve_asset);
    r.get("/fonts/*", static_files::serve_font);
    r.get("/icons/*", static_files::serve_icon);
    r.get("/", static_files::serve_index);
    r.any("/*", static_files::spa_fallback);

    r
}
