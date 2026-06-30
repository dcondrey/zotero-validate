window.addEventListener("load", function () {
  var PREF_BRANCH = "extensions.zotero.reference-validator.";

  var inputs = document.querySelectorAll("[data-pref]");
  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    var key = PREF_BRANCH + input.getAttribute("data-pref");
    var type = input.getAttribute("type");

    var val = Zotero.Prefs.get(key);
    if (type === "checkbox") {
      input.checked = !!val;
    } else if (val !== undefined && val !== null) {
      input.value = val;
    }

    var event = type === "checkbox" ? "change" : "input";
    input.addEventListener(
      event,
      (function (inputEl, prefKey, inputType) {
        return function () {
          if (inputType === "checkbox") {
            Zotero.Prefs.set(prefKey, inputEl.checked);
          } else if (inputType === "number") {
            Zotero.Prefs.set(prefKey, parseInt(inputEl.value, 10));
          } else {
            Zotero.Prefs.set(prefKey, inputEl.value);
          }

          // Sync crossref email to openalex and unpaywall
          if (prefKey === PREF_BRANCH + "sources.crossref.email") {
            Zotero.Prefs.set(
              PREF_BRANCH + "sources.openalex.email",
              inputEl.value,
            );
          }
        };
      })(input, key, type),
    );
  }

  var clearCacheBtn = document.getElementById("clear-cache-btn");
  var clearStatus = document.getElementById("clear-cache-status");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", function () {
      clearCacheBtn.disabled = true;
      clearCacheBtn.textContent = "Clearing...";

      var libPath =
        Zotero.DataDirectory.dir + "/reference-validator-library.json";
      IOUtils.exists(libPath)
        .then(function (exists) {
          if (exists) {
            return IOUtils.write(libPath, new TextEncoder().encode("[]"));
          }
        })
        .then(function () {
          clearCacheBtn.textContent = "Clear Validation Cache";
          clearCacheBtn.disabled = false;
          if (clearStatus) {
            clearStatus.textContent = " Cache cleared.";
            setTimeout(function () {
              clearStatus.textContent = "";
            }, 3000);
          }
        })
        .catch(function () {
          clearCacheBtn.textContent = "Clear Validation Cache";
          clearCacheBtn.disabled = false;
          if (clearStatus) {
            clearStatus.textContent = " Error clearing cache.";
          }
        });
    });
  }
});
