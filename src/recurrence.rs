// Recurrence expansion for tasks and events. Pure date math on UTC NaiveDateTime.
// NOTE: times are stored as UTC unix seconds; expansion adds fixed days/weeks or
// calendar months/years. A recurring wall-clock time can therefore drift by up to an
// hour across a DST boundary — accepted trade-off (no per-item timezone in v1).
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, Timelike, Utc, Weekday};

const MAX_OCC: usize = 1000;

#[derive(Clone, PartialEq)]
pub enum Freq {
    None,
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Clone)]
pub struct Rule {
    pub freq: Freq,
    pub interval: i64,
    pub until: Option<i64>,
    pub count: Option<i64>,
    pub byday: Vec<Weekday>,
}

impl Rule {
    pub fn from_cols(
        freq: &str,
        interval: i64,
        until: Option<i64>,
        count: Option<i64>,
        byday_csv: &str,
    ) -> Self {
        let freq = match freq {
            "daily" => Freq::Daily,
            "weekly" => Freq::Weekly,
            "monthly" => Freq::Monthly,
            "yearly" => Freq::Yearly,
            _ => Freq::None,
        };
        let byday = byday_csv
            .split(',')
            .filter_map(|s| s.trim().parse::<u32>().ok())
            .filter_map(weekday_from_num)
            .collect();
        Rule {
            freq,
            interval: interval.max(1),
            until,
            count,
            byday,
        }
    }

    pub fn is_recurring(&self) -> bool {
        self.freq != Freq::None
    }
}

fn weekday_from_num(n: u32) -> Option<Weekday> {
    match n {
        0 => Some(Weekday::Mon),
        1 => Some(Weekday::Tue),
        2 => Some(Weekday::Wed),
        3 => Some(Weekday::Thu),
        4 => Some(Weekday::Fri),
        5 => Some(Weekday::Sat),
        6 => Some(Weekday::Sun),
        _ => None,
    }
}

fn ndt(secs: i64) -> NaiveDateTime {
    DateTime::<Utc>::from_timestamp(secs, 0)
        .unwrap_or_else(|| DateTime::<Utc>::from_timestamp(0, 0).unwrap())
        .naive_utc()
}
fn to_secs(d: NaiveDateTime) -> i64 {
    d.and_utc().timestamp()
}

fn last_day_of_month(y: i32, m: u32) -> u32 {
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    NaiveDate::from_ymd_opt(ny, nm, 1)
        .and_then(|d| d.pred_opt())
        .map(|d| d.day())
        .unwrap_or(28)
}

fn with_ymd_time(y: i32, m: u32, day: u32, t: NaiveDateTime) -> NaiveDateTime {
    let d = day.min(last_day_of_month(y, m)).max(1);
    NaiveDate::from_ymd_opt(y, m, d)
        .and_then(|nd| nd.and_hms_opt(t.hour(), t.minute(), t.second()))
        .unwrap_or(t)
}

/// Add `months` calendar months to `a`, clamping the day-of-month (Jan-31 + 1mo => Feb-28/29).
fn add_months(a: NaiveDateTime, months: i64) -> NaiveDateTime {
    let total = (a.year() as i64) * 12 + (a.month() as i64 - 1) + months;
    let y = total.div_euclid(12) as i32;
    let m = (total.rem_euclid(12)) as u32 + 1;
    with_ymd_time(y, m, a.day(), a)
}

fn step(a: NaiveDateTime, freq: &Freq, interval: i64, k: i64) -> NaiveDateTime {
    match freq {
        Freq::Daily => a + Duration::days(interval * k),
        Freq::Weekly => a + Duration::weeks(interval * k),
        Freq::Monthly => add_months(a, interval * k),
        Freq::Yearly => add_months(a, interval * k * 12),
        Freq::None => a,
    }
}

/// For weekly+byday: the selected weekdays within the base step's week (Monday-anchored),
/// preserving the anchor's time-of-day.
fn weekly_candidates(anchor: NaiveDateTime, base: NaiveDateTime, byday: &[Weekday]) -> Vec<NaiveDateTime> {
    let monday = base.date() - Duration::days(base.weekday().num_days_from_monday() as i64);
    let mut v: Vec<NaiveDateTime> = byday
        .iter()
        .filter_map(|wd| {
            (monday + Duration::days(wd.num_days_from_monday() as i64))
                .and_hms_opt(anchor.hour(), anchor.minute(), anchor.second())
        })
        .collect();
    v.sort_unstable();
    v
}

/// All occurrence start-times (UTC secs) within [from, to], inclusive. Capped at MAX_OCC.
pub fn occurrences(anchor: i64, rule: &Rule, from: i64, to: i64) -> Vec<i64> {
    let mut out: Vec<i64> = Vec::new();
    if !rule.is_recurring() {
        if anchor >= from && anchor <= to {
            out.push(anchor);
        }
        return out;
    }
    if to < from {
        return out;
    }
    let a = ndt(anchor);
    let count_cap = rule.count.unwrap_or(i64::MAX);
    let mut produced: i64 = 0;
    let mut k: i64 = 0;
    let max_k = (MAX_OCC as i64) * 8 + 1000;

    while produced < count_cap && k <= max_k && out.len() < MAX_OCC {
        let base = step(a, &rule.freq, rule.interval, k);
        let cands = if rule.freq == Freq::Weekly && !rule.byday.is_empty() {
            weekly_candidates(a, base, &rule.byday)
        } else {
            vec![base]
        };
        let mut stop = false;
        for c in cands {
            let cs = to_secs(c);
            if cs < anchor {
                continue; // series starts at the anchor
            }
            if let Some(u) = rule.until {
                if cs > u {
                    stop = true;
                    break;
                }
            }
            if produced >= count_cap {
                break;
            }
            produced += 1;
            if cs >= from && cs <= to {
                out.push(cs);
            }
        }
        if stop {
            break;
        }
        let base_s = to_secs(base);
        if base_s > to {
            break;
        }
        if let Some(u) = rule.until {
            if base_s > u {
                break;
            }
        }
        k += 1;
    }
    out.sort_unstable();
    out.dedup();
    out.truncate(MAX_OCC);
    out
}

/// The first occurrence strictly after `t` (UTC secs), or None if the series has ended.
#[allow(dead_code)]
pub fn next_occurrence_after(anchor: i64, rule: &Rule, t: i64) -> Option<i64> {
    if !rule.is_recurring() {
        return if anchor > t { Some(anchor) } else { None };
    }
    let mut lo = t + 1;
    for _ in 0..8 {
        let hi = lo.saturating_add(60 * 60 * 24 * 400);
        let occ = occurrences(anchor, rule, lo, hi);
        if let Some(&first) = occ.iter().find(|&&x| x > t) {
            return Some(first);
        }
        if let Some(u) = rule.until {
            if hi > u {
                break;
            }
        }
        lo = hi + 1;
    }
    None
}
