use super::directus_client::Directus;
use ring::digest::{digest, SHA256};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tempfile::NamedTempFile;

pub const MAX_NOTE: usize = 512 * 1024;
pub type Notes = BTreeMap<String, String>;

#[derive(Debug)]
pub enum Error {
    Local,
    Remote,
    Conflict,
    Unconfigured,
}
impl From<io::Error> for Error {
    fn from(_: io::Error) -> Self {
        Self::Local
    }
}

pub fn valid_name(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() == 15
        && b[..8].iter().all(u8::is_ascii_digit)
        && b[8] == b'-'
        && b[9..12].iter().all(u8::is_ascii_digit)
        && &b[12..] == b".md"
}

fn read(path: &Path) -> Result<String, Error> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(Error::Local);
    }
    let mut content = String::new();
    fs::File::open(path)?
        .take((MAX_NOTE + 1) as u64)
        .read_to_string(&mut content)?;
    if content.len() > MAX_NOTE {
        return Err(Error::Local);
    }
    Ok(content)
}

fn write(path: &Path, content: &str, replace: bool) -> Result<(), Error> {
    let mut temp = NamedTempFile::new_in(path.parent().ok_or(Error::Local)?)?;
    temp.write_all(content.as_bytes())?;
    temp.as_file().sync_all()?;
    if replace {
        temp.persist(path)
    } else {
        temp.persist_noclobber(path)
    }
    .map_err(|_| Error::Local)?;
    Ok(())
}

fn hash(content: &str) -> String {
    digest(&SHA256, content.as_bytes())
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[derive(Serialize)]
pub struct Note {
    filename: String,
    markdown: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_markdown: Option<String>,
}

#[derive(Clone)]
pub struct WorkLogger {
    pub root: PathBuf,
    pub cms: Option<Directus>,
}

impl WorkLogger {
    fn directory(&self) -> PathBuf {
        self.root.join("osc_note")
    }

    fn local(&self) -> Result<Notes, Error> {
        let mut notes = Notes::new();
        for file in fs::read_dir(self.directory())? {
            let file = file?;
            let name = file.file_name().to_string_lossy().into_owned();
            if valid_name(&name) {
                notes.insert(name, read(&file.path())?);
            }
        }
        Ok(notes)
    }

    fn lock(&self) -> Result<fs::File, Error> {
        let state = self.directory().join(".ag02");
        fs::create_dir_all(&state)?;
        let lock = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(state.join("lock"))?;
        lock.try_lock().map_err(|_| Error::Conflict)?;
        Ok(lock)
    }

    // Tiap revisi catatan modul mendapat satu nomor laporan yang persisten.
    fn collect(&self, remote: Option<&Notes>) -> Result<(), Error> {
        let dir = self.directory();
        let mut existing = self.local()?;
        for module in ["osc_rest", "osc_site", "osc_auto", "osc_base", "osc_docs"] {
            let sources = match fs::read_dir(self.root.join(module).join("notes")) {
                Ok(entries) => entries,
                Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
                Err(e) => return Err(e.into()),
            };
            for entry in sources {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if !name.ends_with(".md")
                    || name.len() < 15
                    || !name.as_bytes()[..8].iter().all(u8::is_ascii_digit)
                    || name.as_bytes()[8] != b'-'
                    || !name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
                    || !entry.file_type()?.is_file()
                {
                    continue;
                }
                let content = read(&entry.path())?;
                let report =
                    format!("# Laporan tugas AI\n\nSumber: `{module}/notes/{name}`\n\n{content}");
                if report.len() > MAX_NOTE {
                    return Err(Error::Local);
                }
                let marker = dir.join(".ag02").join(format!("source-{}", hash(&report)));
                if marker.try_exists()? {
                    continue;
                }
                let prefix = &name[..8];
                let mut seq = 1;
                loop {
                    if seq > 999 {
                        return Err(Error::Local);
                    }
                    let filename = format!("{prefix}-{seq:03}.md");
                    if !existing.contains_key(&filename)
                        && !remote.is_some_and(|notes| notes.contains_key(&filename))
                    {
                        write(&dir.join(&filename), &report, false)?;
                        existing.insert(filename.clone(), report);
                        write(&marker, &filename, false)?;
                        break;
                    }
                    // Pulihkan ekspor yang terhenti sebelum penanda tersimpan.
                    if existing.get(&filename) == Some(&report) {
                        write(&marker, &filename, false)?;
                        break;
                    }
                    seq += 1;
                }
            }
        }
        Ok(())
    }

    pub async fn list(&self) -> Result<Vec<Note>, Error> {
        let mut local = self.local()?;
        let mut remote = match &self.cms {
            Some(c) => c.list().await?,
            None => Notes::new(),
        };
        let names: BTreeSet<_> = local.keys().chain(remote.keys()).cloned().collect();
        let mut notes = Vec::new();
        for filename in names {
            let (markdown, status, remote_markdown) =
                match (local.remove(&filename), remote.remove(&filename)) {
                    (Some(l), Some(r)) if l != r => (l, "diverged", Some(r)),
                    (Some(l), Some(_)) => (l, "synced", None),
                    (Some(l), None) => (l, "local", None),
                    (None, Some(r)) => (r, "remote", None),
                    _ => continue,
                };
            notes.push(Note {
                filename,
                markdown,
                status,
                remote_markdown,
            });
        }
        Ok(notes)
    }

    pub async fn sync(&self) -> Result<Vec<String>, Error> {
        let _lock = self.lock()?;
        let snapshot = match &self.cms {
            Some(cms) => cms.list().await,
            None => Err(Error::Unconfigured),
        };
        self.collect(snapshot.as_ref().ok())?;
        let remote = snapshot?;
        let cms = self.cms.as_ref().ok_or(Error::Unconfigured)?;
        let local = self.local()?;
        let mut conflicts = Vec::new();
        for name in local.keys().chain(remote.keys()).collect::<BTreeSet<_>>() {
            let path = self.directory().join(name);
            let checkpoint = self.directory().join(".ag02").join(name);
            let baseline = if checkpoint.try_exists()? {
                Some(read(&checkpoint)?)
            } else {
                None
            };
            let checksum = match (local.get(name), remote.get(name)) {
                (Some(l), Some(r)) if l == r => hash(l),
                (Some(l), None) => {
                    cms.push(name, l, None).await?;
                    hash(l)
                }
                (None, Some(r)) => {
                    write(&path, r, false)?;
                    hash(r)
                }
                (Some(l), Some(r)) if baseline.as_ref() == Some(&hash(r)) => {
                    cms.push(name, l, Some(r)).await?;
                    hash(l)
                }
                (Some(l), Some(r)) if baseline.as_ref() == Some(&hash(l)) => {
                    if read(&path)? != *l {
                        conflicts.push(name.clone());
                        continue;
                    }
                    write(&path, r, true)?;
                    hash(r)
                }
                _ => {
                    conflicts.push(name.clone());
                    continue;
                }
            };
            if baseline.as_ref() != Some(&checksum) {
                write(&checkpoint, &checksum, true)?;
            }
        }
        Ok(conflicts)
    }

    pub async fn run(self) {
        loop {
            match self.sync().await {
                Ok(conflicts) if !conflicts.is_empty() => {
                    tracing::warn!(count = conflicts.len(), "AG02 sync conflicts")
                }
                Err(Error::Unconfigured) | Ok(_) => (),
                Err(error) => tracing::warn!(?error, "AG02 synchronization deferred"),
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn collection_resumes_and_keeps_revisions() {
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path();
        let source = root.join("osc_rest/notes");
        fs::create_dir_all(&source).unwrap();
        let path = source.join("20261125-AG02-01.md");
        fs::write(&path, "## Objektif\nUji awal").unwrap();
        let logger = WorkLogger {
            root: root.into(),
            cms: None,
        };
        assert!(matches!(logger.sync().await, Err(Error::Unconfigured)));
        let lock = logger.lock().unwrap();
        assert!(matches!(logger.sync().await, Err(Error::Conflict)));
        drop(lock);
        logger.sync().await.unwrap_err();
        fs::write(&path, "## Hasil Eksekusi\nSelesai").unwrap();
        logger.sync().await.unwrap_err();
        let notes = logger.list().await.unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].filename, "20261125-001.md");
        assert!(notes[1].markdown.contains("Selesai"));
        assert_eq!(notes[1].status, "local");
        assert!(!valid_name("../20261125-001.md"));
    }

    // Gunakan koleksi khusus pengujian yang kosong pada instans Directus sementara.
    #[tokio::test]
    #[ignore]
    async fn temporary_directus_round_trip() {
        let cms = Directus::new(
            &std::env::var("AG02_TEST_URL").unwrap(),
            std::env::var("AG02_TEST_TOKEN").unwrap(),
        )
        .unwrap();
        assert!(cms.list().await.unwrap().is_empty());
        let root = tempfile::tempdir().unwrap();
        let logger = WorkLogger {
            root: root.path().into(),
            cms: Some(cms.clone()),
        };
        fs::create_dir(logger.directory()).unwrap();
        let filename = "20261125-001.md";
        let path = logger.directory().join(filename);
        fs::write(&path, "lokal").unwrap();
        cms.push("20261125-002.md", "cms", None).await.unwrap();
        assert_eq!(logger.list().await.unwrap().len(), 2);
        assert!(logger.sync().await.unwrap().is_empty());
        assert_eq!(
            read(&logger.directory().join("20261125-002.md")).unwrap(),
            "cms"
        );
        fs::write(&path, "revisi lokal").unwrap();
        assert!(logger.sync().await.unwrap().is_empty());
        assert_eq!(cms.list().await.unwrap()[filename], "revisi lokal");
        cms.push(filename, "revisi cms", Some("revisi lokal"))
            .await
            .unwrap();
        assert!(logger.sync().await.unwrap().is_empty());
        assert_eq!(read(&path).unwrap(), "revisi cms");
        fs::write(&path, "konflik lokal").unwrap();
        cms.push(filename, "konflik cms", Some("revisi cms"))
            .await
            .unwrap();
        assert_eq!(logger.sync().await.unwrap(), vec![filename.to_string()]);
        assert_eq!(read(&path).unwrap(), "konflik lokal");
        assert_eq!(cms.list().await.unwrap()[filename], "konflik cms");
    }
}
