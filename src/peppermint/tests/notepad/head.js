/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { OSKeyStoreTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/OSKeyStoreTestUtils.sys.mjs"
);

// The notes key is wrapped by the OS keystore. A throwaway store keeps the
// tests off the profile owner's real keychain item, whose access prompt
// cannot be answered in a headless run and leaves every save hanging.
add_setup(function isolateNotesKeyStore() {
  OSKeyStoreTestUtils.setup();
  registerCleanupFunction(async () => {
    ChromeUtils.importESModule(
      "resource:///modules/zen/notepad/ZenNotepadStore.sys.mjs"
    ).lockNotes();
    await OSKeyStoreTestUtils.cleanup();
  });
});
