//! Live screen capture of the region behind the dock, through Windows.Graphics.Capture.
//! Windows only delivers frames when the screen changes, so a still desktop costs nothing.

use crate::util::lock;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Instant;

use windows::core::{factory, Interface};
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_BOX, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};

/// About 30 frames a second is plenty for what moves behind a dock.
const MIN_FRAME_MS: u64 = 33;

#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Keeps `region` inside a monitor of the given size, or None when nothing is left.
pub fn crop(region: Region, monitor: (i32, i32)) -> Option<Region> {
    let (left, top) = (region.x.max(0), region.y.max(0));
    let (right, bottom) = ((region.x + region.w).min(monitor.0), (region.y + region.h).min(monitor.1));
    (right > left && bottom > top).then_some(Region { x: left, y: top, w: right - left, h: bottom - top })
}

/// Frame bytes: width and height as little-endian u32s, then the BGRA rows with no padding.
pub fn pack(w: u32, h: u32, stride: usize, bytes_per_pixel: usize, src: &[u8]) -> Vec<u8> {
    let row = w as usize * bytes_per_pixel;
    let mut out = Vec::with_capacity(8 + row * h as usize);
    out.extend_from_slice(&w.to_le_bytes());
    out.extend_from_slice(&h.to_le_bytes());
    for y in 0..h as usize {
        out.extend_from_slice(&src[y * stride..y * stride + row]);
    }
    out
}

#[derive(Default)]
pub struct FrameFilter {
    last_hash: Option<u64>,
    next_due: u64,
}

impl FrameFilter {
    pub fn changed(&mut self, bytes: &[u8]) -> bool {
        let mut hash = 0xcbf29ce484222325u64;
        for chunk in bytes.chunks(8) {
            let mut word = [0u8; 8];
            word[..chunk.len()].copy_from_slice(chunk);
            hash = (hash ^ u64::from_le_bytes(word)).wrapping_mul(0x100000001b3);
        }
        let changed = self.last_hash != Some(hash);
        self.last_hash = Some(hash);
        changed
    }

    pub fn due(&mut self, now_ms: u64) -> bool {
        if now_ms < self.next_due {
            return false;
        }
        self.next_due = now_ms + MIN_FRAME_MS;
        true
    }
}

static REGION: Mutex<Region> = Mutex::new(Region { x: 0, y: 0, w: 0, h: 0 });
/// The newest frame, waiting for the page to collect it.
static LATEST: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static START: LazyLock<Instant> = LazyLock::new(Instant::now);

pub fn set_region(region: Region) -> bool {
    let mut current = lock(&REGION);
    let changed = *current != region;
    *current = region;
    changed
}

pub fn take_latest() -> Vec<u8> {
    std::mem::take(&mut *lock(&LATEST))
}

struct Staging {
    texture: ID3D11Texture2D,
    size: (i32, i32),
}

/// One copy of what a frame needs, touched only by the capture thread pool.
struct Worker {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: Option<Staging>,
    filter: FrameFilter,
    monitor: (i32, i32),
    origin: (i32, i32),
    notify: Box<dyn Fn() + Send>,
}

// The device is created multithreaded-safe and only used under the worker's mutex.
unsafe impl Send for Worker {}

impl Worker {
    fn staging_for(&mut self, w: i32, h: i32) -> windows::core::Result<ID3D11Texture2D> {
        if let Some(s) = &self.staging {
            if s.size == (w, h) {
                return Ok(s.texture.clone());
            }
        }
        let desc = D3D11_TEXTURE2D_DESC {
            Width: w as u32,
            Height: h as u32,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            ..Default::default()
        };
        let mut texture = None;
        unsafe { self.device.CreateTexture2D(&desc, None, Some(&mut texture))? };
        let texture = texture.expect("CreateTexture2D gave no texture");
        self.staging = Some(Staging { texture: texture.clone(), size: (w, h) });
        Ok(texture)
    }

    fn on_frame(&mut self, source: &ID3D11Texture2D) -> windows::core::Result<()> {
        let region = *lock(&REGION);
        let relative = Region { x: region.x - self.origin.0, y: region.y - self.origin.1, ..region };
        let Some(r) = crop(relative, self.monitor) else { return Ok(()) };
        let staging = self.staging_for(r.w, r.h)?;
        let area = D3D11_BOX {
            left: r.x as u32,
            top: r.y as u32,
            front: 0,
            right: (r.x + r.w) as u32,
            bottom: (r.y + r.h) as u32,
            back: 1,
        };
        unsafe {
            self.context.CopySubresourceRegion(&staging, 0, 0, 0, 0, source, 0, Some(&area));
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            let stride = mapped.RowPitch as usize;
            let bytes = std::slice::from_raw_parts(mapped.pData as *const u8, stride * r.h as usize);
            let out = pack(r.w as u32, r.h as u32, stride, 4, bytes);
            self.context.Unmap(&staging, 0);
            if self.filter.changed(&out[8..]) {
                *lock(&LATEST) = out;
                (self.notify)();
            }
        }
        Ok(())
    }
}

/// The live session. Dropping it stops everything.
pub struct Session {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    token: i64,
    window: HWND,
}

// Windows' capture objects are agile; the window handle is only a number here.
unsafe impl Send for Session {}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            let _ = SetWindowDisplayAffinity(self.window, WDA_NONE);
        }
        let _ = self.pool.RemoveFrameArrived(self.token);
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

fn create_device() -> windows::core::Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice)> {
    unsafe {
        let mut device = None;
        let mut context = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
        let device: ID3D11Device = device.expect("no device");
        let dxgi: IDXGIDevice = device.cast()?;
        let winrt: IDirect3DDevice = CreateDirect3D11DeviceFromDXGIDevice(&dxgi)?.cast()?;
        Ok((device, context.expect("no context"), winrt))
    }
}

/// Starts capturing the monitor `window` is on. `window` is kept out of its own capture,
/// which is what stops the dock seeing faint copies of its own tiles.
pub fn start(window: HWND, notify: Box<dyn Fn() + Send>) -> windows::core::Result<Session> {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let _ = *START;
    let (device, context, winrt) = create_device()?;
    let monitor = unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTOPRIMARY) };
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    let _ = unsafe { GetMonitorInfoW(monitor, &mut info) };
    let origin = (info.rcMonitor.left, info.rcMonitor.top);
    let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
    let item: GraphicsCaptureItem = unsafe { interop.CreateForMonitor(monitor)? };
    let size = item.Size()?;

    unsafe { SetWindowDisplayAffinity(window, WDA_EXCLUDEFROMCAPTURE)? };

    // The session's drop puts the dock back in captures, but only once there is a session.
    let session = (|| -> windows::core::Result<Session> {
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&winrt, DirectXPixelFormat::B8G8R8A8UIntNormalized, 1, size)?;
        let worker = Arc::new(Mutex::new(Worker {
            device,
            context,
            staging: None,
            filter: FrameFilter::default(),
            monitor: (size.Width, size.Height),
            origin,
            notify,
        }));
        let token = pool.FrameArrived(&TypedEventHandler::new(move |pool: windows::core::Ref<'_, Direct3D11CaptureFramePool>, _| {
            let Some(pool) = pool.as_ref() else { return Ok(()) };
            // Always collected, or the pool stops delivering.
            let frame = pool.TryGetNextFrame()?;
            let mut worker = lock(&worker);
            if worker.filter.due(START.elapsed().as_millis() as u64) {
                let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
                let source: ID3D11Texture2D = unsafe { access.GetInterface()? };
                let _ = worker.on_frame(&source);
            }
            Ok(())
        }))?;

        let session = pool.CreateCaptureSession(&item)?;
        let _ = session.SetIsCursorCaptureEnabled(false);
        let _ = session.SetIsBorderRequired(false);
        session.StartCapture()?;
        Ok(Session { session, pool, token, window })
    })();
    if session.is_err() {
        unsafe {
            let _ = SetWindowDisplayAffinity(window, WDA_NONE);
        }
    }
    session
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_are_skipped_when_unchanged() {
        let mut f = FrameFilter::default();
        let a = vec![7u8; 4096];
        assert!(f.changed(&a));
        assert!(!f.changed(&a));
    }

    #[test]
    fn a_change_anywhere_gets_through() {
        let mut f = FrameFilter::default();
        let mut a = vec![0u8; 4096];
        assert!(f.changed(&a));
        a[2048] = 9;
        assert!(f.changed(&a));
    }

    #[test]
    fn a_small_change_in_the_last_row_gets_through() {
        let mut f = FrameFilter::default();
        let mut a = vec![0u8; 400 * 60 * 4];
        assert!(f.changed(&a));
        let at = a.len() - 400; // somewhere in the last row
        a[at] = 200;
        assert!(f.changed(&a));
    }

    #[test]
    fn frames_arriving_too_fast_are_dropped() {
        let mut f = FrameFilter::default();
        assert!(f.due(0));
        assert!(!f.due(10));
        assert!(!f.due(32));
        assert!(f.due(34));
        assert!(!f.due(40));
    }

    #[test]
    fn crop_keeps_the_region_inside_the_monitor() {
        let m = (1920, 1080);
        assert_eq!(crop(Region { x: 100, y: 990, w: 800, h: 60 }, m), Some(Region { x: 100, y: 990, w: 800, h: 60 }));
        assert_eq!(crop(Region { x: -50, y: 1060, w: 100, h: 60 }, m), Some(Region { x: 0, y: 1060, w: 50, h: 20 }));
        assert_eq!(crop(Region { x: 3000, y: 0, w: 10, h: 10 }, m), None);
    }

    #[test]
    fn frame_bytes_carry_their_size() {
        let out = pack(2, 1, 8, 4, &[1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9]);
        assert_eq!(&out[..8], &[2, 0, 0, 0, 1, 0, 0, 0]);
        assert_eq!(&out[8..], &[1, 2, 3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn pack_skips_row_padding() {
        // Rows are 12 bytes apart though only 8 hold pixels.
        let src = [1, 1, 1, 1, 2, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3, 4, 4, 4, 4, 0, 0, 0, 0];
        let out = pack(2, 2, 12, 4, &src);
        assert_eq!(&out[8..], &[1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
    }
}
