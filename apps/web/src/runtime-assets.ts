// Configure before the lazily imported sketch editor registers its fonts.
export const runtimeAssetBase = new URL(`${import.meta.env.BASE_URL}runtime/`, document.baseURI)
  .href;
Object.assign(window, { EXCALIDRAW_ASSET_PATH: `${runtimeAssetBase}excalidraw-ofl-v1/` });
export const dracoDecoderPath = `${runtimeAssetBase}draco/1.5.5/`;
