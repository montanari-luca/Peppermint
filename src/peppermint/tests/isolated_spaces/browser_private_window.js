/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_private_windows_are_left_alone() {
  await createSpace("Isolated");
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  await new Promise(resolve => win.setTimeout(resolve, 1000));
  Assert.equal(isolation(win), null, "No isolation runs in a private window");
  Assert.equal(
    Isolated.resolveNewTabContainer(win.gZenWorkspaces, {}),
    null,
    "and its tabs keep the private container"
  );
  await BrowserTestUtils.closeWindow(win);
});
