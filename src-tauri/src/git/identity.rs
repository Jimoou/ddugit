//! Who commits are made as, and how they are signed: `user.name` / `user.email`
//! and the signing keys (`commit.gpgsign`, `gpg.format`, `user.signingkey`),
//! read with the scope they come from and written at repo (local) or global
//! scope. Also the keys on this machine that can sign (GPG secret keys, SSH
//! public keys) and the signature on one commit.
//!
//! Config is read through the git CLI rather than libgit2 so it resolves
//! exactly as the commits will (includeIf, `GIT_CONFIG_GLOBAL`, the chosen
//! git executable), and `--show-scope` says where each value comes from.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};

use super::{
    command, err, git, git_ok, open, operand, repo_dir, workdir, OpResult, OpStatus, Result, SPAWN_ERR,
};

/// Where a write goes.
#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    Local,
    Global,
}

/// A config value and the scope git found it in (`local`, `global`, `system`, `worktree`, `command`).
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Setting<T> {
    pub value: T,
    pub scope: String,
}

/// The identity and signing setup commits use right now; `None` where nothing is set.
#[derive(Debug, Serialize, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub name: Option<Setting<String>>,
    pub email: Option<Setting<String>>,
    /// `commit.gpgsign`.
    pub sign: Option<Setting<bool>>,
    /// `gpg.format` (unset means `openpgp`).
    pub format: Option<Setting<String>>,
    /// `user.signingkey`.
    pub key: Option<Setting<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SignFormat {
    Openpgp,
    Ssh,
}

impl SignFormat {
    fn as_str(self) -> &'static str {
        match self {
            SignFormat::Openpgp => "openpgp",
            SignFormat::Ssh => "ssh",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Signing {
    pub format: SignFormat,
    /// GPG: a key id or fingerprint. SSH: the path to a `.pub` file, or `key::ssh-ed25519 …`.
    pub key: String,
}

/// A saved identity (kept by the app, applied to repositories or globally).
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub email: String,
    pub signing: Option<Signing>,
}

#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum IdentityOp {
    /// Set name and email; with signing, turn it on with that key, without it
    /// remove the signing keys at this scope (a profile says everything).
    Apply { scope: Scope, profile: Profile },
    /// Turn `commit.gpgsign` on or off.
    Sign { scope: Scope, on: bool },
    /// Remove name, email and signing keys at this scope (local: fall back to global).
    Clear { scope: Scope },
}

const NAME: &str = "user.name";
const EMAIL: &str = "user.email";
const SIGN: &str = "commit.gpgsign";
const FORMAT: &str = "gpg.format";
const KEY: &str = "user.signingkey";
const SIGNING_KEYS: [&str; 3] = [SIGN, FORMAT, KEY];
/// Matches the keys above (git prints them lowercased).
const KEYS_RE: &str = r"^(user\.(name|email|signingkey)|commit\.gpgsign|gpg\.format)$";

/// Where to run git, and the scope flag for a write. Global work needs no repository.
fn place(path: Option<&str>, scope: Scope) -> Result<(PathBuf, &'static str)> {
    match (path, scope) {
        (Some(p), Scope::Local) => Ok((repo_dir(p)?, "--local")),
        (None, Scope::Local) => Err("No repository to set this for".into()),
        (p, Scope::Global) => Ok((p.map_or_else(|| Ok(std::env::temp_dir()), repo_dir)?, "--global")),
    }
}

/// git's boolean spellings (`git config --type=bool`).
fn config_bool(v: &str) -> bool {
    matches!(v.to_ascii_lowercase().as_str(), "" | "true" | "yes" | "on" | "1")
}

/// `git config --show-scope --get-regexp` lines (`scope\tkey value`); the last one of a key wins, like git.
fn parse_config(text: &str) -> Identity {
    let mut id = Identity::default();
    for line in text.lines() {
        let Some((scope, rest)) = line.split_once('\t') else {
            continue;
        };
        // A bare `key` (no `=`) has no value: a boolean true.
        let (key, value) = rest.split_once(' ').unwrap_or((rest, ""));
        let at = |value: String| Setting {
            value,
            scope: scope.to_string(),
        };
        match key {
            NAME => id.name = Some(at(value.into())),
            EMAIL => id.email = Some(at(value.into())),
            "user.signingkey" => id.key = Some(at(value.into())),
            FORMAT => id.format = Some(at(value.into())),
            SIGN => {
                id.sign = Some(Setting {
                    value: config_bool(value),
                    scope: scope.to_string(),
                })
            }
            _ => {}
        }
    }
    id
}

/// The identity commits in `path` would use (`None`: the global one alone).
pub fn read(path: Option<&str>) -> Result<Identity> {
    let (dir, only) = match path {
        Some(p) => (repo_dir(p)?, None),
        None => (std::env::temp_dir(), Some("--global")),
    };
    let mut args = vec!["config"];
    args.extend(only);
    args.extend(["--show-scope", "--get-regexp", KEYS_RE]);
    let o = git(&dir, &args)?;
    // Exit 1 with no output: none of the keys is set.
    if !o.ok && !o.text.is_empty() {
        return Err(o.text);
    }
    Ok(parse_config(&o.text))
}

fn check(field: &str, v: &str) -> Result<()> {
    if v.trim().is_empty() || v.contains(['\n', '\r', '\0']) {
        return Err(format!("{field} can't be empty or span lines"));
    }
    Ok(())
}

fn set(dir: &Path, flag: &str, key: &str, value: &str) -> Result<()> {
    git_ok(dir, &["config", flag, "--", key, value]).map(drop)
}

/// Unset `key`; one that isn't set (exit 5, silent) is fine.
fn unset(dir: &Path, flag: &str, key: &str) -> Result<()> {
    let o = git(dir, &["config", flag, "--unset-all", key])?;
    if o.ok || o.text.is_empty() {
        Ok(())
    } else {
        Err(o.text)
    }
}

/// Run `op` with `flag` choosing the config file (`--local`, `--global`, or `--file=…` in tests).
fn write(dir: &Path, flag: &str, op: &IdentityOp) -> Result<OpResult> {
    match op {
        IdentityOp::Apply { profile, .. } => {
            check("Name", &profile.name)?;
            check("Email", &profile.email)?;
            if profile.email.contains(['<', '>']) {
                return Err("Email can't contain < or >".into());
            }
            if let Some(s) = &profile.signing {
                check("Signing key", &s.key)?;
            }
            set(dir, flag, NAME, profile.name.trim())?;
            set(dir, flag, EMAIL, profile.email.trim())?;
            match &profile.signing {
                Some(s) => {
                    set(dir, flag, FORMAT, s.format.as_str())?;
                    set(dir, flag, KEY, s.key.trim())?;
                    set(dir, flag, SIGN, "true")?;
                }
                None => {
                    for k in SIGNING_KEYS {
                        unset(dir, flag, k)?;
                    }
                }
            }
        }
        IdentityOp::Sign { on, .. } => set(dir, flag, SIGN, if *on { "true" } else { "false" })?,
        IdentityOp::Clear { .. } => {
            for k in [NAME, EMAIL].into_iter().chain(SIGNING_KEYS) {
                unset(dir, flag, k)?;
            }
        }
    }
    Ok(OpResult {
        status: OpStatus::Ok,
        output: String::new(),
    })
}

/// Apply `op` to the repository at `path` (local scope) or to the user's global config.
pub fn apply(path: Option<&str>, op: &IdentityOp) -> Result<OpResult> {
    let scope = match op {
        IdentityOp::Apply { scope, .. } | IdentityOp::Sign { scope, .. } | IdentityOp::Clear { scope } => {
            *scope
        }
    };
    let (dir, flag) = place(path, scope)?;
    write(&dir, flag, op)
}

/// A key that can sign: `id` is what goes in `user.signingkey`.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SigningKey {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SigningKeys {
    /// GPG secret keys; `None` when gpg isn't installed.
    pub gpg: Option<Vec<SigningKey>>,
    /// SSH public keys in ~/.ssh (by path to the `.pub`, as git wants for `gpg.format=ssh`).
    pub ssh: Vec<SigningKey>,
}

/// `gpg --list-secret-keys --with-colons` → usable primary keys (long id + first user id).
/// Revoked, expired, disabled and invalid keys are left out.
fn parse_gpg(text: &str) -> Vec<SigningKey> {
    let mut keys: Vec<SigningKey> = Vec::new();
    let mut want_uid = false;
    for line in text.lines() {
        let f: Vec<&str> = line.split(':').collect();
        match f.first() {
            Some(&"sec") => {
                let usable = !matches!(f.get(1), Some(&("r" | "e" | "d" | "i")));
                want_uid = usable && f.get(4).is_some_and(|id| !id.is_empty());
                if want_uid {
                    keys.push(SigningKey {
                        id: f[4].to_string(),
                        label: String::new(),
                    });
                }
            }
            Some(&"uid") if want_uid => {
                // Colons inside the user id are escaped as \x3a.
                let uid = f.get(9).unwrap_or(&"").replace("\\x3a", ":");
                if let Some(k) = keys.last_mut() {
                    k.label = uid;
                }
                want_uid = false;
            }
            _ => {}
        }
    }
    keys
}

fn gpg_keys() -> Option<Vec<SigningKey>> {
    let out = crate::ssh::tool("gpg")
        .args([
            "--batch",
            "--list-secret-keys",
            "--with-colons",
            "--keyid-format=long",
        ])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    Some(parse_gpg(&String::from_utf8_lossy(&out.stdout)))
}

pub fn signing_keys() -> Result<SigningKeys> {
    let dir = crate::ssh::ssh_dir()?;
    let ssh = crate::ssh::keys_in(&dir)
        .into_iter()
        .map(|k| {
            let comment = k.public.split_whitespace().nth(2).unwrap_or("").to_string();
            SigningKey {
                id: dir.join(format!("{}.pub", k.name)).to_string_lossy().into_owned(),
                label: if comment.is_empty() {
                    k.name
                } else {
                    format!("{} · {comment}", k.name)
                },
            }
        })
        .collect();
    Ok(SigningKeys { gpg: gpg_keys(), ssh })
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SignatureStatus {
    /// A good signature from a trusted key (`G`).
    Verified,
    /// Signed, but not fully checked: unknown trust, expired, or the key isn't here.
    Unverified,
    /// A bad signature, or one made by a revoked key.
    Bad,
    None,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub status: SignatureStatus,
    /// `%GS`: who signed, as the key names them.
    pub signer: String,
    /// `%GK`: the key that signed.
    pub key: String,
}

/// `%G?`, `%GS`, `%GK` on three lines.
fn parse_signature(text: &str) -> Signature {
    let mut lines = text.lines();
    let mut next = || lines.next().unwrap_or("").trim().to_string();
    let (code, signer, key) = (next(), next(), next());
    let status = match code.as_str() {
        "G" => SignatureStatus::Verified,
        "U" | "X" | "Y" | "E" => SignatureStatus::Unverified,
        "B" | "R" => SignatureStatus::Bad,
        _ => SignatureStatus::None,
    };
    Signature { status, signer, key }
}

/// The signature on commit `id`, checked by git (gpg / ssh-keygen) now.
pub fn signature(path: &str, id: &str) -> Result<Signature> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let args = ["show", "-s", "--format=%G?%n%GS%n%GK", operand(id)?, "--"];
    // stdout only: verification complaints on stderr would read as the signer.
    let out = command(&dir, &args)
        .output()
        .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let mut sig = parse_signature(&String::from_utf8_lossy(&out.stdout));
    // git says "no signature" for an SSH signature it can't check (no allowed signers file).
    if sig.status == SignatureStatus::None {
        let oid = repo
            .revparse_single(id)
            .map_err(err)?
            .peel_to_commit()
            .map_err(err)?
            .id();
        if repo.extract_signature(&oid, None).is_ok() {
            sig.status = SignatureStatus::Unverified;
        }
    }
    Ok(sig)
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    fn profile(signing: Option<Signing>) -> Profile {
        Profile {
            name: "Kim Work".into(),
            email: "kim@corp.example".into(),
            signing,
        }
    }

    #[test]
    fn parses_config_with_scopes_last_one_winning() {
        let text = "global\tuser.name Kim Home\nglobal\tuser.email kim@home.example\n\
                    global\tcommit.gpgsign\nlocal\tuser.name Kim Work\nlocal\tgpg.format ssh\n\
                    local\tuser.signingkey key::ssh-ed25519 AAAA kim\nlocal\tcommit.gpgsign false\n";
        let id = parse_config(text);
        assert_eq!(
            id.name,
            Some(Setting {
                value: "Kim Work".into(),
                scope: "local".into()
            })
        );
        assert_eq!(id.email.unwrap().scope, "global");
        assert_eq!(id.key.unwrap().value, "key::ssh-ed25519 AAAA kim");
        assert_eq!(id.format.unwrap().value, "ssh");
        let sign = id.sign.unwrap();
        assert!(!sign.value);
        assert_eq!(sign.scope, "local");
        assert_eq!(parse_config(""), Identity::default());
        assert!(parse_config("global\tcommit.gpgsign\n").sign.unwrap().value);
    }

    #[test]
    fn applies_and_clears_a_profile_in_the_repo() {
        let d = repo();
        let p = s(d.path());
        let id = read(Some(p)).unwrap();
        assert_eq!(id.name.as_ref().unwrap().scope, "local");
        assert_eq!(id.name.unwrap().value, "Test");

        let signing = Signing {
            format: SignFormat::Ssh,
            key: "/home/kim/.ssh/id_ed25519.pub".into(),
        };
        let op = IdentityOp::Apply {
            scope: Scope::Local,
            profile: profile(Some(signing)),
        };
        assert_eq!(apply(Some(p), &op).unwrap().status, OpStatus::Ok);
        let id = read(Some(p)).unwrap();
        assert_eq!(id.name.unwrap().value, "Kim Work");
        assert_eq!(id.email.unwrap().value, "kim@corp.example");
        assert_eq!(id.format.unwrap().value, "ssh");
        assert_eq!(id.key.unwrap().value, "/home/kim/.ssh/id_ed25519.pub");
        assert_eq!(
            id.sign,
            Some(Setting {
                value: true,
                scope: "local".into()
            })
        );

        // Turning signing off keeps the key; a profile without signing drops all of it.
        let off = IdentityOp::Sign {
            scope: Scope::Local,
            on: false,
        };
        apply(Some(p), &off).unwrap();
        assert!(!read(Some(p)).unwrap().sign.unwrap().value);
        let plain = IdentityOp::Apply {
            scope: Scope::Local,
            profile: profile(None),
        };
        apply(Some(p), &plain).unwrap();
        let local = git_ok(d.path(), &["config", "--local", "--list"]).unwrap();
        assert!(!local.contains("signingkey") && !local.contains("gpgsign") && !local.contains("gpg.format"));

        // Clearing leaves nothing local: whatever is left comes from elsewhere.
        apply(Some(p), &IdentityOp::Clear { scope: Scope::Local }).unwrap();
        let id = read(Some(p)).unwrap();
        for s in [id.name.map(|v| v.scope), id.email.map(|v| v.scope)]
            .into_iter()
            .flatten()
        {
            assert_ne!(s, "local");
        }
        // Clearing again (nothing set) is fine too.
        apply(Some(p), &IdentityOp::Clear { scope: Scope::Local }).unwrap();
    }

    #[test]
    fn writes_global_style_config_to_the_given_file_and_refuses_bad_values() {
        let d = repo();
        let file = d.path().join("global.gitconfig");
        let flag = format!("--file={}", file.display());
        let op = IdentityOp::Apply {
            scope: Scope::Global,
            profile: profile(Some(Signing {
                format: SignFormat::Openpgp,
                key: "3AA5C34371567BD2".into(),
            })),
        };
        write(d.path(), &flag, &op).unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.contains("name = Kim Work") && text.contains("signingkey = 3AA5C34371567BD2"));
        assert!(text.contains("format = openpgp") && text.contains("gpgsign = true"));

        let mut bad = profile(None);
        bad.email = "x\n[core]".into();
        let op = IdentityOp::Apply {
            scope: Scope::Global,
            profile: bad,
        };
        assert!(write(d.path(), &flag, &op).is_err());
        let mut bad = profile(None);
        bad.name = " ".into();
        let op = IdentityOp::Apply {
            scope: Scope::Local,
            profile: bad,
        };
        assert!(apply(Some(s(d.path())), &op).is_err());
        // A value that looks like an option is stored as a value.
        let mut dash = profile(None);
        dash.name = "-n".into();
        let op = IdentityOp::Apply {
            scope: Scope::Local,
            profile: dash,
        };
        apply(Some(s(d.path())), &op).unwrap();
        assert_eq!(read(Some(s(d.path()))).unwrap().name.unwrap().value, "-n");
        assert!(place(None, Scope::Local).is_err());
    }

    #[test]
    fn parses_gpg_secret_keys() {
        let text = "\
sec:u:4096:1:3AA5C34371567BD2:1600000000:::u:::scESC:::+:::23::0:
fpr:::::::::ABCDEF0123456789ABCDEF013AA5C34371567BD2:
grp:::::::::0123:
uid:u::::1600000000::HASH1::Kim Work (laptop) <kim@corp.example>::::::::::0:
uid:u::::1600000000::HASH2::Kim <kim@home.example>::::::::::0:
ssb:u:4096:1:42B317FD4BA89E7A:1600000000::::::e:::+:::23:
sec:r:2048:1:1111111111111111:1500000000:::-:::sc:::+:::23::0:
uid:r::::1500000000::HASH3::Old <old@example.com>::::::::::0:
sec:u:255:22:BBBBBBBBBBBBBBBB:1700000000:::u:::scESC:::+:::ed25519:::0:
uid:u::::1700000000::HASH4::Colon\\x3a Name <c@example.com>::::::::::0:
";
        assert_eq!(
            parse_gpg(text),
            [
                SigningKey {
                    id: "3AA5C34371567BD2".into(),
                    label: "Kim Work (laptop) <kim@corp.example>".into()
                },
                SigningKey {
                    id: "BBBBBBBBBBBBBBBB".into(),
                    label: "Colon: Name <c@example.com>".into()
                },
            ]
        );
        assert!(parse_gpg("").is_empty());
    }

    #[test]
    fn parses_signature_codes() {
        let good = parse_signature("G\nKim <kim@corp.example>\n3AA5C34371567BD2\n");
        assert_eq!(good.status, SignatureStatus::Verified);
        assert_eq!(good.signer, "Kim <kim@corp.example>");
        assert_eq!(good.key, "3AA5C34371567BD2");
        for (code, want) in [
            ("U", SignatureStatus::Unverified),
            ("E", SignatureStatus::Unverified),
            ("X", SignatureStatus::Unverified),
            ("B", SignatureStatus::Bad),
            ("R", SignatureStatus::Bad),
            ("N", SignatureStatus::None),
            ("", SignatureStatus::None),
        ] {
            assert_eq!(parse_signature(&format!("{code}\n\n\n")).status, want, "{code}");
        }
    }

    #[test]
    fn reads_the_signature_of_unsigned_and_ssh_signed_commits() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "unsigned");
        assert_eq!(signature(p, "HEAD").unwrap().status, SignatureStatus::None);
        assert!(signature(p, "--output=x").is_err());

        // A real SSH signature, when ssh-keygen is here.
        let key = d.path().join("signing");
        let made = std::process::Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", "", "-C", "kim@corp.example", "-f"])
            .arg(&key)
            .stdin(Stdio::null())
            .output();
        if !made.is_ok_and(|o| o.status.success()) {
            return;
        }
        // The machine's own ssh program setting (e.g. a signing service) would sign instead.
        git_ok(d.path(), &["config", "gpg.ssh.program", "ssh-keygen"]).unwrap();
        let public = std::fs::read_to_string(key.with_extension("pub")).unwrap();
        let allowed = d.path().join("allowed_signers");
        std::fs::write(&allowed, format!("kim@corp.example {public}")).unwrap();
        git_ok(
            d.path(),
            &["config", "gpg.ssh.allowedSignersFile", allowed.to_str().unwrap()],
        )
        .unwrap();
        let op = IdentityOp::Apply {
            scope: Scope::Local,
            profile: profile(Some(Signing {
                format: SignFormat::Ssh,
                key: key.with_extension("pub").to_string_lossy().into_owned(),
            })),
        };
        apply(Some(p), &op).unwrap();
        commit_file(d.path(), "b.txt", "b", "signed");
        let sig = signature(p, "HEAD").unwrap();
        assert_eq!(sig.status, SignatureStatus::Verified, "{sig:?}");
        assert_eq!(sig.signer, "kim@corp.example");
        assert!(sig.key.starts_with("SHA256:"));
        // Without the allowed signers file git can't check it, but it is still signed.
        git_ok(d.path(), &["config", "--unset", "gpg.ssh.allowedSignersFile"]).unwrap();
        let sig = signature(p, "HEAD").unwrap();
        assert_eq!(sig.status, SignatureStatus::Unverified, "{sig:?}");
        assert_eq!(sig.signer, "");
    }
}
