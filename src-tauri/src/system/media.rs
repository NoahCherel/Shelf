//! What's playing in Windows, for the accent that follows the album art (F-035).

/// The cover's most vivid colour, as `#rrggbb`, kept readable on light and dark tiles. None when the
/// cover has no colour worth taking, such as a black and white one.
pub fn accent_from_pixels(rgba: &[u8]) -> Option<String> {
    const BINS: usize = 18;
    let (mut weight, mut sums, mut counts, mut opaque) = ([0f64; BINS], [[0f64; 3]; BINS], [0usize; BINS], 0usize);
    for px in rgba.chunks_exact(4) {
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
    fn an_empty_picture_has_no_accent() {
        assert_eq!(accent_from_pixels(&[]), None);
    }
}
