//! What a folder on the dock shows when clicked. A line is opened by its fingerprint, read again
//! from the folder, so the page never says what to run.

use std::os::windows::fs::MetadataExt;
use std::path::Path;

use serde::Serialize;

use super::jumplist::{fingerprint, Link};

/// A folder can hold thousands of things, and the card is for reaching the first few.
pub const STACK_LIMIT: usize = 50;

const HIDDEN: u32 = 0x2;
const SYSTEM: u32 = 0x4;

#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub name: String,
    pub path: String,
    pub folder: bool,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Row {
    pub id: String,
    pub label: String,
    pub folder: bool,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Stack {
    pub items: Vec<Row>,
    /// There's more in the folder than is shown.
    pub more: bool,
}

/// Folders first, then by name, as File Explorer lists them; and only as many as fit.
pub fn arranged(mut found: Vec<Found>) -> (Vec<Found>, bool) {
    found.sort_by_key(|f| (!f.folder, f.name.to_lowercase()));
    let more = found.len() > STACK_LIMIT;
    found.truncate(STACK_LIMIT);
    (found, more)
}

/// How a thing in a folder is named: a shortcut without its extension, as Windows shows it.
pub fn shown_name(file: &str) -> &str {
    file.len().checked_sub(4).filter(|&at| file.is_char_boundary(at) && file[at..].eq_ignore_ascii_case(".lnk")).map_or(file, |at| &file[..at])
}

pub fn link_of(found: &Found) -> Link {
    Link { title: found.name.clone(), path: found.path.clone(), icon: found.path.clone(), ..Default::default() }
}

/// What the folder holds that File Explorer would show, arranged.
pub fn read(folder: &str) -> (Vec<Found>, bool) {
    let Ok(files) = std::fs::read_dir(Path::new(folder)) else { return (Vec::new(), false) };
    arranged(
        files
            .flatten()
            .filter_map(|f| {
                let meta = f.metadata().ok()?;
                if meta.file_attributes() & (HIDDEN | SYSTEM) != 0 {
                    return None;
                }
                let file = f.file_name().to_string_lossy().into_owned();
                Some(Found { name: shown_name(&file).to_string(), path: f.path().to_string_lossy().into_owned(), folder: meta.is_dir() })
            })
            .collect(),
    )
}

pub fn stack_of(found: &[Found], more: bool) -> Stack {
    Stack { items: found.iter().map(|f| Row { id: fingerprint(&link_of(f)), label: f.name.clone(), folder: f.folder }).collect(), more }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(name: &str, folder: bool) -> Found {
        Found { name: name.into(), path: format!(r"C:\x\{name}"), folder }
    }

    #[test]
    fn folders_come_first_then_names_whatever_their_case() {
        let (rows, more) = arranged(vec![found("b.txt", false), found("Zed", true), found("A.txt", false), found("alpha", true)]);
        assert_eq!(rows.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["alpha", "Zed", "A.txt", "b.txt"]);
        assert!(!more);
    }

    #[test]
    fn a_big_folder_stops_at_the_limit_and_says_so() {
        let (rows, more) = arranged((0..STACK_LIMIT + 1).map(|i| found(&format!("{i:03}"), false)).collect());
        assert_eq!(rows.len(), STACK_LIMIT);
        assert!(more);
        let (rows, more) = arranged((0..STACK_LIMIT).map(|i| found(&format!("{i:03}"), false)).collect());
        assert_eq!(rows.len(), STACK_LIMIT);
        assert!(!more);
    }

    #[test]
    fn a_shortcut_shows_without_its_extension() {
        assert_eq!(shown_name("Game.LNK"), "Game");
        assert_eq!(shown_name("notes.txt"), "notes.txt");
        assert_eq!(shown_name("é"), "é");
    }

    #[test]
    fn a_line_is_known_by_the_fingerprint_a_menu_would_give_it() {
        let f = found("a.txt", false);
        let stack = stack_of(std::slice::from_ref(&f), false);
        assert_eq!(stack.items[0].id, fingerprint(&link_of(&f)));
        assert_eq!(stack.items[0].label, "a.txt");
    }

    #[test]
    fn a_folder_that_cant_be_read_is_simply_empty() {
        assert_eq!(read(r"C:\no\such\folder").0.len(), 0);
    }
}
