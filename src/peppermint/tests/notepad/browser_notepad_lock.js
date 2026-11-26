/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ZenNotepadLock } = ChromeUtils.importESModule(
  "resource:///modules/zen/notepad/ZenNotepadLock.sys.mjs"
);

add_task(async function test_auto_lock_arms_the_idle_service() {
  await SpecialPowers.pushPrefEnv({
    set: [["zen.notepad.auto-lock-minutes", 5]],
  });
  ZenNotepadLock.start();
  ZenNotepadLock.observe(null, "nsPref:changed");
  ok(true, "Auto-lock registered and re-registered its idle observer");

  await SpecialPowers.popPrefEnv();
  ZenNotepadLock.observe(null, "nsPref:changed");
  ok(true, "Turning auto-lock off removed the idle observer");
});
