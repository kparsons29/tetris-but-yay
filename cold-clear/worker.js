importScripts("./cc_tbp.js");

wasm_bindgen("./cc_tbp_bg.wasm")
  .then(() => wasm_bindgen._web_worker_entry_point(self))
  .catch((error) => {
    self.postMessage({
      type: "error",
      message: "Cold Clear search worker failed to initialize: " + String(error)
    });
  });
