//! Free / Pro. Pro opens with an active license: a bought lifetime license on its
//! device, a site license, or an old subscription until its expiry. There is no
//! trial. What Pro covers is decided where each feature lives: pull requests of
//! private or self-hosted repositories (`forge`), backport actions, and the
//! dashboard beyond its first repositories (the UI). An unlicensed copy simply
//! stays Free; nothing the user made is touched.

use std::path::Path;

use serde::Serialize;

use crate::license;

/// What a Pro-only command answers without Pro (the UI shows the Pro dialog first).
pub const LOCKED: &str = "This is a ddugit Pro feature";

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProSource {
    License,
    Site,
    Free,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProStatus {
    pub pro: bool,
    pub source: ProSource,
}

fn decide(license: &license::LicenseStatus) -> ProStatus {
    let source = match license::active(license) {
        Some(l) if l.kind == "site" => ProSource::Site,
        Some(_) => ProSource::License,
        None => ProSource::Free,
    };
    ProStatus {
        pro: source != ProSource::Free,
        source,
    }
}

pub fn status_in(dir: &Path) -> ProStatus {
    decide(&license::status_in(dir))
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

    fn status(kind: &str, expired: bool, other_device: bool) -> LicenseStatus {
        LicenseStatus {
            license: Some(LicenseInfo {
                id: "lic".into(),
                name: "A".into(),
                email: "a@b.c".into(),
                kind: kind.into(),
                seats: 1,
                issued: "2026-10-04".into(),
                updates_until: "9999-12-31".into(),
                expires: None,
                plan: None,
                device: None,
            }),
            newer_than_license: false,
            checkable: true,
            expired,
            other_device,
        }
    }

    #[test]
    fn without_a_license_it_is_free_from_the_first_day() {
        let none = LicenseStatus {
            license: None,
            newer_than_license: false,
            checkable: true,
            expired: false,
            other_device: false,
        };
        assert_eq!(
            decide(&none),
            ProStatus {
                pro: false,
                source: ProSource::Free
            }
        );
    }

    #[test]
    fn an_active_license_opens_pro_and_a_lapsed_or_foreign_one_does_not() {
        assert_eq!(
            decide(&status("personal", false, false)).source,
            ProSource::License
        );
        assert_eq!(decide(&status("site", false, false)).source, ProSource::Site);
        assert!(!decide(&status("commercial", true, false)).pro);
        assert!(!decide(&status("personal", false, true)).pro);
    }
}
