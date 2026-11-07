window.moduleHost = {
  // Stores references to loaded modules if you need to clean them up later
  loadedModules: {},

  // Case A: Load from raw byte array (NuPkg)
  loadScriptFromBytes2: async function (id, dotNetBytes) {
    // 1. Convert .NET byte array to JS Uint8Array
    const byteArray = new Uint8Array(dotNetBytes);

    // 2. Create a Blob with the JavaScript MIME type
    const blob = new Blob([byteArray], { type: 'application/javascript' });

    // 3. Generate a temporary, executable unique URL
    const blobUrl = URL.createObjectURL(blob);

    try {
      // 4. Natively import the module and fire the initialization
      const module = await import(blobUrl);
      if (module && typeof module.init === 'function') {
        module.init();
      }

      // Track it for reference
      this.loadedModules[id] = module;
    } catch (error) {
      console.error(`Failed to load dynamic JS module byte stream [${id}]:`, error);
    } finally {
      // Clean up the object URL allocation from browser memory
      URL.revokeObjectURL(blobUrl);
    }
  },

  // Case B: Load from a traditional hosted static URL
  loadScriptFromUrl: async function (id, url) {
    try {
      // Native ES import directly from the host web server
      const module = await import(url);
      if (module && typeof module.init === 'function') {
        module.init();
      }
      this.loadedModules[id] = module;
    } catch (error) {
      console.error(`Failed to load dynamic JS module from URL [${url}]:`, error);
    }
  },

  element: function (id, tag) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      document.head.appendChild(el);
    }
    return el;
  },

  setStyleText: function (id, css) {
    // FIXED: Added 'this.' prefix to find the element function properly
    this.element(id, 'style').textContent = css;
  },

  // dll modules: the CSS is a normal file at a url.
  setStyleLink: function (id, href) {
    // FIXED: Added 'this.' prefix to find the element function properly
    var el = this.element(id, 'link');
    el.rel = 'stylesheet';
    el.href = href;
  },

  removeStyle: function (id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  },

  loadScriptFromBytes: async function (id, dotNetBytes) {
    const byteArray = new Uint8Array(dotNetBytes);
    const blob = new Blob([byteArray], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const module = await import(blobUrl);
      if (module && typeof module.init === 'function') {
        module.init();
      }
      // Track array reference per module ID
      if (!this.loadedModules[id]) this.loadedModules[id] = [];
      this.loadedModules[id].push(module);
    } catch (error) {
      console.error(`Error loading virtual JS module script [${id}]:`, error);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  },

  // NEW: Completely clears JavaScript contexts and event bindings 
  unloadModules: function () {
    for (const id in this.loadedModules) {
      this.loadedModules[id].forEach(module => {
        if (module && typeof module.dispose === 'function') {
          // If your modules create event listeners, dispose them here cleanly
          module.dispose();
        }
      });
    }
    // Wipe memory allocation references
    this.loadedModules = {};
    console.log("🧹 Virtual Module scripts and variables successfully un-injected.");
  }
};
