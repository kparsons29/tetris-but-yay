importScripts("./cc_tbp.js");

wasm_bindgen("./cc_tbp_bg.wasm")
  .then(() => wasm_bindgen.start())
  .catch((error) => {
    self.postMessage({
      type: "error",
      message: "Cold Clear failed to initialize: " + String(error)
    });
  });
