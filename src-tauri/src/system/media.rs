//! What's playing in Windows, for the accent that follows the album art (F-035).

use crate::util::lock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, BitmapTransform, ColorManagementMode, ExifOrientationMode};
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
use windows::Storage::Streams::IRandomAccessStreamReference;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

/// The cover's most vivid colour, as `#rrggbb`, kept readable on light and dark tiles. None when the
/// cover has no colour worth taking, such as a black and white one.
pub fn accent_from_pixels(rgba: &[u8]) -> Option<String> {
    const BINS: usize = 18;
    let (mut weight, mut sums, mut counts, mut opaque) = ([0f64; BINS], [[0f64; 3]; BINS], [0usize; BINS], 0usize);
    for px in rgba.as_chunks::<4>().0 {
        if px[3] < 128 {
            continue;
        }
        opaque += 1;
        let rgb = [px[0] as f64, px[1] as f64, px[2] as f64];
        let (h, s, v) = to_hsv(rgb);
        // Greys, near-black and blown-out white say nothing about the cover's colour.
        if s < 0.30 || !(0.25..=0.97).contains(&v) {
            continue;
        }
        let bin = ((h / 20.0) as usize).min(BINS - 1);
        weight[bin] += s * v;
        counts[bin] += 1;
        for (sum, c) in sums[bin].iter_mut().zip(rgb) {
            *sum += c;
        }
    }
    let best = (0..BINS).max_by(|&a, &b| weight[a].total_cmp(&weight[b]))?;
    if counts[best] == 0 || counts[best] * 100 < opaque * 3 {
        return None;
    }
    let n = counts[best] as f64;
    let (h, s, v) = to_hsv(sums[best].map(|sum| sum / n));
    // Readable on light tiles and dark ones alike.
    let [r, g, b] = from_hsv(h, s.max(0.45), v.clamp(0.55, 0.90));
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}

/// Follows the track, reading its cover only when it changes.
#[derive(Default)]
struct AlbumWatch {
    started: bool,
    key: Option<String>,
    colour: Option<String>,
}

impl AlbumWatch {
    /// `key` names the track, None with nothing playing; `read` gets its cover's colour. Gives the colour
    /// to announce, only when it changed.
    fn next(&mut self, key: Option<String>, read: impl FnOnce() -> Option<String>) -> Option<Option<String>> {
        if self.started && key == self.key {
            return None;
        }
        self.started = true;
        let colour = if key.is_some() { read() } else { None };
        self.key = key;
        if colour == self.colour {
            return None;
        }
        self.colour = colour.clone();
        Some(colour)
    }
}

/// Each call to `album_accent_follow` gets a number: a newer one stops the older watch.
static WATCH: AtomicU64 = AtomicU64::new(0);
static CURRENT: Mutex<Option<String>> = Mutex::new(None);
const EVERY: Duration = Duration::from_secs(2);
/// Small is enough for a colour, and quick to decode.
const COVER_SIZE: u32 = 48;

/// The track playing, named by title, artist and album, and its cover.
fn track(manager: &GlobalSystemMediaTransportControlsSessionManager) -> Option<(String, IRandomAccessStreamReference)> {
    let session = manager.GetCurrentSession().ok()?;
    let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let key = format!("{}|{}|{}", props.Title().ok()?, props.Artist().ok()?, props.AlbumTitle().ok()?);
    Some((key, props.Thumbnail().ok()?))
}

/// The cover's pixels, RGBA, `COVER_SIZE` square.
fn cover(thumbnail: &IRandomAccessStreamReference) -> windows::core::Result<Vec<u8>> {
    let stream = thumbnail.OpenReadAsync()?.get()?;
    let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
    let transform = BitmapTransform::new()?;
    transform.SetScaledWidth(COVER_SIZE)?;
    transform.SetScaledHeight(COVER_SIZE)?;
    let data = decoder
        .GetPixelDataTransformedAsync(
            BitmapPixelFormat::Rgba8,
            BitmapAlphaMode::Straight,
            &transform,
            ExifOrientationMode::IgnoreExifOrientation,
            ColorManagementMode::DoNotColorManage,
        )?
        .get()?;
    Ok(data.DetachPixelData()?.to_vec())
}

fn announce(app: &AppHandle, colour: Option<String>) {
    crate::diag::note(&format!("album accent: {}", colour.as_deref().unwrap_or("none")));
    *lock(&CURRENT) = colour.clone();
    let _ = app.emit("album-accent", colour);
}

/// Reads what's playing every few seconds, and the cover only when the track changes.
fn watch(app: AppHandle, mine: u64) {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let mut manager = None;
    let mut album = AlbumWatch::default();
    while WATCH.load(Ordering::SeqCst) == mine {
        if manager.is_none() {
            manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|op| op.get()).ok();
        }
        let (key, thumbnail) = manager.as_ref().and_then(track).unzip();
        let read = || thumbnail.as_ref().and_then(|t| cover(t).ok()).and_then(|pixels| accent_from_pixels(&pixels));
        if let Some(colour) = album.next(key, read) {
            announce(&app, colour);
        }
        std::thread::sleep(EVERY);
    }
}

fn follow(app: &AppHandle, on: bool) {
    let mine = WATCH.fetch_add(1, Ordering::SeqCst) + 1;
    if !on {
        announce(app, None);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || watch(app, mine));
}

/// Settings' Album art accent was picked, or another one was.
#[tauri::command]
pub fn album_accent_follow(app: AppHandle, on: bool) {
    follow(&app, on);
}

#[tauri::command]
pub fn album_accent_current() -> Option<String> {
    lock(&CURRENT).clone()
}

/// Follows the cover from the start when Album art is the saved accent.
pub fn start(app: &AppHandle) {
    let settings = crate::store::load(crate::store::SETTINGS);
    if settings.is_some_and(|s| s["accent"] == "album") {
        follow(app, true);
    }
}

/// Hue in degrees, saturation and value from 0 to 1, from channels from 0 to 255.
fn to_hsv([r, g, b]: [f64; 3]) -> (f64, f64, f64) {
    let (max, min) = (r.max(g).max(b), r.min(g).min(b));
    let delta = max - min;
    let h = if delta == 0.0 {
        0.0
    } else if max == r {
        60.0 * ((g - b) / delta).rem_euclid(6.0)
    } else if max == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        60.0 * ((r - g) / delta + 4.0)
    };
    let s = if max == 0.0 { 0.0 } else { delta / max };
    (h, s, max / 255.0)
}

fn from_hsv(h: f64, s: f64, v: f64) -> [u8; 3] {
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0).rem_euclid(2.0) - 1.0).abs());
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    [r, g, b].map(|channel| ((channel + m) * 255.0).round() as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn picture(parts: &[(usize, [u8; 4])]) -> Vec<u8> {
        parts.iter().flat_map(|&(n, px)| std::iter::repeat_n(px, n).flatten()).collect()
    }

    fn rgb(hex: &str) -> (u8, u8, u8) {
        let at = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap();
        (at(1), at(3), at(5))
    }

    #[test]
    fn a_red_cover_gives_a_red_accent() {
        let (r, g, b) = rgb(&accent_from_pixels(&picture(&[(100, [220, 30, 30, 255])])).unwrap());
        assert!(r > g.saturating_add(100) && r > b.saturating_add(100), "{r} {g} {b}");
    }

    #[test]
    fn the_dominant_vivid_colour_wins_over_a_larger_grey_area() {
        let cover = picture(&[(70, [128, 128, 128, 255]), (30, [20, 90, 230, 255])]);
        let (r, g, b) = rgb(&accent_from_pixels(&cover).unwrap());
        assert!(b > r && b > g, "{r} {g} {b}");
    }

    #[test]
    fn a_black_and_white_cover_has_no_accent() {
        assert_eq!(accent_from_pixels(&picture(&[(50, [0, 0, 0, 255]), (50, [255, 255, 255, 255])])), None);
    }

    #[test]
    fn a_dark_colour_is_lifted_to_stay_readable() {
        let (r, _, _) = rgb(&accent_from_pixels(&picture(&[(100, [90, 10, 10, 255])])).unwrap());
        assert!(r >= 140, "{r}");
    }

    #[test]
    fn transparent_pixels_are_ignored() {
        let cover = picture(&[(90, [230, 20, 20, 0]), (10, [20, 90, 230, 255])]);
        let (r, g, b) = rgb(&accent_from_pixels(&cover).unwrap());
        assert!(b > r && b > g, "{r} {g} {b}");
    }

    #[test]
    fn the_picture_is_read_only_when_the_track_changes() {
        let (mut watch, mut reads) = (AlbumWatch::default(), 0);
        for _ in 0..2 {
            watch.next(Some("a".into()), || {
                reads += 1;
                Some("#112233".into())
            });
        }
        assert_eq!(reads, 1);
    }

    #[test]
    fn nothing_is_announced_when_the_colour_stays_the_same() {
        let mut watch = AlbumWatch::default();
        assert_eq!(watch.next(Some("a".into()), || Some("#112233".into())), Some(Some("#112233".into())));
        assert_eq!(watch.next(Some("b".into()), || Some("#112233".into())), None);
    }

    #[test]
    fn the_music_stopping_announces_no_colour() {
        let mut watch = AlbumWatch::default();
        watch.next(Some("a".into()), || Some("#112233".into()));
        assert_eq!(watch.next(None, || Some("#445566".into())), Some(None));
    }

    #[test]
    fn an_empty_picture_has_no_accent() {
        assert_eq!(accent_from_pixels(&[]), None);
    }
}
