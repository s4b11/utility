use pulldown_cmark::{html, Options, Parser};

/// Render Markdown to HTML and sanitize it server-side (strips scripts, event handlers,
/// javascript: URLs, and disallowed tags via ammonia's safe defaults).
pub fn to_safe_html(markdown: &str) -> String {
    let normalized = markdown.replace("\r\n", "\n");

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(&normalized, options);
    let mut raw_html = String::new();
    html::push_html(&mut raw_html, parser);

    ammonia::clean(&raw_html)
}
