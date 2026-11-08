//! Email templates: the built-in catalog and a tiny, safe renderer.
//!
//! Templates are static HTML files (`email_templates/*.html`) embedded at compile
//! time. They use a small mustache-like syntax:
//!
//! * `{{key}}`            the field value, already rendered to safe HTML for its kind
//! * `{{#key}}...{{/key}}` keep the block only when `key` has a value
//! * `{{^key}}...{{/key}}` keep the block only when `key` is empty
//!
//! Every user value is HTML-escaped; URL fields only accept http(s)/mailto links, so a
//! filled template can never inject markup or script. This module is pure `std` so it
//! can be unit-tested without the Spin runtime.

use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// One line of text.
    Text,
    /// Free text; blank lines start paragraphs, single newlines become `<br>`.
    Textarea,
    /// A link (http, https or mailto). Anything else is treated as empty.
    Url,
    /// One bullet per line.
    List,
    /// One table row per line: `Description | Amount`.
    Rows,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Text => "text",
            Kind::Textarea => "textarea",
            Kind::Url => "url",
            Kind::List => "list",
            Kind::Rows => "rows",
        }
    }
}

pub struct Field {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: Kind,
    pub required: bool,
    pub placeholder: &'static str,
}

/// Per-template inline styles for generated markup (paragraphs, bullets, table cells).
pub struct Styles {
    pub p: &'static str,
    pub li: &'static str,
    pub td: &'static str,
    pub td_right: &'static str,
}

pub struct Template {
    pub id: &'static str,
    pub name: &'static str,
    /// "Professional", "Semi-formal" or "Informal".
    pub tone: &'static str,
    pub description: &'static str,
    /// Suggested subject; `{{key}}` placeholders are filled from plain field values.
    pub subject: &'static str,
    /// Accent colour shown on the template card in the app.
    pub accent: &'static str,
    pub fields: &'static [Field],
    pub styles: Styles,
    pub html: &'static str,
}

/// Values every template can use, taken from the sender profile in Email settings.
pub struct Sender<'a> {
    pub name: &'a str,
    pub email: &'a str,
    pub signature: &'a str,
}

const fn f(key: &'static str, label: &'static str, kind: Kind, required: bool, placeholder: &'static str) -> Field {
    Field { key, label, kind, required, placeholder }
}
use Kind::*;

const SANS: Styles = Styles {
    p: "margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;",
    li: "margin:0 0 8px;font-size:15px;line-height:1.55;color:#374151;",
    td: "padding:12px 0;border-bottom:1px solid #E8EAEE;font-size:14px;color:#16181D;",
    td_right: "padding:12px 0;border-bottom:1px solid #E8EAEE;font-size:14px;color:#16181D;text-align:right;white-space:nowrap;",
};
const SERIF: Styles = Styles {
    p: "margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1F2937;",
    li: "margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1F2937;",
    td: SANS.td,
    td_right: SANS.td_right,
};
const WARM: Styles = Styles {
    p: "margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.75;color:#3B3127;",
    li: "margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;color:#3B3127;",
    td: SANS.td,
    td_right: SANS.td_right,
};

pub static TEMPLATES: &[Template] = &[
    Template {
        id: "formal-letter",
        name: "Formal letter",
        tone: "Professional",
        description: "A classic business letter with letterhead, reference line and formal sign-off.",
        subject: "{{reference}}",
        accent: "#16181D",
        fields: &[
            f("organization", "Your organization", Text, false, "Northwind Consulting"),
            f("date", "Date", Text, false, "6 November 2026"),
            f("recipient_name", "Recipient name", Text, true, "Ms. Priya Raman"),
            f("recipient_title", "Recipient title & company", Text, false, "Head of Procurement, Acme Corp"),
            f("reference", "Reference / subject line", Text, true, "Proposal for the 2027 support contract"),
            f("salutation", "Salutation", Text, false, "Dear Ms. Raman,"),
            f("body", "Letter body", Textarea, true, "Thank you for the opportunity to submit our proposal..."),
            f("closing", "Closing", Text, false, "Yours sincerely,"),
            f("sender_title", "Your title", Text, false, "Managing Director"),
        ],
        styles: SERIF,
        html: include_str!("../email_templates/formal-letter.html"),
    },
    Template {
        id: "meeting-invite",
        name: "Meeting invitation",
        tone: "Professional",
        description: "Invite someone to a meeting with date, time, place, join link and agenda.",
        subject: "Invitation: {{meeting_title}} · {{date}}",
        accent: "#2563EB",
        fields: &[
            f("recipient_name", "Recipient name", Text, false, "Arjun"),
            f("meeting_title", "Meeting title", Text, true, "Q1 roadmap review"),
            f("date", "Date", Text, true, "Thursday, 12 November 2026"),
            f("time", "Time", Text, true, "10:30 – 11:15 AM IST"),
            f("location", "Location", Text, false, "Office room 3"),
            f("meeting_link", "Video call link", Url, false, "https://meet.google.com/abc-defg-hij"),
            f("message", "Message", Textarea, false, "I'd like to walk through the roadmap and agree on priorities."),
            f("agenda", "Agenda (one item per line)", List, false, "Wins from Q4\nRoadmap proposal\nOpen questions"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/meeting-invite.html"),
    },
    Template {
        id: "follow-up",
        name: "Follow-up",
        tone: "Professional",
        description: "A crisp follow-up after a call, meeting or proposal, with an optional action button.",
        subject: "Following up on {{context}}",
        accent: "#0E7C86",
        fields: &[
            f("recipient_name", "Recipient name", Text, true, "Daniel"),
            f("context", "Following up on", Text, true, "our call on Tuesday"),
            f("body", "Message", Textarea, true, "As promised, here is a summary of what we discussed and the next steps."),
            f("cta_label", "Button text", Text, false, "Book a time"),
            f("cta_url", "Button link", Url, false, "https://cal.com/you/30min"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/follow-up.html"),
    },
    Template {
        id: "invoice",
        name: "Invoice",
        tone: "Professional",
        description: "A clean invoice / payment request with line items, total and a pay button.",
        subject: "Invoice {{invoice_number}} · due {{due_date}}",
        accent: "#11824B",
        fields: &[
            f("business_name", "Your business name", Text, false, "Sabith Studio"),
            f("client_name", "Bill to", Text, true, "Acme Corp"),
            f("invoice_number", "Invoice number", Text, true, "INV-2026-041"),
            f("issue_date", "Issue date", Text, false, "6 Nov 2026"),
            f("due_date", "Due date", Text, true, "20 Nov 2026"),
            f("items", "Line items (Description | Amount)", Rows, true, "Website redesign | ₹45,000\nHosting (12 months) | ₹6,000"),
            f("total", "Total", Text, true, "₹51,000"),
            f("payment_link", "Payment link", Url, false, "https://pay.example.com/inv-2026-041"),
            f("notes", "Notes / bank details", Textarea, false, "Bank transfer: HDFC Bank, A/C 123456789012, IFSC HDFC0001234"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/invoice.html"),
    },
    Template {
        id: "job-application",
        name: "Job application",
        tone: "Professional",
        description: "A polished cover email for a role, with portfolio and résumé links.",
        subject: "Application for {{position}} – {{sender_name}}",
        accent: "#6A41D8",
        fields: &[
            f("hiring_manager", "Hiring manager", Text, false, "Ms. Chen"),
            f("position", "Position", Text, true, "Senior Rust Engineer"),
            f("company", "Company", Text, true, "Fermyon Technologies"),
            f("body", "Cover letter", Textarea, true, "I'm excited to apply for the Senior Rust Engineer role..."),
            f("highlights", "Key highlights (one per line)", List, false, "6 years building Rust services\nLed a WebAssembly platform migration"),
            f("portfolio_url", "Portfolio / LinkedIn", Url, false, "https://github.com/s4b11"),
            f("resume_url", "Résumé link", Url, false, "https://example.com/resume.pdf"),
            f("phone", "Phone", Text, false, "+91 98765 43210"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/job-application.html"),
    },
    Template {
        id: "project-update",
        name: "Project update",
        tone: "Semi-formal",
        description: "A status report with a status pill, highlights, next steps and blockers.",
        subject: "{{project_name}} update · {{period}}",
        accent: "#2563EB",
        fields: &[
            f("recipient_name", "Recipient / team", Text, false, "Team"),
            f("project_name", "Project", Text, true, "Utility mobile app"),
            f("period", "Period", Text, false, "Week 45"),
            f("status", "Status", Text, true, "On track"),
            f("summary", "Summary", Textarea, true, "We shipped pull-to-refresh and the email templates feature."),
            f("highlights", "Highlights (one per line)", List, false, "Email templates live\nAndroid build green"),
            f("next_steps", "Next steps (one per line)", List, false, "Beta with 5 users\nPolish onboarding"),
            f("blockers", "Risks / blockers", Textarea, false, "Waiting on design sign-off for the settings page."),
        ],
        styles: SANS,
        html: include_str!("../email_templates/project-update.html"),
    },
    Template {
        id: "newsletter",
        name: "Newsletter",
        tone: "Semi-formal",
        description: "A magazine-style update with a headline, two stories and a call to action.",
        subject: "{{headline}}",
        accent: "#B8386A",
        fields: &[
            f("publication", "Newsletter name", Text, false, "The Monthly Note"),
            f("issue", "Issue / date", Text, false, "November 2026"),
            f("headline", "Headline", Text, true, "What we built this month"),
            f("intro", "Intro", Textarea, true, "A quick look at what changed, what we learned and what is next."),
            f("story1_title", "Story 1 title", Text, false, "Pull to refresh"),
            f("story1_text", "Story 1 text", Textarea, false, "Every list in the app now refreshes with a simple pull."),
            f("story2_title", "Story 2 title", Text, false, "Email templates"),
            f("story2_text", "Story 2 text", Textarea, false, "Ten designed templates you can fill and send in seconds."),
            f("cta_label", "Button text", Text, false, "Read more"),
            f("cta_url", "Button link", Url, false, "https://example.com/blog"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/newsletter.html"),
    },
    Template {
        id: "thank-you",
        name: "Thank you note",
        tone: "Semi-formal",
        description: "A warm, centred thank-you card for clients, colleagues or mentors.",
        subject: "Thank you, {{recipient_name}}",
        accent: "#0E7C86",
        fields: &[
            f("recipient_name", "Recipient name", Text, true, "Meera"),
            f("reason", "Thank you for…", Text, true, "your help with the launch"),
            f("message", "Message", Textarea, true, "Your feedback made the release so much better. I really appreciate the time you gave."),
            f("closing", "Closing", Text, false, "With gratitude,"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/thank-you.html"),
    },
    Template {
        id: "event-invite",
        name: "Event invitation",
        tone: "Informal",
        description: "A cheerful invitation for a party, dinner or get-together with an RSVP button.",
        subject: "You're invited: {{event_name}} 🎉",
        accent: "#6A41D8",
        fields: &[
            f("guest_name", "Guest name", Text, false, "Rahul"),
            f("event_name", "Event", Text, true, "Diwali dinner at ours"),
            f("date", "Date", Text, true, "Saturday, 14 Nov"),
            f("time", "Time", Text, false, "7:30 PM onwards"),
            f("venue", "Venue", Text, false, "12 Lake View Road, Kochi"),
            f("message", "Message", Textarea, true, "Good food, lights and great company. It wouldn't be the same without you!"),
            f("rsvp_by", "RSVP by", Text, false, "Thursday, 12 Nov"),
            f("rsvp_url", "RSVP link", Url, false, "mailto:you@example.com?subject=RSVP"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/event-invite.html"),
    },
    Template {
        id: "casual-catchup",
        name: "Friendly catch-up",
        tone: "Informal",
        description: "A relaxed, letter-style note to a friend, with an optional P.S.",
        subject: "Long time no see, {{friend_name}}!",
        accent: "#A45A00",
        fields: &[
            f("friend_name", "Friend's name", Text, true, "Anu"),
            f("greeting", "Greeting", Text, false, "Hey Anu!"),
            f("message", "Message", Textarea, true, "It's been ages! Life has been busy here. Let's grab coffee soon?"),
            f("sign_off", "Sign-off", Text, false, "Cheers,"),
            f("ps", "P.S.", Text, false, "Still owe you that book."),
        ],
        styles: WARM,
        html: include_str!("../email_templates/casual-catchup.html"),
    },
    Template {
        id: "quote-proposal",
        name: "Quotation",
        tone: "Professional",
        description: "A priced quote with line items, total, validity, terms and an accept button.",
        subject: "Quotation {{quote_number}} for {{client_name}}",
        accent: "#1D4ED8",
        fields: &[
            f("business_name", "Your business name", Text, false, "Sabith Studio"),
            f("client_name", "Prepared for", Text, true, "Acme Corp"),
            f("quote_number", "Quote number", Text, true, "Q-2026-118"),
            f("valid_until", "Valid until", Text, false, "30 Nov 2026"),
            f("intro", "Intro", Textarea, false, "Thanks for the brief. Here is our quotation for the work we discussed."),
            f("items", "Line items (Description | Amount)", Rows, true, "Discovery workshop | ₹20,000\nDesign system | ₹60,000"),
            f("total", "Total", Text, true, "₹80,000"),
            f("terms", "Terms", Textarea, false, "50% upfront, 50% on delivery. Prices exclude GST."),
            f("accept_url", "Accept link", Url, false, "https://example.com/quotes/q-2026-118"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/quote-proposal.html"),
    },
    Template {
        id: "payment-reminder",
        name: "Payment reminder",
        tone: "Professional",
        description: "A polite nudge for an unpaid invoice with the amount, due date and a pay button.",
        subject: "Reminder: invoice {{invoice_number}} is due",
        accent: "#C2410C",
        fields: &[
            f("client_name", "Client name", Text, true, "Rohan"),
            f("invoice_number", "Invoice number", Text, true, "INV-2026-041"),
            f("amount", "Amount due", Text, true, "₹51,000"),
            f("due_date", "Due date", Text, true, "20 Nov 2026"),
            f("days_overdue", "Overdue by", Text, false, "7 days"),
            f("message", "Message", Textarea, false, "Just a friendly reminder that this invoice is now past due. Let me know if anything is unclear."),
            f("payment_link", "Payment link", Url, false, "https://pay.example.com/inv-2026-041"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/payment-reminder.html"),
    },
    Template {
        id: "payment-receipt",
        name: "Payment receipt",
        tone: "Professional",
        description: "Confirm a payment with a receipt number, method, line items and total paid.",
        subject: "Receipt {{receipt_number}} – thank you",
        accent: "#11824B",
        fields: &[
            f("business_name", "Your business name", Text, false, "Sabith Studio"),
            f("customer_name", "Customer name", Text, true, "Ananya"),
            f("receipt_number", "Receipt number", Text, true, "RCPT-2026-077"),
            f("paid_on", "Paid on", Text, true, "7 Nov 2026"),
            f("method", "Payment method", Text, false, "UPI"),
            f("items", "Items (Description | Amount)", Rows, true, "Logo design | ₹15,000\nBrand guide | ₹10,000"),
            f("total", "Total paid", Text, true, "₹25,000"),
            f("note", "Note", Textarea, false, "Thank you for your business! Keep this email for your records."),
        ],
        styles: SANS,
        html: include_str!("../email_templates/payment-receipt.html"),
    },
    Template {
        id: "introduction",
        name: "Introduction",
        tone: "Professional",
        description: "Connect two people, with a line on why and a short note about each.",
        subject: "Introduction: {{person_a}} ⇄ {{person_b}}",
        accent: "#0E7C86",
        fields: &[
            f("person_a", "First person", Text, true, "Kiran"),
            f("person_b", "Second person", Text, true, "Neha"),
            f("reason", "Why you're connecting them", Textarea, true, "You're both working on developer tooling and I think you'd enjoy comparing notes."),
            f("a_about", "About the first person", Textarea, true, "Kiran leads platform engineering at Globex and built their internal deploy tooling."),
            f("b_about", "About the second person", Textarea, true, "Neha is a founder building a CI product for small teams."),
        ],
        styles: SANS,
        html: include_str!("../email_templates/introduction.html"),
    },
    Template {
        id: "meeting-recap",
        name: "Meeting recap",
        tone: "Professional",
        description: "Notes after a meeting: summary, decisions, action items and the next meeting.",
        subject: "Recap: {{meeting_title}}",
        accent: "#2563EB",
        fields: &[
            f("meeting_title", "Meeting", Text, true, "Q1 roadmap review"),
            f("date", "Date", Text, false, "12 Nov 2026"),
            f("attendees", "Attendees", Text, false, "Asha, Ben, Chen"),
            f("summary", "Summary", Textarea, true, "We agreed on the Q1 priorities and the release plan."),
            f("decisions", "Decisions (one per line)", List, false, "Ship the mobile app in January\nPause the desktop widget"),
            f("action_items", "Action items (one per line)", List, false, "Asha – share mockups by Friday\nBen – draft the release notes"),
            f("next_meeting", "Next meeting", Text, false, "Thursday, 19 Nov at 10:30"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/meeting-recap.html"),
    },
    Template {
        id: "interview-invite",
        name: "Interview invitation",
        tone: "Professional",
        description: "Invite a candidate to interview with the schedule, format, panel and join link.",
        subject: "Interview invitation – {{position}} at {{company}}",
        accent: "#6A41D8",
        fields: &[
            f("candidate_name", "Candidate name", Text, true, "Arjun"),
            f("position", "Position", Text, true, "Frontend Engineer"),
            f("company", "Company", Text, true, "Northwind Labs"),
            f("date", "Date", Text, true, "Tuesday, 17 Nov 2026"),
            f("time", "Time", Text, true, "3:00 PM IST"),
            f("duration", "Duration", Text, false, "45 minutes"),
            f("mode", "Format", Text, false, "Video call"),
            f("meeting_link", "Join link", Url, false, "https://meet.google.com/abc-defg-hij"),
            f("interviewers", "Interviewers (one per line)", List, false, "Priya – Engineering Manager\nTom – Senior Engineer"),
            f("message", "Message", Textarea, false, "Thanks for applying! We enjoyed your portfolio and would love to talk."),
            f("confirm_url", "Confirm link", Url, false, "mailto:hiring@example.com?subject=Interview%20confirmed"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/interview-invite.html"),
    },
    Template {
        id: "offer-letter",
        name: "Job offer",
        tone: "Professional",
        description: "An elegant offer letter with the key terms in a table and an accept button.",
        subject: "Offer of employment – {{position}}",
        accent: "#16181D",
        fields: &[
            f("company", "Company", Text, true, "Northwind Labs"),
            f("candidate_name", "Candidate name", Text, true, "Ms. Kavya Nair"),
            f("position", "Position", Text, true, "Senior Product Designer"),
            f("start_date", "Start date", Text, true, "4 January 2027"),
            f("compensation", "Compensation", Text, true, "₹24,00,000 per annum"),
            f("reporting_to", "Reporting to", Text, false, "Head of Design"),
            f("location", "Location", Text, false, "Bengaluru (hybrid)"),
            f("body", "Letter body", Textarea, false, "We were impressed by your work and are delighted to offer you this role."),
            f("respond_by", "Respond by", Text, false, "20 November 2026"),
            f("accept_url", "Accept link", Url, false, "https://example.com/offers/accept"),
        ],
        styles: SERIF,
        html: include_str!("../email_templates/offer-letter.html"),
    },
    Template {
        id: "leave-request",
        name: "Leave request",
        tone: "Professional",
        description: "Ask your manager for time off, with the dates, reason and who covers for you.",
        subject: "Leave request: {{from_date}} – {{to_date}}",
        accent: "#0E7C86",
        fields: &[
            f("manager_name", "Manager's name", Text, true, "Priya"),
            f("leave_type", "Type of leave", Text, false, "annual leave"),
            f("from_date", "From", Text, true, "Wed, 23 Dec"),
            f("to_date", "To", Text, true, "Fri, 25 Dec"),
            f("total_days", "Total", Text, false, "3 working days"),
            f("reason", "Reason", Textarea, false, "Family visit over the holidays."),
            f("coverage", "Cover while away", Textarea, false, "Arjun will handle releases and I'll hand over open tickets before I leave."),
            f("reachable", "Availability", Text, false, "Reachable on phone for anything urgent"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/leave-request.html"),
    },
    Template {
        id: "resignation",
        name: "Resignation letter",
        tone: "Professional",
        description: "A gracious, formal resignation with your last day and a handover plan.",
        subject: "Resignation – {{sender_name}}",
        accent: "#374151",
        fields: &[
            f("manager_name", "Manager's name", Text, true, "Mr. Mehta"),
            f("position", "Your position", Text, true, "Software Engineer"),
            f("company", "Company", Text, true, "Globex"),
            f("last_day", "Last working day", Text, true, "31 December 2026"),
            f("body", "Message", Textarea, false, "Thank you for your guidance and support over the past three years."),
            f("handover", "Handover plan (one per line)", List, false, "Document the deploy pipeline\nTrain Arjun on the billing service"),
        ],
        styles: SERIF,
        html: include_str!("../email_templates/resignation.html"),
    },
    Template {
        id: "welcome-onboarding",
        name: "Welcome aboard",
        tone: "Semi-formal",
        description: "Welcome a new teammate or client with key details, a first-week checklist and a link.",
        subject: "Welcome aboard, {{name}}! 🎉",
        accent: "#2563EB",
        fields: &[
            f("name", "Their name", Text, true, "Meera"),
            f("team", "Team / company", Text, true, "the Product team"),
            f("start_date", "Start date", Text, false, "Monday, 16 Nov"),
            f("manager", "Buddy / manager", Text, false, "Arjun"),
            f("message", "Message", Textarea, true, "We're so happy you're joining us. Here's everything you need for a smooth first week."),
            f("checklist", "First-week checklist (one per line)", List, false, "Set up your laptop\nMeet the team at standup\nRead the product handbook"),
            f("cta_label", "Button text", Text, false, "Open the handbook"),
            f("cta_url", "Button link", Url, false, "https://example.com/handbook"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/welcome-onboarding.html"),
    },
    Template {
        id: "announcement",
        name: "Announcement",
        tone: "Semi-formal",
        description: "Share news or a launch with a bold headline, what's new and a call to action.",
        subject: "{{headline}}",
        accent: "#B8386A",
        fields: &[
            f("label", "Label", Text, false, "New feature"),
            f("headline", "Headline", Text, true, "Notifications are here"),
            f("body", "Body", Textarea, true, "You'll now see overdue tasks, upcoming events and reminders in one place."),
            f("features", "What's new (one per line)", List, false, "One notification centre\nSnooze and done for reminders\nWorks on web and Android"),
            f("cta_label", "Button text", Text, false, "Try it now"),
            f("cta_url", "Button link", Url, false, "https://utility.fermyon.app/"),
            f("footer_note", "Footer note", Text, false, "You're receiving this because you use Utility."),
        ],
        styles: SANS,
        html: include_str!("../email_templates/announcement.html"),
    },
    Template {
        id: "feedback-request",
        name: "Feedback request",
        tone: "Semi-formal",
        description: "Ask for a quick review or survey with a friendly star header and one button.",
        subject: "Quick favour: your feedback on {{topic}}",
        accent: "#0E7C86",
        fields: &[
            f("recipient_name", "Recipient name", Text, true, "Daniel"),
            f("topic", "Feedback on", Text, true, "the new onboarding flow"),
            f("message", "Message", Textarea, false, "You were one of the first to try it, so your view really matters."),
            f("survey_url", "Survey / form link", Url, true, "https://forms.gle/example"),
            f("time_needed", "Time needed", Text, false, "2 minutes"),
            f("deadline", "Reply by", Text, false, "Friday"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/feedback-request.html"),
    },
    Template {
        id: "incident-notice",
        name: "Incident notice",
        tone: "Semi-formal",
        description: "Explain an outage or issue: status, timeline, impact, the fix and next steps.",
        subject: "[{{status}}] {{service}} incident",
        accent: "#B42318",
        fields: &[
            f("service", "Service", Text, true, "Utility sync"),
            f("status", "Status", Text, true, "Resolved"),
            f("started", "Started", Text, false, "7 Nov, 10:05 IST"),
            f("resolved", "Resolved", Text, false, "7 Nov, 10:40 IST"),
            f("summary", "What happened", Textarea, true, "A configuration change caused sync requests to fail for about 35 minutes."),
            f("impact", "Impact", Textarea, false, "Changes made during this window were saved locally and synced once service recovered."),
            f("fix", "What we did", Textarea, false, "We rolled back the change and added a check that blocks similar configurations."),
            f("next_steps", "Next steps (one per line)", List, false, "Add an alert for sync error rates\nPublish a full post-mortem"),
            f("status_url", "Status page link", Url, false, "https://status.example.com"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/incident-notice.html"),
    },
    Template {
        id: "webinar-invite",
        name: "Webinar invitation",
        tone: "Semi-formal",
        description: "Promote a talk or webinar with a dark hero, agenda, speakers and a register button.",
        subject: "Join us: {{event_name}} on {{date}}",
        accent: "#6A41D8",
        fields: &[
            f("event_name", "Event name", Text, true, "Shipping Rust to the edge"),
            f("tagline", "Tagline", Text, false, "A 45-minute deep dive into WebAssembly on Fermyon"),
            f("date", "Date", Text, true, "Thu, 26 Nov"),
            f("time", "Time", Text, true, "6:00 PM IST"),
            f("message", "Message", Textarea, false, "Join us live for practical lessons and a Q&A at the end."),
            f("agenda", "Agenda (one per line)", List, false, "Why WebAssembly on the server\nA live deploy\nQ&A"),
            f("speakers", "Speakers (one per line)", List, false, "Sabith S B – Product Engineer"),
            f("host", "Hosted by", Text, false, "Kochi Rust Meetup"),
            f("register_url", "Register link", Url, false, "https://example.com/register"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/webinar-invite.html"),
    },
    Template {
        id: "recommendation-request",
        name: "Reference request",
        tone: "Semi-formal",
        description: "Ask a former manager or colleague to vouch for you, with context and pointers.",
        subject: "Would you be a reference for me?",
        accent: "#A45A00",
        fields: &[
            f("recipient_name", "Recipient name", Text, true, "Anita"),
            f("purpose", "Applying for", Text, true, "the Senior Engineer role at Globex"),
            f("context", "How you know each other", Textarea, true, "We worked together at Initech for two years, where I led the payments migration under your guidance."),
            f("points", "Things they might mention (one per line)", List, false, "Led the payments migration\nMentored two junior engineers"),
            f("deadline", "Deadline", Text, false, "25 November"),
            f("submit_url", "Reference form link", Url, false, "https://example.com/reference"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/recommendation-request.html"),
    },
    Template {
        id: "birthday-wishes",
        name: "Birthday wishes",
        tone: "Informal",
        description: "A joyful birthday card with cake, confetti and a highlighted wish.",
        subject: "Happy birthday, {{name}}! 🎂",
        accent: "#DB2777",
        fields: &[
            f("name", "Their name", Text, true, "Anu"),
            f("message", "Message", Textarea, true, "Another year of being wonderful! Hope your day is full of laughter, cake and people you love."),
            f("wish", "Highlighted wish", Text, false, "Have the best year yet!"),
            f("sign_off", "Sign-off", Text, false, "Lots of love,"),
        ],
        styles: WARM,
        html: include_str!("../email_templates/birthday-wishes.html"),
    },
    Template {
        id: "congratulations",
        name: "Congratulations",
        tone: "Informal",
        description: "Celebrate a win, promotion or milestone with a trophy header.",
        subject: "Congratulations, {{name}}! 🏆",
        accent: "#11824B",
        fields: &[
            f("name", "Their name", Text, true, "Rahul"),
            f("achievement", "Celebrating", Text, true, "your promotion to Engineering Manager"),
            f("message", "Message", Textarea, true, "So well deserved! Your team is lucky to have you. Let's celebrate soon."),
            f("sign_off", "Sign-off", Text, false, "So proud of you,"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/congratulations.html"),
    },
    Template {
        id: "holiday-greetings",
        name: "Holiday greetings",
        tone: "Informal",
        description: "A festive card for Diwali, Christmas, Eid, Onam or the new year.",
        subject: "{{occasion}} from {{sender_name}}",
        accent: "#B45309",
        fields: &[
            f("name", "Dear…", Text, false, "friends and family"),
            f("occasion", "Occasion", Text, true, "Season's greetings"),
            f("message", "Message", Textarea, true, "As the year winds down, I'm grateful for all of you and the moments we shared."),
            f("wish", "Wish", Text, false, "Wishing you joy, peace and good health in the new year."),
            f("sign_off", "Sign-off", Text, false, "Warm wishes,"),
        ],
        styles: WARM,
        html: include_str!("../email_templates/holiday-greetings.html"),
    },
    Template {
        id: "farewell",
        name: "Farewell",
        tone: "Informal",
        description: "Say goodbye to your team with favourite memories and a way to stay in touch.",
        subject: "Farewell and thank you 👋",
        accent: "#2563EB",
        fields: &[
            f("colleague_name", "To", Text, true, "the whole team"),
            f("message", "Message", Textarea, true, "Today is my last day. Working with you has been the best part of these three years."),
            f("memories", "Favourite memories (one per line)", List, false, "The launch-night pizza\nOur Friday demo days"),
            f("keep_in_touch", "Keep in touch", Text, false, "I'd love to stay in touch. Find me on LinkedIn."),
            f("contact_url", "Contact link", Url, false, "https://www.linkedin.com/in/example"),
            f("sign_off", "Sign-off", Text, false, "Until next time,"),
        ],
        styles: SANS,
        html: include_str!("../email_templates/farewell.html"),
    },
    Template {
        id: "get-well-soon",
        name: "Get well soon",
        tone: "Informal",
        description: "A gentle note with flowers to wish someone a speedy recovery.",
        subject: "Get well soon, {{name}} 💐",
        accent: "#0E7C86",
        fields: &[
            f("name", "Their name", Text, true, "Meera"),
            f("message", "Message", Textarea, true, "Sorry to hear you're unwell. Rest up and take all the time you need."),
            f("offer", "Offer of help", Text, false, "Let me know if you need groceries or anything at all."),
            f("sign_off", "Sign-off", Text, false, "Thinking of you,"),
        ],
        styles: WARM,
        html: include_str!("../email_templates/get-well-soon.html"),
    },
];

pub fn find(id: &str) -> Option<&'static Template> {
    TEMPLATES.iter().find(|t| t.id == id)
}

/// Escape text for HTML element content and attribute values.
pub fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Only absolute http(s) and mailto links survive; everything else is dropped.
pub fn safe_url(raw: &str) -> Option<String> {
    let v = raw.trim();
    let lower = v.to_ascii_lowercase();
    let ok = (lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:"))
        && !v.chars().any(|c| c.is_control() || c == ' ' || c == '"' || c == '<' || c == '>');
    ok.then(|| escape(v))
}

fn paragraphs(text: &str, p_style: &str) -> String {
    let normalized = text.replace("\r\n", "\n");
    let mut out = String::new();
    let mut para: Vec<&str> = Vec::new();
    let flush = |para: &mut Vec<&str>, out: &mut String| {
        if !para.is_empty() {
            let inner = para.iter().map(|l| escape(l.trim_end())).collect::<Vec<_>>().join("<br>");
            out.push_str(&format!("<p style=\"{p_style}\">{inner}</p>"));
            para.clear();
        }
    };
    for line in normalized.split('\n') {
        if line.trim().is_empty() {
            flush(&mut para, &mut out);
        } else {
            para.push(line);
        }
    }
    flush(&mut para, &mut out);
    out
}

fn lines(text: &str) -> impl Iterator<Item = &str> {
    text.lines().map(str::trim).map(|l| l.trim_start_matches(['-', '*', '•']).trim()).filter(|l| !l.is_empty())
}

/// Render one field value to safe HTML for its kind (empty string = no value).
pub fn render_value(kind: Kind, raw: &str, styles: &Styles) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    match kind {
        Kind::Text => escape(raw),
        Kind::Textarea => paragraphs(raw, styles.p),
        Kind::Url => safe_url(raw).unwrap_or_default(),
        Kind::List => lines(raw)
            .map(|l| format!("<li style=\"{}\">{}</li>", styles.li, escape(l)))
            .collect(),
        Kind::Rows => lines(raw)
            .map(|l| {
                let (desc, amount) = l.split_once('|').unwrap_or((l, ""));
                format!(
                    "<tr><td style=\"{}\">{}</td><td style=\"{}\">{}</td></tr>",
                    styles.td,
                    escape(desc.trim()),
                    styles.td_right,
                    escape(amount.trim())
                )
            })
            .collect(),
    }
}

/// Expand `{{#k}}`/`{{^k}}` sections, then `{{k}}` variables. Unknown keys render empty.
pub fn expand(src: &str, values: &HashMap<&str, String>) -> String {
    let mut out = String::with_capacity(src.len());
    let mut rest = src;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            out.push_str(&rest[start..]);
            return out;
        };
        let tag = after[..end].trim();
        let tail = &after[end + 2..];
        if let Some(key) = tag.strip_prefix('#').or_else(|| tag.strip_prefix('^')) {
            let key = key.trim();
            let inverted = tag.starts_with('^');
            let close = format!("{{{{/{key}}}}}");
            let Some(close_at) = tail.find(&close) else {
                // Unclosed section: drop the tag, keep going.
                rest = tail;
                continue;
            };
            let inner = &tail[..close_at];
            let has = values.get(key).is_some_and(|v| !v.is_empty());
            if has != inverted {
                out.push_str(&expand(inner, values));
            }
            rest = &tail[close_at + close.len()..];
        } else if tag.starts_with('/') {
            rest = tail; // stray close tag
        } else {
            if let Some(v) = values.get(tag) {
                out.push_str(v);
            }
            rest = tail;
        }
    }
    out.push_str(rest);
    out
}

/// Fill a template. In `preview` mode, empty required fields show their label so the
/// layout stays visible; otherwise a missing required field is an error naming its key.
pub fn render(
    t: &Template,
    input: &HashMap<String, String>,
    sender: &Sender,
    preview: bool,
) -> Result<String, String> {
    let mut values: HashMap<&str, String> = HashMap::new();
    for field in t.fields {
        let raw = input.get(field.key).map(String::as_str).unwrap_or("").trim();
        if raw.is_empty() && field.required {
            if !preview {
                return Err(field.key.to_string());
            }
            // Show "[Line items]" rather than "[Line items (Description | Amount)]".
            let name = field.label.split(" (").next().unwrap_or(field.label);
            let shown = match field.kind {
                Kind::Url => String::new(),
                Kind::Rows => format!("[{name}] | …"),
                _ => format!("[{name}]"),
            };
            values.insert(field.key, render_value(field.kind, &shown, &t.styles));
            continue;
        }
        values.insert(field.key, render_value(field.kind, raw, &t.styles));
    }
    let sender_name = if sender.name.trim().is_empty() && preview { "Your name" } else { sender.name };
    values.insert("sender_name", escape(sender_name.trim()));
    values.insert("sender_email", escape(sender.email.trim()));
    values.insert(
        "sender_email_url",
        safe_url(&format!("mailto:{}", sender.email.trim())).filter(|_| !sender.email.trim().is_empty()).unwrap_or_default(),
    );
    values.insert("signature", render_value(Kind::Textarea, sender.signature, &t.styles));
    Ok(expand(t.html, &values))
}

/// Fill the suggested subject from plain field values (no HTML).
pub fn subject(t: &Template, input: &HashMap<String, String>, sender: &Sender) -> String {
    let mut values: HashMap<&str, String> = HashMap::new();
    for field in t.fields {
        values.insert(field.key, input.get(field.key).map(|v| v.trim().to_string()).unwrap_or_default());
    }
    values.insert("sender_name", sender.name.trim().to_string());
    expand(t.subject, &values).split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A readable plain-text alternative for clients that don't render HTML.
pub fn to_plain_text(html: &str) -> String {
    let mut s = html.to_string();
    // Drop <head>/<style> blocks entirely.
    for tag in ["style", "head", "title"] {
        loop {
            let open = format!("<{tag}");
            let close = format!("</{tag}>");
            let Some(a) = s.find(&open) else { break };
            let Some(b) = s[a..].find(&close) else { break };
            s.replace_range(a..a + b + close.len(), "");
        }
    }
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in s.chars() {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let name = tag.trim_start_matches('/').split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or("").to_ascii_lowercase();
                match name.as_str() {
                    "br" | "p" | "tr" | "h1" | "h2" | "h3" | "h4" | "div" | "table" => out.push('\n'),
                    "li" if !tag.starts_with('/') => out.push_str("\n• "),
                    "td" if tag.starts_with('/') => out.push_str("  "),
                    _ => {}
                }
                tag.clear();
            } else {
                tag.push(c);
            }
        } else if c == '<' {
            in_tag = true;
        } else {
            out.push(c);
        }
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&middot;", "·")
        .replace("&rarr;", "→")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    let mut result = Vec::new();
    let mut blank = 0;
    for line in decoded.lines() {
        let l = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if l.is_empty() {
            blank += 1;
            if blank == 1 && !result.is_empty() {
                result.push(String::new());
            }
        } else {
            blank = 0;
            result.push(l);
        }
    }
    while result.last().is_some_and(|l| l.is_empty()) {
        result.pop();
    }
    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sender() -> Sender<'static> {
        Sender { name: "Sabith", email: "me@example.com", signature: "Sabith S B\nUtility" }
    }

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn catalog_has_thirty_unique_templates() {
        assert_eq!(TEMPLATES.len(), 30);
        let mut ids: Vec<_> = TEMPLATES.iter().map(|t| t.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 30);
    }

    #[test]
    fn every_template_renders_in_preview_and_with_placeholders() {
        for t in TEMPLATES {
            let html = render(t, &HashMap::new(), &sender(), true).expect(t.id);
            assert!(html.contains("<html"), "{} is not a full document", t.id);
            assert!(!html.contains("{{"), "{} left a tag unexpanded", t.id);
            let filled: HashMap<String, String> =
                t.fields.iter().map(|f| (f.key.to_string(), f.placeholder.to_string())).collect();
            let html = render(t, &filled, &sender(), false).expect(t.id);
            assert!(!html.contains("{{"), "{} left a tag unexpanded", t.id);
            assert!(html.contains("Sabith"), "{} lost the sender name", t.id);
            let subject = subject(t, &filled, &sender());
            assert!(!subject.is_empty() && !subject.contains("{{"), "{} subject: {subject}", t.id);
            let text = to_plain_text(&html);
            assert!(!text.contains('<'), "{} plain text has markup", t.id);
        }
    }

    #[test]
    fn every_field_is_used_and_every_tag_is_known() {
        const BUILTIN: [&str; 4] = ["sender_name", "sender_email", "sender_email_url", "signature"];
        for t in TEMPLATES {
            for f in t.fields {
                assert!(t.html.contains(&format!("{{{{{}}}}}", f.key)), "{}: field {} never shown", t.id, f.key);
            }
            let mut rest = t.html;
            while let Some(i) = rest.find("{{") {
                let after = &rest[i + 2..];
                let end = after.find("}}").expect("unclosed tag");
                let tag = after[..end].trim().trim_start_matches(['#', '^', '/']);
                assert!(
                    BUILTIN.contains(&tag) || t.fields.iter().any(|f| f.key == tag),
                    "{}: unknown tag {{{{{}}}}}",
                    t.id,
                    tag
                );
                rest = &after[end + 2..];
            }
            for key in t.subject.split("{{").skip(1).filter_map(|s| s.split("}}").next()) {
                assert!(BUILTIN.contains(&key) || t.fields.iter().any(|f| f.key == key), "{}: subject tag {}", t.id, key);
            }
        }
    }

    #[test]
    fn missing_required_field_is_reported() {
        let t = find("follow-up").unwrap();
        let err = render(t, &map(&[("recipient_name", "Dan")]), &sender(), false).unwrap_err();
        assert_eq!(err, "context");
    }

    #[test]
    fn values_are_escaped() {
        let t = find("thank-you").unwrap();
        let input = map(&[
            ("recipient_name", "<script>alert(1)</script>"),
            ("reason", "\"quotes\" & 'apostrophes'"),
            ("message", "Line one\nLine two\n\nNew paragraph <b>bold?</b>"),
        ]);
        let html = render(t, &input, &sender(), false).unwrap();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(html.contains("&quot;quotes&quot; &amp; &#39;apostrophes&#39;"));
        assert!(html.contains("Line one<br>Line two"));
        assert!(html.contains("&lt;b&gt;bold?&lt;/b&gt;"));
    }

    #[test]
    fn unsafe_urls_are_dropped_and_sections_hidden() {
        let t = find("follow-up").unwrap();
        let base = [("recipient_name", "Dan"), ("context", "our call"), ("body", "Hi"), ("cta_label", "Open")];
        let mut input = map(&base);
        input.insert("cta_url".into(), "javascript:alert(1)".into());
        let html = render(t, &input, &sender(), false).unwrap();
        assert!(!html.contains("javascript:"));
        assert!(!html.contains(">Open<"), "button should be hidden without a safe link");
        input.insert("cta_url".into(), "https://example.com/a?b=1&c=2".into());
        let html = render(t, &input, &sender(), false).unwrap();
        assert!(html.contains("href=\"https://example.com/a?b=1&amp;c=2\""));
    }

    #[test]
    fn lists_and_rows_render() {
        let s = &TEMPLATES[0].styles;
        let list = render_value(Kind::List, "- one\n\n* two\n• three", s);
        assert_eq!(list.matches("<li").count(), 3);
        assert!(list.contains(">one<") && list.contains(">three<"));
        let rows = render_value(Kind::Rows, "Design | ₹10\nNo amount", s);
        assert_eq!(rows.matches("<tr>").count(), 2);
        assert!(rows.contains(">₹10<"));
    }

    #[test]
    fn sections_and_inverted_sections() {
        let mut v = HashMap::new();
        v.insert("a", "X".to_string());
        v.insert("b", String::new());
        assert_eq!(expand("{{#a}}[{{a}}]{{/a}}{{#b}}no{{/b}}{{^b}}yes{{/b}}{{missing}}", &v), "[X]yes");
    }

    #[test]
    fn plain_text_is_readable() {
        let text = to_plain_text("<html><head><style>p{}</style></head><body><h1>Hi &amp; bye</h1><p>One<br>Two</p><ul><li>A</li><li>B</li></ul></body></html>");
        assert_eq!(text, "Hi & bye\n\nOne\nTwo\n\n• A\n• B");
    }
}
