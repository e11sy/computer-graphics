use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Object, Reflect};

#[wasm_bindgen]
pub fn make_point(x: f32, y: f32, z: f32) -> Float32Array {
    Float32Array::from(&[x,y,z][..])
}

#[wasm_bindgen]
pub fn make_polyline(coords: &[f32]) -> Float32Array {
    assert!(coords.len() % 3 == 0, "coords length must be multiple of 3");
    Float32Array::from(coords)
}

#[wasm_bindgen]
pub fn make_contour(coords: &[f32]) -> Float32Array {
    assert!(coords.len() >= 6 && coords.len() % 3 == 0, "need at least 2 points");
    let n = coords.len();
    let same = coords[0]==coords[n-3] && coords[1]==coords[n-2] && coords[2]==coords[n-1];
    if same { return Float32Array::from(coords); }
    let mut out = coords.to_vec();
    out.extend_from_slice(&coords[0..3]);
    Float32Array::from(out.as_slice())
}

#[wasm_bindgen]
pub fn make_point_matrix(rows: u32, cols: u32, dx: f32, dy: f32, dz: f32) -> Float32Array {
    let mut out = Vec::<f32>::with_capacity((rows*cols*3) as usize);
    for r in 0..rows {
        for c in 0..cols {
            out.push(c as f32 * dx);
            out.push(r as f32 * dy);
            out.push(r as f32 * dz);
        }
    }
    Float32Array::from(out.as_slice())
}

#[wasm_bindgen]
pub fn make_marker(x: f32, y: f32, z: f32, size: f32) -> Object {
    let o = Object::new();
    Reflect::set(&o, &"position".into(), &make_point(x,y,z)).unwrap();
    Reflect::set(&o, &"size".into(), &JsValue::from_f64(size as f64)).unwrap();
    o
}

#[wasm_bindgen]
pub fn make_text_line(x0:f32,y0:f32,z0:f32, x1:f32,y1:f32,z1:f32, text:&str) -> Object {
    let o = Object::new();
    Reflect::set(&o, &"start".into(), &make_point(x0,y0,z0)).unwrap();
    Reflect::set(&o, &"end".into(), &make_point(x1,y1,z1)).unwrap();
    Reflect::set(&o, &"text".into(), &JsValue::from_str(text)).unwrap();
    o
}

#[wasm_bindgen]
pub fn make_square(side: f32) -> Float32Array {
    let s = side/2.0;
    Float32Array::from(&[-s,-s,0.0,  s,-s,0.0,  s, s,0.0,  -s, s,0.0][..])
}
