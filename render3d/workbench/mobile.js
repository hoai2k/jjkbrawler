// The phone chrome for the 3D workbench: a bottom toolbar and a sheet.
//
// Nothing here is a second workbench. The panel's four sections are the SAME
// nodes the desktop shows in one column — the same ids, wired once by
// workbench.js — and this module only decides which of them is on screen:
// tap a toolbar job (Scene / Pose / Look / Clips) and that section slides up
// as a bottom sheet over the viewer; tap it again, or the viewer, and it
// drops away. Whether any of this is active at all is the stylesheet's
// media query, read back here from the toolbar's computed display so the
// JS and the CSS cannot disagree about what a phone is.
//
// The one rule: opening the POSE sheet enters edit mode and closing it does
// not leave it — the sheet is where the numbers live, but the dragging
// happens on the viewer, and a mode that died every time the sheet closed
// would make every drag two taps longer.

export function initMobile({ onOpenPose, isPlaying, togglePlay }) {
  const bar = document.getElementById("mobileBar");
  const panel = document.getElementById("panel");
  const tabs = [...panel.querySelectorAll(".ptab")];
  const canvas = document.getElementById("stage");
  bar.hidden = false; // present always; CSS decides whether it displays

  const active = () => getComputedStyle(bar).display !== "none";
  let openTab = null;

  function show(name) {
    openTab = name;
    for (const t of tabs) t.classList.toggle("active", t.dataset.tab === name);
    panel.classList.toggle("open", !!name);
    for (const b of bar.querySelectorAll("button[data-open]")) {
      b.classList.toggle("active", b.dataset.open === name);
    }
    if (name) panel.scrollTop = 0;
  }

  for (const b of bar.querySelectorAll("button[data-open]")) {
    b.onclick = () => {
      const name = b.dataset.open;
      show(openTab === name ? null : name);
      if (openTab === "pose") onOpenPose?.();
    };
  }

  const playBtn = document.getElementById("mobilePlay");
  const syncPlay = () => {
    playBtn.innerHTML = isPlaying()
      ? "⏸<span>Pause</span>" : "▶<span>Play</span>";
  };
  playBtn.onclick = () => { togglePlay(); syncPlay(); };

  // A tap on the viewer closes the sheet — the viewer is what it was covering.
  // Drags (posing a bone, panning) keep the sheet as it is: only a press that
  // moves less than a thumb-width reads as a tap.
  let down = null;
  canvas.addEventListener("pointerdown", (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener("pointerup", (ev) => {
    if (!down || !active() || !openTab) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 12) show(null);
    down = null;
  });

  return {
    get active() { return active(); },
    syncPlay,
    open: show,
  };
}
