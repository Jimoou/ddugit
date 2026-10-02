//! Git LFS: whether the repository routes files through it, whether this
//! machine can fetch them (git-lfs installed, filters on), which files are
//! still pointers, and the few commands that fix that. All through the
//! `git lfs` CLI: libgit2 knows nothing of LFS.

use serde::{Deserialize, Serialize};

use super::remote::is_auth_failure;
use super::{git, open, operand, workdir, OpResult, OpStatus, Result};

/// Missing files listed by name; the rest are only counted.
const LISTED: usize = 50;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    /// `git lfs version`; `None` when git-lfs isn't installed.
    pub version: Option<String>,
    /// Patterns the root `.gitattributes` sends through LFS.
    pub patterns: Vec<String>,
    /// The LFS filters are configured (checkouts download the real content).
    pub filters: bool,
    /// Files still only pointers in the working tree (content not downloaded).
    pub missing: usize,
    /// The first of them.
    pub missing_files: Vec<String>,
}

#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum LfsOp {
    /// Turn the filters and hooks on for this repository (`install --local`).
    Install,
    /// Download the content of the files checked out as pointers.
    Pull,
    /// Route files matching `pattern` through LFS (edits `.gitattributes`).
    Track {
        pattern: String,
    },
    Untrack {
        pattern: String,
    },
}

/// `*.psd filter=lfs diff=lfs merge=lfs -text` → `*.psd`.
fn lfs_patterns(attributes: &str) -> Vec<String> {
    attributes
        .lines()
        .map(str::trim)
        .filter(|l| !l.starts_with('#'))
        .filter_map(|l| {
            let mut words = l.split_whitespace();
            let pattern = words.next()?;
            words.any(|w| w == "filter=lfs").then(|| pattern.to_string())
        })
        .collect()
}

/// `git lfs ls-files` lines: `<oid> <* or -> <path>`; `-` is a pointer whose content isn't here.
fn pointers(ls_files: &str) -> Vec<String> {
    ls_files
        .lines()
        .filter_map(|l| {
            let mut parts = l.splitn(3, ' ');
            let (_oid, mark, path) = (parts.next()?, parts.next()?, parts.next()?);
            (mark == "-").then(|| path.to_string())
        })
        .collect()
}

pub fn status(path: &str) -> Result<LfsStatus> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let version = git(&dir, &["lfs", "version"])
        .ok()
        .filter(|o| o.ok && o.text.starts_with("git-lfs/"))
        .map(|o| o.text.lines().next().unwrap_or("").to_string());
    let patterns = std::fs::read_to_string(dir.join(".gitattributes"))
        .map(|a| lfs_patterns(&a))
        .unwrap_or_default();
    let filters = repo.config().is_ok_and(|c| {
        c.get_string("filter.lfs.process").is_ok() || c.get_string("filter.lfs.smudge").is_ok()
    });
    let missing = if version.is_some() && !patterns.is_empty() {
        git(&dir, &["lfs", "ls-files"])
            .map(|o| pointers(&o.text))
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(LfsStatus {
        version,
        patterns,
        filters,
        missing: missing.len(),
        missing_files: missing.into_iter().take(LISTED).collect(),
    })
}

pub fn apply(path: &str, op: &LfsOp) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let args: Vec<&str> = match op {
        LfsOp::Install => vec!["lfs", "install", "--local"],
        LfsOp::Pull => vec!["lfs", "pull"],
        LfsOp::Track { pattern } => vec!["lfs", "track", "--", operand(pattern.trim())?],
        LfsOp::Untrack { pattern } => vec!["lfs", "untrack", "--", operand(pattern.trim())?],
    };
    let o = git(&dir, &args)?;
    if !o.ok && is_auth_failure(&o.text) {
        return Ok(OpResult::with(OpStatus::Auth, o));
    }
    Ok(o.into())
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{repo, s};
    use super::*;

    #[test]
    fn reads_patterns_and_pointer_marks() {
        let attrs =
            "# art\n*.psd filter=lfs diff=lfs merge=lfs -text\n*.txt text\nassets/** filter=lfs -text\n";
        assert_eq!(lfs_patterns(attrs), ["*.psd", "assets/**"]);
        let ls = "4d7a2146b8 * big.psd\n9f86d08188 - art/huge file.psd\n";
        assert_eq!(pointers(ls), ["art/huge file.psd"]);
    }

    #[test]
    fn tracks_patterns_and_finds_files_left_as_pointers() {
        let d = repo();
        let p = s(d.path());
        let st = status(p).unwrap();
        if st.version.is_none() {
            return; // git-lfs isn't installed here
        }
        assert!(st.patterns.is_empty());
        assert_eq!(apply(p, &LfsOp::Install).unwrap().status, OpStatus::Ok);
        let r = apply(
            p,
            &LfsOp::Track {
                pattern: "*.bin".into(),
            },
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let st = status(p).unwrap();
        assert_eq!(st.patterns, ["*.bin"]);
        assert!(st.filters);

        // A pointer committed without its object: the content isn't on this machine.
        let pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:\
            2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae\nsize 3\n";
        std::fs::write(d.path().join("a.bin"), pointer).unwrap();
        let c = super::super::write::commit(p, "pointer", &[], false).unwrap();
        assert_eq!(c.status, OpStatus::Ok, "{}", c.output);
        let st = status(p).unwrap();
        assert_eq!(
            (st.missing, st.missing_files.as_slice()),
            (1, &["a.bin".to_string()][..])
        );

        let r = apply(
            p,
            &LfsOp::Untrack {
                pattern: "*.bin".into(),
            },
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(status(p).unwrap().patterns.is_empty());
        assert!(apply(
            p,
            &LfsOp::Track {
                pattern: "--global".into()
            }
        )
        .is_err());
    }
}
