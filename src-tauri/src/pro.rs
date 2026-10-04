//! Free / Pro (2026-10-04 decision). Pro opens with an active license (a paid
//! subscription or a site license) or during the first 14 days after install.
//! What Pro covers is decided where each feature lives: pull requests of private
//! or self-hosted repositories (`forge`), backport actions, and the dashboard
//! beyond its first repositories (the UI). An unlicensed copy simply falls back to
//! Free; nothing the user made is touched.

use std::path::Path;

use serde::Serialize;

use crate::license;

pub const TRIAL_DAYS: i64 = 14;
/// What a Pro-only command answers without Pro (the UI shows the Pro dialog first).
pub const LOCKED: &str = "This is a ddugit Pro feature";

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProSource {
    License,
    Site,
    Trial,
    Free,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProStatus {
    pub pro: bool,
    pub source: ProSource,
    /// Days of the trial left (0 once it is over); None while a license covers it.
    pub trial_days_left: Option<i64>,
}

/// Days left of a trial that started on day `start` (days since 1970), as of `today`.
fn trial_left(start: i64, today: i64) -> i64 {
    (TRIAL_DAYS - (today - start)).clamp(0, TRIAL_DAYS)
}

fn decide(license: &license::LicenseStatus, trial_start: i64, today: i64) -> ProStatus {
    if let Some(l) = license::active(license) {
        let source = if l.kind == "site" {
            ProSource::Site
        } else {
            ProSource::License
        };
        return ProStatus {
            pro: true,
            source,
            trial_days_left: None,
        };
    }
    let left = trial_left(trial_start, today);
    ProStatus {
        pro: left > 0,
        source: if left > 0 {
            ProSource::Trial
        } else {
            ProSource::Free
        },
        trial_days_left: Some(left),
    }
}

const TRIAL_FILE: &str = "trial-start";

/// The day the trial started: the earliest of what the config folder and the OS
/// keychain remember (so deleting one doesn't restart it), recorded on first use.
fn trial_start(dir: &Path, today: i64) -> i64 {
    let file = dir.join(TRIAL_FILE);
    let from_file = std::fs::read_to_string(&file)
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok());
    // Tests use their own keychain entry, never the real one.
    let service = if cfg!(test) { "ddugit-test" } else { "ddugit" };
    let entry = keyring::Entry::new(service, TRIAL_FILE).ok();
    let from_keychain = entry
        .as_ref()
        .and_then(|e| e.get_password().ok())
        .and_then(|s| s.trim().parse::<i64>().ok());
    let start = [from_file, from_keychain]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(today);
    if from_file != Some(start) {
        let _ = std::fs::create_dir_all(dir);
        let _ = std::fs::write(&file, start.to_string());
    }
    if from_keychain != Some(start) {
        if let Some(e) = entry {
            let _ = e.set_password(&start.to_string());
        }
    }
    start
}

pub fn status_in(dir: &Path) -> ProStatus {
    let today = license::today_days();
    decide(&license::status_in(dir), trial_start(dir, today), today)
}

/// Err(LOCKED) unless Pro is open.
pub fn require(dir: &Path) -> Result<(), String> {
    if status_in(dir).pro {
        Ok(())
    } else {
        Err(LOCKED.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::{LicenseInfo, LicenseStatus};

    fn status(kind: &str, expired: bool) -> LicenseStatus {
        LicenseStatus {
            license: Some(LicenseInfo {
                id: "lic".into(),
                name: "A".into(),
                email: "a@b.c".into(),
                kind: kind.into(),
                seats: 1,
                issued: "2026-10-04".into(),
                updates_until: "2027-10-04".into(),
                expires: None,
                plan: None,
            }),
            newer_than_license: false,
            checkable: true,
            expired,
        }
    }
    fn none() -> LicenseStatus {
        LicenseStatus {
            license: None,
            newer_than_license: false,
            checkable: true,
            expired: false,
        }
    }

    #[test]
    fn a_trial_runs_fourteen_days_from_first_use() {
        assert_eq!(
            decide(&none(), 100, 100),
            ProStatus {
                pro: true,
                source: ProSource::Trial,
                trial_days_left: Some(14)
            }
        );
        assert_eq!(decide(&none(), 100, 113).trial_days_left, Some(1));
        let over = decide(&none(), 100, 114);
        assert_eq!(
            (over.pro, over.source, over.trial_days_left),
            (false, ProSource::Free, Some(0))
        );
        // A clock set back doesn't add days.
        assert_eq!(decide(&none(), 100, 90).trial_days_left, Some(14));
    }

    #[test]
    fn an_active_license_opens_pro_and_a_lapsed_one_falls_back() {
        assert_eq!(
            decide(&status("commercial", false), 0, 999).source,
            ProSource::License
        );
        assert_eq!(decide(&status("site", false), 0, 999).source, ProSource::Site);
        let lapsed = decide(&status("commercial", true), 0, 999);
        assert_eq!((lapsed.pro, lapsed.source), (false, ProSource::Free));
    }

    #[test]
    fn the_trial_start_is_remembered() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(TRIAL_FILE), "50").unwrap();
        // The keychain may hold an earlier day from a previous install; never a later one wins.
        assert!(trial_start(dir.path(), 60) <= 50);
        assert!(
            std::fs::read_to_string(dir.path().join(TRIAL_FILE))
                .unwrap()
                .trim()
                .parse::<i64>()
                .unwrap()
                <= 50
        );
    }
}
