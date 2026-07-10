workspace {
  model {
    properties {
      "structurizr.groupSeparator" "/"
    }
    author = Person "Author" "Writes MyST Markdown books; edits prose, math, and runnable code cells in VS Code." {
    }
    group "Platform" {
      vs_code_notebook_host = SoftwareSystem "VS Code Notebook Host" "The editor: Notebook API (controller, serializer, renderer registration), workspace state, QuickPick, Tasks." {
      }
    }
    group "External" {
      python_environment___jupyter_server = SoftwareSystem "Python environment + Jupyter server" "The chosen interpreter. MyST launches `jupyter server` here and runs a kernel; ipykernel + jupyter-server are auto-installed if missing." {
      }
      zotero___citation_picker = SoftwareSystem "Zotero + Citation Picker" "Optional. The mblode.zotero picker + Better BibTeX CAYW endpoint supply {cite} keys." {
      }
      python_extension__ms_python_python_ = SoftwareSystem "Python extension (ms-python.python)" "Provides the Environments API used to discover Python interpreters (venv, conda, pyenv, poetry, system)." {
      }
    }
    group "Internal" {
      myst_notebook = SoftwareSystem "MyST Notebook" "VS Code extension: opens MyST .md in the notebook editor with rendered prose/math and executes code cells against a self-owned Jupyter kernel." {
        extension_host_bundle = Container "Extension Host Bundle" "The main bundle (dist/extension.js): registers the notebook controller, serializer, renderer, commands, and keybindings; orchestrates kernel resolution and cell execution." {
          technology "TypeScript, VS Code API, esbuild"
          authoring_glue = Component "Authoring glue" "Authoring ergonomics: enter-split, Alt+Enter newline, Ctrl+D delete, cell insertion, shorthand run/show fences, input-collapse fallback, math palette + linter, focused chrome, Zotero setup." {
            technology "enterSplit, insertCells, mathPalette, workspaceChrome, zoteroConfig…"
          }
          envsetup = Component "envSetup" "Probes for ipykernel + jupyter-server in the chosen interpreter and offers a one-click install (Tasks API) of whatever is missing." {
            technology "child_process, Tasks API"
          }
          extension_ts__activate_ = Component "extension.ts (activate)" "Activation entrypoint: registers the serializer, controller, renderer, commands, keybindings, and threads workspaceState." {
            technology "VS Code activation"
          }
          mystcontroller = Component "MystController" "NotebookController: on run, resolves a kernel session (discover → rank → pick → ensure deps → start), caches it per notebook, and streams cell outputs incrementally. Handles interrupt, restart, and dead-kernel recovery." {
            technology "NotebookController"
          }
          pythonenvservice = Component "pythonEnvService" "Discovers Python environments via the ms-python Environments API; maps them to plain KernelSpecInfo (no ms-python types leak past this seam)." {
            technology "ms-python API wrapper"
          }
          mystserializer = Component "MystSerializer" "NotebookSerializer: MyST .md ⇄ NotebookData cells with a lossless round-trip guarantee." {
            technology "NotebookSerializer"
          }
          kernelsession = Component "kernelSession" "The KernelSession seam: launches a Jupyter server in the chosen env, starts a kernel, and bridges execute IOPub messages into a streamed AsyncIterable. Kills the server on dispose." {
            technology "child_process, @jupyterlab/services (WebSocket)"
          }
          kernelpicker = Component "kernelPicker" "Quick-pick UI over ranked environments; returns the chosen KernelSpecInfo." {
            technology "QuickPick"
          }
        }
        pure_core_library = Container "Pure Core Library" "Pure, VS Code-free logic (src/core): block splitting, MyST serialization, shorthand expansion, env ranking, and kernel-resolution decision. Fully unit-tested with vitest." {
          technology "TypeScript (no VS Code deps), vitest"
        }
        markup_renderer_bundle = Container "Markup Renderer Bundle" "Separately-loaded bundle (dist/renderer/mystRenderer.js) running in the notebook output sandbox: extends VS Code's markdown-it with MyST directives/roles and KaTeX math. KaTeX CSS and fonts are vendored inline — no CDN required." {
          technology "TypeScript, markdown-it, KaTeX"
        }
      }
    }
    author -> vs_code_notebook_host "Authors MyST books; edits and runs code cells" ""
    vs_code_notebook_host -> markup_renderer_bundle "Renders MyST markup & math for notebook markup cells" ""
    myst_notebook -> vs_code_notebook_host "Runs inside, extends with a notebook type, controller & renderer" ""
    myst_notebook -> python_environment___jupyter_server "Launches a Jupyter server & runs a kernel; installs ipykernel/jupyter-server if missing" ""
    myst_notebook -> python_extension__ms_python_python_ "Discovers Python environments via the Environments API" ""
    myst_notebook -> zotero___citation_picker "Configures & invokes to insert {cite} keys (optional)" ""
    extension_host_bundle -> vs_code_notebook_host "Registers the controller, serializer & renderer into" ""
    extension_host_bundle -> python_environment___jupyter_server "Spawns jupyter server & drives the kernel over WebSocket" ""
    extension_host_bundle -> pure_core_library "Reuses pure serialization, ranking & resolution logic" ""
    extension_host_bundle -> python_extension__ms_python_python_ "Discovers interpreters via the Environments API" ""
    extension_host_bundle -> zotero___citation_picker "Configures & triggers the citation picker (optional)" ""
    authoring_glue -> pure_core_library "Expands run/show shorthand via pure logic" ""
    authoring_glue -> zotero___citation_picker "Configures & triggers the citation picker (optional)" ""
    envsetup -> python_environment___jupyter_server "Probes imports & installs missing packages (pip/conda)" ""
    extension_ts__activate_ -> authoring_glue "Wires up authoring commands & keybindings" ""
    extension_ts__activate_ -> mystcontroller "Registers controller, serializer, renderer, commands; threads workspaceState" ""
    extension_ts__activate_ -> mystserializer "Registers" ""
    mystcontroller -> pythonenvservice "Lists discovered environments" ""
    mystcontroller -> pure_core_library "Applies the resolve-order decision (use / pick / needs-deps / none)" ""
    mystcontroller -> kernelpicker "Prompts the user to choose an environment" ""
    mystcontroller -> kernelsession "Starts a kernel session & streams cell output" ""
    mystcontroller -> envsetup "Ensures ipykernel + jupyter-server present" ""
    pythonenvservice -> python_extension__ms_python_python_ "Reads the Environments API" ""
    mystserializer -> pure_core_library "Serializes MyST .md ⇄ cells using the pure block splitter" ""
    kernelsession -> python_environment___jupyter_server "Spawns jupyter server & drives the kernel over WebSocket" ""
    kernelpicker -> pure_core_library "Ranks & labels environments for the quick-pick" ""
  }
  views {
    systemContext myst_notebook {
      description "MyST Notebook and the people & systems it interacts with"
      include *
      autoLayout
    }
    systemLandscape  {
      include *
      autoLayout
    }
    container myst_notebook {
      description "The two bundles + pure core inside MyST Notebook, and the external systems they touch"
      include *
      autoLayout
    }
    component extension_host_bundle {
      description "Modules inside the extension-host bundle: activation, serialization, kernel orchestration & the discover→pick→ensure→start stack"
      include *
      autoLayout
    }
    styles {
      element "Element" {
        shape "RoundedBox"
      }
      element "Software System" {
        background "#1168bd"
        color "#ffffff"
      }
      element "Container" {
        background "#438dd5"
        color "#ffffff"
      }
      element "Component" {
        background "#85bbf0"
        color "#000000"
      }
      element "Person" {
        background "#08427b"
        color "#ffffff"
        shape "Person"
      }
      element "Infrastructure Node" {
        background "#ffffff"
      }
      element "database" {
        shape "Cylinder"
      }
    }
  }
}