// What a Moby slot is made of that the SCENE does not say.
//
// The eleven slot scenes in the `slots` pack declare no `ImagePath` and no
// `Text` at all: their root is a `XuiScene` wearing a `mobyslot*` visual, and
// that visual's first child is a `XuiImagePresenter` (SizeMode 4) and its third
// a `XuiTextPresenter` - both of which draw the OWNER's properties, and the
// owner is the scene, which the console's slot class fills in code [SCENE].
//
// The pictures are all in the archive. `slots/` carries BlankGreen.jpg,
// Games.jpg, Music.jpg, Photos.jpg, Videos.jpg, TrayBackground.JPG and eight
// icons, and dash.xex names every one of them as a wide literal in a single
// .rdata cluster, 0x9202a064-0x9202a2bc, in the emission order of the slot
// classes at 0x92029c60 [CODE]:
//
//   SignedOutGroup UserGroup Avatar BlankGreen.jpg | Games.jpg
//   icon_gamelib.png | icon_hddvd.png | icon_disc.png TrayBackground.jpg |
//   icon_settings.png | DiscIcon.png | Videos.jpg icon_videolib.png |
//   wmc_logo.png | Music.jpg icon_musiclib.png | Photos.jpg icon_picturelib.png
//
// against the classes GamerCardSlotScene, GamesSlotScene, HdDvdTraySlotScene,
// SettingsSlotScene, TraySlotScene, VideoSlotScene, MediaCenterSlotScene,
// MusicSlotScene, PhotosSlotScene.
//
// **The pairing below is INFERRED from that adjacency and from the file names,
// not from a disassembled store**, and every row says so in
// `__dash.nxe.slotArt`. What it is NOT is invented content: every file is in
// the archive, hash-matched from the pack, and a row whose file the manifest
// does not carry is dropped and reported. The five slots with an icon and no
// background of their own take `BlankGreen.jpg`, which is the only background
// left in the cluster and which is the colour the footage shows on those
// panels [FRAME nxe-9199-YrtwSj1f6aY/f0483].
export interface SlotArt {
  /** The slot's own background, drawn by the visual's primary presenter. */
  image: string;
  /** The big icon, drawn by the scene's own `imgIcon` presenter. */
  icon: string | null;
  /** Which half of the binding is a reading rather than a literal pairing. */
  inferred: string;
}

export const SLOT_ART: Readonly<Record<string, SlotArt>> = {
  'slots/TraySlotScene.xur': { image: 'TrayBackground.JPG', icon: 'icon_disc.png', inferred: 'literals adjacent in the cluster' },
  'slots/GamerCardSlotScene.xur': { image: 'BlankGreen.jpg', icon: null, inferred: 'BlankGreen is the only background left' },
  'slots/GamesSlotScene.xur': { image: 'Games.jpg', icon: 'icon_gamelib.png', inferred: 'literals adjacent in the cluster' },
  'slots/VideoSlotScene.xur': { image: 'Videos.jpg', icon: 'icon_videolib.png', inferred: 'literals adjacent in the cluster' },
  'slots/MusicSlotScene.xur': { image: 'Music.jpg', icon: 'icon_musiclib.png', inferred: 'literals adjacent in the cluster' },
  'slots/PhotosSlotScene.xur': { image: 'Photos.jpg', icon: 'icon_picturelib.png', inferred: 'literals adjacent in the cluster' },
  'slots/MediaCenterSlotScene.xur': { image: 'BlankGreen.jpg', icon: 'wmc_logo.png', inferred: 'BlankGreen is the only background left' },
  'slots/MediaRoomSlotScene.xur': { image: 'BlankGreen.jpg', icon: null, inferred: 'BlankGreen is the only background left' },
  'slots/HdDvdTraySlotScene.xur': { image: 'BlankGreen.jpg', icon: 'icon_hddvd.png', inferred: 'BlankGreen is the only background left' },
  'slots/SettingsSlotScene.xur': { image: 'BlankGreen.jpg', icon: 'icon_settings.png', inferred: 'BlankGreen is the only background left' },
};

/**
 * The disc tray's caption is DEVICE STATE, exactly as in Blades: the console
 * picks it from the drive state, and with an empty tray it is
 * `dashcomm/dashStrings.xus[129]` "Open Tray" (the same table also carries
 * [122] "Close Tray", [123] "Closing", [130] "Opening", [132] "Reading", and
 * [21]/[23] for the HD-DVD drive). The state assumed is the one the footage is
 * in and the shell's default - no disc - which is why the front panel reads
 * "Open Tray" and not the XML's own slot name "Disk in Tray".
 */
export const TRAY_CAPTION = { pack: 'dashcomm', table: 'dashStrings.xus', empty: 129, hdDvdEmpty: 23 };
export const TRAY_SCENES: Readonly<Record<string, number>> = {
  'slots/TraySlotScene.xur': TRAY_CAPTION.empty,
  'slots/HdDvdTraySlotScene.xur': TRAY_CAPTION.hdDvdEmpty,
};
