// SPDX-License-Identifier: MPL-2.0
use std::{fs, io::{self, Write}, path::{Path, PathBuf}};

const MARKER: &str = "Open Industrial Design Tauri data v1\n";

fn refuse_links(path: &Path) -> io::Result<()> {
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(meta) => {
                let mut linked = meta.file_type().is_symlink();
                #[cfg(windows)] {
                    use std::os::windows::fs::MetadataExt;
                    linked |= meta.file_attributes() & 0x400 != 0;
                }
                if linked { return Err(io::Error::other("Linked data paths are not supported")); }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {},
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

pub fn prepare(directory: &Path) -> io::Result<PathBuf> {
    if !directory.is_absolute() || directory.parent().is_none() {
        return Err(io::Error::other("A dedicated absolute data directory is required"));
    }
    refuse_links(directory)?;
    fs::create_dir_all(directory)?;
    let marker = directory.join(".oid-tauri-data");
    refuse_links(&marker)?;
    if marker.exists() {
        if fs::read_to_string(&marker)? != MARKER {
            return Err(io::Error::other("Unrecognized data directory"));
        }
    } else {
        if fs::read_dir(directory)?.next().is_some() {
            return Err(io::Error::other("Data directory must be empty or owned by this app"));
        }
        fs::OpenOptions::new().write(true).create_new(true).open(&marker)?.write_all(MARKER.as_bytes())?;
    }
    let profile = directory.join("webview");
    refuse_links(&profile)?;
    fs::create_dir_all(&profile)?;
    let probe = directory.join(format!(".write-check-{}", std::process::id()));
    fs::OpenOptions::new().write(true).create_new(true).open(&probe)?.write_all(b"")?;
    fs::remove_file(probe)?;
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_relative_directory() { assert!(prepare(Path::new("relative")).is_err()); }
    #[test]
    fn preserves_existing_data_and_refuses_unowned_directories() {
        let root = std::env::temp_dir().join(format!("oid-storage-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        let data = root.join("data");
        let profile = prepare(&data).unwrap();
        fs::write(profile.join("sentinel"), b"retained").unwrap();
        assert_eq!(prepare(&data).unwrap(), profile);
        assert_eq!(fs::read(profile.join("sentinel")).unwrap(), b"retained");
        assert!(prepare(&root).is_err());
        // Only the freshly created, uniquely named test directory is removed.
        fs::remove_dir_all(root).unwrap();
    }
}
