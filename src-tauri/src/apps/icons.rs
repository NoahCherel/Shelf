//! App icons as PNG data URLs, sharp enough for high-DPI docks.

use std::ffi::c_void;
use std::mem::size_of;

use base64::Engine;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HBITMAP,
};
use windows::Win32::UI::Shell::{
    ExtractIconExW, IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO};

/// The dock draws icons up to 60 physical px; 96 stays sharp at higher scales.
const ICON_PX: i32 = 96;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn bitmap_to_png(bitmap: HBITMAP, premultiplied: bool) -> Option<String> {
    let mut bm = BITMAP::default();
    if GetObjectW(bitmap.into(), size_of::<BITMAP>() as i32, Some(&mut bm as *mut BITMAP as *mut c_void)) == 0 {
        return None;
    }
    let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
    if w <= 0 || h <= 0 {
        return None;
    }
    let mut bi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // top-down rows
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut px = vec![0u8; (w * h * 4) as usize];
    let hdc = GetDC(None);
    let lines = GetDIBits(hdc, bitmap, 0, h as u32, Some(px.as_mut_ptr() as *mut c_void), &mut bi, DIB_RGB_COLORS);
    ReleaseDC(None, hdc);
    if lines == 0 {
        return None;
    }
    let has_alpha = px.chunks(4).any(|p| p[3] != 0);
    for p in px.chunks_mut(4) {
        p.swap(0, 2); // BGRA -> RGBA
        if !has_alpha {
            p[3] = 255;
        } else if premultiplied && p[3] != 0 && p[3] != 255 {
            let a = p[3] as u32;
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(&px).ok()?;
    }
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out)))
}

unsafe fn icon_to_png(icon: HICON) -> Option<String> {
    let mut info = ICONINFO::default();
    GetIconInfo(icon, &mut info).ok()?;
    let result = if info.hbmColor.is_invalid() { None } else { bitmap_to_png(info.hbmColor, false) };
    if !info.hbmColor.is_invalid() {
        let _ = DeleteObject(info.hbmColor.into());
    }
    if !info.hbmMask.is_invalid() {
        let _ = DeleteObject(info.hbmMask.into());
    }
    result
}

/// Shortcuts, store apps and programs: the shell knows them all.
unsafe fn from_shell(source: &str) -> Option<String> {
    let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(source), None).ok()?;
    let bitmap = factory
        .GetImage(SIZE { cx: ICON_PX, cy: ICON_PX }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK)
        .ok()?;
    let png = bitmap_to_png(bitmap, true);
    let _ = DeleteObject(bitmap.into());
    png
}

unsafe fn from_exe(exe: &str) -> Option<String> {
    let mut path = [0u16; 260];
    let encoded = wide(exe);
    if encoded.len() <= path.len() {
        path[..encoded.len()].copy_from_slice(&encoded);
        let mut sharp = [HICON::default()];
        let n = PrivateExtractIconsW(&path, 0, ICON_PX, ICON_PX, Some(&mut sharp), None, 0);
        if n != 0 && n != u32::MAX && !sharp[0].is_invalid() {
            let png = icon_to_png(sharp[0]);
            let _ = DestroyIcon(sharp[0]);
            if png.is_some() {
                return png;
            }
        }
    }
    let mut large = HICON::default();
    let n = ExtractIconExW(PCWSTR(encoded.as_ptr()), 0, Some(&mut large), None, 1);
    if n == 0 || large.is_invalid() {
        return None;
    }
    let png = icon_to_png(large);
    let _ = DestroyIcon(large);
    png
}

/// An icon kept in a file at an index, as a shortcut gives it: an .ico, or a program's resources.
unsafe fn from_file_at(file: &str, index: i32) -> Option<String> {
    let encoded = wide(file);
    let mut large = HICON::default();
    let n = ExtractIconExW(PCWSTR(encoded.as_ptr()), index, Some(&mut large), None, 1);
    if n == 0 || large.is_invalid() {
        return None;
    }
    let png = icon_to_png(large);
    let _ = DestroyIcon(large);
    png
}

/// A jump list line's icon, from where its shortcut says, or from the file or folder it opens.
/// Call on a thread with COM initialised.
pub fn jump_icon(spec: &str) -> Option<String> {
    match super::jumplist::icon_spec(spec) {
        Some((file, index)) => unsafe { from_file_at(file, index) }.or_else(|| icon(file)),
        None => icon(spec),
    }
}

/// Call on a thread with COM initialised.
pub fn icon(source: &str) -> Option<String> {
    unsafe { from_shell(source).or_else(|| from_exe(source)) }
}
