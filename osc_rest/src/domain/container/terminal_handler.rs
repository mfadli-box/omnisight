//! Klasifikasi input lintas frame sebelum audit terenkripsi dan penerusan ke TTY.
#[derive(Default)]
pub struct InputAudit {
    line: Vec<u8>,
}

impl InputAudit {
    pub fn observe(&mut self, byte: u8) -> Result<Option<&'static str>, &'static str> {
        match byte {
            b'\r' | b'\n' | 3 | 4 | 21 => Ok(self.finish()),
            8 | 127 => {
                self.line.pop();
                Ok(None)
            }
            _ if self.line.len() >= 16384 => Err("input too long"),
            _ => {
                self.line.push(byte);
                Ok(None)
            }
        }
    }

    pub fn finish(&mut self) -> Option<&'static str> {
        if self.line.is_empty() {
            return None;
        }
        let text = String::from_utf8_lossy(&self.line);
        let mut label = "REDACTED";
        for segment in text.split([';', '|', '&', '(', ')']) {
            let words: Vec<_> = segment.split_ascii_whitespace().collect();
            for (i, word) in words.iter().enumerate() {
                let args = &words[i + 1..];
                let cmd = word.rsplit('/').next().unwrap_or(word);
                if cmd == "mkfs" || cmd.starts_with("mkfs.") {
                    label = "MKFS";
                }
                if cmd == "chmod" && args.iter().any(|v| matches!(*v, "777" | "0777")) {
                    label = "CHMOD_777";
                }
                if cmd == "rm"
                    && args
                        .iter()
                        .any(|v| v.starts_with('-') && (v.contains('r') || v.contains('R')))
                    && args.iter().any(|v| v.starts_with('-') && v.contains('f'))
                {
                    label = "RM_RECURSIVE_FORCE";
                }
            }
        }
        self.line.clear();
        Some(label)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fragmented_and_edited_commands() {
        let mut audit = InputAudit::default();
        let labels: Vec<_> =
            b"sudo rm -rx\x7ff /\r\n/sbin/mkfs.ext4 disk\nchmod -R 0777 path\recho secret\r"
                .iter()
                .filter_map(|b| audit.observe(*b).unwrap())
                .collect();
        assert_eq!(
            labels,
            ["RM_RECURSIVE_FORCE", "MKFS", "CHMOD_777", "REDACTED"]
        );
    }
}
