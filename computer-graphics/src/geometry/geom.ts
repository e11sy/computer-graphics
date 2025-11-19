let modPromise: Promise<typeof import("../../wasm/geom-core/pkg/geom_core")> | null = null;

export async function loadGeom() {
  if (!modPromise) {
    // Import the module
    const mod = await import("../../wasm/geom-core/pkg/geom_core");
    // Call the default export to actually initialize WASM
    await mod.default();
    modPromise = Promise.resolve(mod);
  }
  return modPromise;
}
