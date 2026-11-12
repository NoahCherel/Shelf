//! The Apps widget's data: pins, open windows, icons, and the Start menu.

mod app_menu;
mod commands;
mod drop;
mod icons;
pub mod history;
pub mod jumplist;
pub mod menu;
pub mod merge;
mod pins;
pub mod pin_widget;
pub mod previews;
pub mod stack;
mod windows;

use commands::SOURCES;
use merge::{merge, AppEntry};

use crate::util::{lock, on_com_thread};

pub use app_menu::*;
pub use commands::*;
pub use drop::*;
pub use windows::{exe_of_pid, start_is_open, store_string, take_foreground_raw, watch_foreground};

pub(crate) fn current() -> Result<Vec<AppEntry>, String> {
    let pins = pins::with_overlay(on_com_thread(pins::list)?);
    let entries = pins::arrange(pins::composed(merge(&pins, windows::list(), windows::foreground())), &pins::order());
    let sources = every_one(&entries).filter_map(|e| Some((e.key.clone(), e.icon_source.clone()?))).collect();
    *lock(&SOURCES) = Some(sources);
    Ok(entries)
}

fn every_one(entries: &[AppEntry]) -> impl Iterator<Item = &AppEntry> {
    entries.iter().flat_map(|e| std::iter::once(e).chain(e.members.iter()))
}

/// Everything on the dock, with the apps inside groups as well as the groups.
pub(crate) fn every_entry() -> Result<Vec<AppEntry>, String> {
    Ok(every_one(&current()?).cloned().collect())
}
