//! Moving commits into and out of air-gapped networks with git bundles (Pro).
//!
//! Outside: pick a destination (a customer site) and branches; ddugit writes one
//! bundle file holding only what that destination doesn't have yet (everything
//! after the tips last sent there, remembered in the repository's local config),
//! plus a `.sha256` file in `sha256sum` format so the copy can be checked on
//! either side, even without ddugit. Inside: the bundle is checked (checksum,
//! prerequisite commits present) and its branches fetched under
//! `refs/remotes/<name>/`, where the graph shows them like any remote's.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{config_entries, git, git_ok, is_ancestor, operand, repo_dir, OpResult, OpStatus, Result};

/// `ddugit-transfer.<destination>.sent = "<branch> <commit> <unix time>"`, one value per export.
const SECTION: &str = "ddugit-transfer";

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    /// Where the bundle goes, e.g. a customer's name.
    pub dest: String,
    pub branches: Vec<String>,
    /// Everything, not just what came after the last transfer to `dest`.
    pub full: bool,
    pub out_dir: String,
}

/// What was last sent to a destination, per branch.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Sent {
    pub dest: String,
    pub branch: String,
    pub tip: String,
    pub time: i64,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Checksum {
    /// The `.sha256` next to the bundle matches.
    Match,
    Mismatch,
    /// No `.sha256` beside it.
    Absent,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleHead {
    pub name: String,
    pub id: String,
}

/// A bundle looked at before importing it.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BundleCheck {
    /// The checksum doesn't contradict it and this repository has every commit it builds on.
    pub ok: bool,
    pub checksum: Checksum,
    pub heads: Vec<BundleHead>,
    /// Commits the bundle builds on that this repository lacks (an earlier bundle is missing).
    pub missing: Vec<String>,
}

/// A destination or import name: one line, no quotes, nothing git would read as an option.
fn label(s: &str, what: &str) -> Result<String> {
    let s = s.trim();
    let bad =
        s.is_empty() || s.starts_with('-') || s.chars().any(|c| c.is_control() || c == '"' || c == '\\');
    if bad {
        return Err(format!("Invalid {what}: '{s}'"));
    }
    Ok(s.to_string())
}

/// A name usable inside `refs/remotes/<name>/` and file names.
fn slug(s: &str) -> String {
    let out: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "bundle".into()
    } else {
        out
    }
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Every transfer recorded in `dir`'s config, the latest per destination and branch.
fn sent_in(dir: &Path) -> Vec<Sent> {
    let mut latest: BTreeMap<(String, String), Sent> = BTreeMap::new();
    for (key, value) in config_entries(dir, &format!(r"^{SECTION}\..*\.sent$")) {
        let Some(dest) = key
            .strip_prefix(&format!("{SECTION}."))
            .and_then(|k| k.strip_suffix(".sent"))
        else {
            continue;
        };
        let mut v = value.split(' ');
        let (Some(branch), Some(tip), Some(time)) = (v.next(), v.next(), v.next()) else {
            continue;
        };
        let s = Sent {
            dest: dest.to_string(),
            branch: branch.to_string(),
            tip: tip.to_string(),
            time: time.parse().unwrap_or(0),
        };
        latest.insert((s.dest.clone(), s.branch.clone()), s);
    }
    latest.into_values().collect()
}

/// What each destination last received.
pub fn history(path: &str) -> Result<Vec<Sent>> {
    Ok(sent_in(&repo_dir(path)?))
}

fn rev(dir: &Path, r: &str) -> Result<String> {
    git_ok(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{}^{{commit}}", operand(r)?),
        ],
    )
    .map(|s| s.trim().to_string())
    .map_err(|_| format!("No such branch or commit: {r}"))
}

/// Streamed: a bundle may be several gigabytes.
fn sha256_hex(file: &Path) -> Result<String> {
    std::fs::File::open(file)
        .and_then(crate::digest::sha256_hex)
        .map_err(|e| format!("Can't read {}: {e}", file.display()))
}

fn checksum_file(bundle: &Path) -> PathBuf {
    let mut name = bundle.as_os_str().to_owned();
    name.push(".sha256");
    PathBuf::from(name)
}

/// Write a bundle with the commits `req.dest` doesn't have yet, its `.sha256`, and
/// remember what was sent. The output is the bundle's path.
pub fn export(path: &str, req: &ExportRequest) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let dest = label(&req.dest, "destination")?;
    if req.branches.is_empty() {
        return Err("Pick at least one branch".into());
    }
    let last: BTreeMap<String, String> = sent_in(&dir)
        .into_iter()
        .filter(|s| s.dest == dest)
        .map(|s| (s.branch, s.tip))
        .collect();

    let mut refs: Vec<String> = Vec::new();
    let mut tips: Vec<(String, String)> = Vec::new();
    for branch in &req.branches {
        let tip = rev(&dir, &format!("refs/heads/{branch}"))?;
        let base = (!req.full)
            .then(|| last.get(branch))
            .flatten()
            .filter(|b| is_ancestor(&dir, b, &tip));
        if base.is_some_and(|b| *b == tip) {
            continue; // nothing new on this branch
        }
        refs.push(format!("refs/heads/{branch}"));
        if let Some(b) = base {
            refs.push(format!("^{b}"));
        }
        tips.push((branch.clone(), tip));
    }
    if tips.is_empty() {
        return Err(format!("Nothing new for {dest} since the last transfer"));
    }

    let repo_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("repo");
    let t = now();
    let secs = t.rem_euclid(86_400);
    let stamp = format!(
        "{}-{:02}{:02}{:02}",
        crate::license::civil(t.div_euclid(86_400)),
        secs / 3600,
        secs / 60 % 60,
        secs % 60
    );
    let file = Path::new(&req.out_dir).join(format!("{}-{}-{stamp}.bundle", slug(repo_name), slug(&dest)));
    let file_str = file.to_string_lossy().to_string();
    let mut args: Vec<&str> = vec!["bundle", "create", operand(&file_str)?];
    args.extend(refs.iter().map(String::as_str));
    let out = git(&dir, &args)?;
    if !out.ok {
        return Ok(out.into());
    }

    let name = file
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    std::fs::write(checksum_file(&file), format!("{}  {name}\n", sha256_hex(&file)?))
        .map_err(|e| format!("Can't write the checksum: {e}"))?;
    for (branch, tip) in &tips {
        git_ok(
            &dir,
            &[
                "config",
                "--local",
                "--add",
                &format!("{SECTION}.{dest}.sent"),
                &format!("{branch} {tip} {t}"),
            ],
        )?;
    }
    Ok(OpResult {
        status: OpStatus::Ok,
        output: file_str,
    })
}

fn heads_of(dir: &Path, file: &str) -> Vec<BundleHead> {
    git(dir, &["bundle", "list-heads", file])
        .map(|o| {
            o.text
                .lines()
                .filter_map(|l| l.split_once(' '))
                .filter(|(id, _)| id.len() >= 40 && id.chars().all(|c| c.is_ascii_hexdigit()))
                .map(|(id, name)| BundleHead {
                    name: name.trim().to_string(),
                    id: id.to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Look at a bundle before importing it: checksum, branches, missing commits.
pub fn check(path: &str, file: &str) -> Result<BundleCheck> {
    let dir = repo_dir(path)?;
    let file = operand(file)?;
    let bundle = Path::new(file);
    if !bundle.is_file() {
        return Err(format!("No such file: {file}"));
    }
    let sums = checksum_file(bundle);
    let checksum = match std::fs::read_to_string(&sums) {
        Err(_) => Checksum::Absent,
        Ok(text) => {
            let expected = text
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            if expected == sha256_hex(bundle)? {
                Checksum::Match
            } else {
                Checksum::Mismatch
            }
        }
    };
    let verify = git(&dir, &["bundle", "verify", file])?;
    // "error: Repository lacks these prerequisite commits:" then "error: <id> <subject>".
    let missing: Vec<String> = verify
        .text
        .lines()
        .filter_map(|l| l.strip_prefix("error: "))
        .filter_map(|l| l.split_whitespace().next())
        .filter(|w| w.len() >= 40 && w.chars().all(|c| c.is_ascii_hexdigit()))
        .map(str::to_string)
        .collect();
    Ok(BundleCheck {
        ok: verify.ok && checksum != Checksum::Mismatch,
        checksum,
        heads: heads_of(&dir, file),
        missing,
    })
}

/// Fetch a checked bundle's branches into `refs/remotes/<name>/`.
pub fn import(path: &str, file: &str, name: &str) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let name = slug(&label(name, "name")?);
    let c = check(path, file)?;
    if c.checksum == Checksum::Mismatch {
        return Err("The bundle doesn't match its .sha256: the copy is damaged or was changed".into());
    }
    if !c.missing.is_empty() {
        return Err(format!(
            "This repository lacks {} commit(s) the bundle builds on: import the earlier bundle first",
            c.missing.len()
        ));
    }
    let spec = format!("+refs/heads/*:refs/remotes/{name}/*");
    Ok(git(&dir, &["fetch", "--no-tags", operand(file)?, &spec])?.into())
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    fn export_to(src: &Path, out: &Path, dest: &str, full: bool) -> Result<String> {
        let r = export(
            s(src),
            &ExportRequest {
                dest: dest.into(),
                branches: vec!["main".into()],
                full,
                out_dir: s(out).into(),
            },
        )?;
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        Ok(r.output)
    }

    fn tip(p: &Path, r: &str) -> String {
        git_ok(p, &["rev-parse", r]).unwrap().trim().to_string()
    }

    #[test]
    fn checksums_are_sha256sum_hex() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("x.bundle");
        std::fs::write(&f, "abc").unwrap();
        assert_eq!(
            sha256_hex(&f).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(sha256_hex(&d.path().join("missing")).is_err());
    }

    #[test]
    fn bundles_carry_only_what_the_destination_lacks_and_import_in_order() {
        let outside = repo();
        let inside = repo();
        let out = tempfile::tempdir().unwrap();
        commit_file(outside.path(), "a.txt", "1", "one");
        commit_file(outside.path(), "a.txt", "2", "two");

        let first = export_to(outside.path(), out.path(), "Acme Corp", false).unwrap();
        assert!(Path::new(&format!("{first}.sha256")).is_file());
        // Nothing new: refused instead of an empty bundle.
        assert!(export_to(outside.path(), out.path(), "Acme Corp", false).is_err());
        // Another destination starts from scratch.
        let sent = history(s(outside.path())).unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(
            (sent[0].dest.as_str(), sent[0].branch.as_str()),
            ("Acme Corp", "main")
        );

        commit_file(outside.path(), "a.txt", "3", "three");
        std::thread::sleep(std::time::Duration::from_millis(1100)); // a distinct file name
        let second = export_to(outside.path(), out.path(), "Acme Corp", false).unwrap();

        // Inside, the second bundle alone lacks its base.
        let c = check(s(inside.path()), &second).unwrap();
        assert!(!c.ok && !c.missing.is_empty());
        assert!(import(s(inside.path()), &second, "acme").is_err());

        let c = check(s(inside.path()), &first).unwrap();
        assert!(c.ok, "{c:?}");
        assert_eq!(c.checksum, Checksum::Match);
        assert_eq!(c.heads[0].name, "refs/heads/main");
        let r = import(s(inside.path()), &first, "acme").unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let r = import(s(inside.path()), &second, "acme").unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            tip(inside.path(), "refs/remotes/acme/main"),
            tip(outside.path(), "main")
        );
    }

    #[test]
    fn a_changed_bundle_is_refused() {
        let outside = repo();
        let inside = repo();
        let out = tempfile::tempdir().unwrap();
        commit_file(outside.path(), "a.txt", "1", "one");
        let file = export_to(outside.path(), out.path(), "lab", true).unwrap();
        let mut bytes = std::fs::read(&file).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        std::fs::write(&file, bytes).unwrap();
        assert_eq!(
            check(s(inside.path()), &file).unwrap().checksum,
            Checksum::Mismatch
        );
        assert!(import(s(inside.path()), &file, "lab").is_err());
    }

    #[test]
    fn names_are_checked() {
        assert!(label("", "x").is_err());
        assert!(label("-x", "x").is_err());
        assert!(label("a\"b", "x").is_err());
        assert_eq!(label("  Acme Corp ", "x").unwrap(), "Acme Corp");
        assert_eq!(slug("Acme Corp/Seoul"), "Acme-Corp-Seoul");
        assert_eq!(slug("///"), "bundle");
    }
}
